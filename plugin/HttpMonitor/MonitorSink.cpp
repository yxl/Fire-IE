#include "StdAfx.h"
#include <Wininet.h>
#include <string>
#pragma comment(lib, "Wininet.lib")

#include "plugin.h"
#include "IEHostWindow.h"
#include "MonitorSink.h"
#include "PluginApp.h"
#include "ScriptablePluginObject.h"

namespace HttpMonitor
{
	// 把以 \0 分隔的 Raw HTTP Header 数据转换成以 \r\n 分隔的 Header
	void HttpRawHeader2CrLfHeader(LPCSTR szRawHeader, CString & strCrLfHeader)
	{
		strCrLfHeader.Empty();

		LPCSTR p = szRawHeader;
		while ( p[0] )
		{
			CString strHeaderLine(p);

			p += strHeaderLine.GetLength() + 1;

			strCrLfHeader += strHeaderLine + _T("\r\n");
		}
	}


	// @todo 有什么用？
	LPWSTR ExtractFieldValue(LPCWSTR szHeader, LPCWSTR szFieldName, LPWSTR * pFieldValue, size_t * pSize )
	{
		LPWSTR r = NULL;

		do 
		{
			// 根据 RFC2616 规定, HTTP field name 不区分大小写
			LPWSTR pStart = StrStrIW( szHeader, szFieldName );
			if ( ! pStart ) break;
			pStart += wcslen(szFieldName);
			while ( L' ' == pStart[0] ) pStart++;		// 跳过开头的空格
			LPWSTR pEnd = StrStrW( pStart, L"\r\n" );
			if ( ( ! pEnd ) || ( pEnd <= pStart ) ) break;

			size_t nSize = pEnd - pStart;
			size_t nBufLen = nSize + 2;		// 留给字符串的 0 结束符
			LPWSTR lpBuffer = (LPWSTR)VirtualAlloc( NULL, nBufLen * sizeof(WCHAR), MEM_COMMIT, PAGE_READWRITE );
			if ( !lpBuffer ) break;

			if (wcsncpy_s( lpBuffer, nBufLen, pStart, nSize))
			{
				VirtualFree( lpBuffer, 0, MEM_RELEASE);
				break;
			}

			* pSize = nBufLen;
			* pFieldValue = lpBuffer;
			r = pEnd;

		} while(false);

		return r;
	}

	CIEHostWindow* MonitorSink::s_pLastIEHostWindow = NULL;

	MonitorSink::MonitorSink()
		: m_pIEHostWindow(NULL)
		, m_bIsSubRequest(TRUE)
	{
	}

	MonitorSink::~MonitorSink()
	{
	}


	void MonitorSink::QueryIEHostWindow()
	{
		m_pIEHostWindow = NULL;
		CComPtr<IWindowForBindingUI> spWindowForBindingUI;
		if ( SUCCEEDED(QueryServiceFromClient(&spWindowForBindingUI)) && spWindowForBindingUI )
		{
			HWND hwndIEServer = NULL;
			if ((spWindowForBindingUI->GetWindow(IID_IHttpSecurity, &hwndIEServer) == S_OK) && IsWindow(hwndIEServer))
			{
				// 这里得到的 hwndIEServer 情况很复杂, 当 Internet Explorer_Server 窗口还没有来得及建立的时候(刚发出浏览请求的时候),
				// hwndIEServer 是 Shell Embedding 窗口的句柄; 之后多数情况是 Internet Explorer_Server 窗口的句柄, 有时候也会是
				// Shell DocObject View 窗口的句柄

				HWND hwndIEHost = ::GetParent(hwndIEServer);

				// 基于上面的情况, 这里就从 hwndIEServer 一直往上找, 直到找到了 CIEHostWindow 的 ATL Host 窗口为止. 为了安全起见, 最多
				// 往上找 5 层
				CString strClassName;
				for ( int i = 0; i < 5; i++ )
				{
					int cnt = GetClassName(hwndIEHost, strClassName.GetBuffer(MAX_PATH), MAX_PATH);
					strClassName.ReleaseBuffer();
					if (cnt == 0)
					{
						break;
					}

					if (strClassName == STR_WINDOW_CLASS_NAME)
					{
						// 找到了
						m_pIEHostWindow = CIEHostWindow::GetInstance(hwndIEHost);
						return;;
					}

					hwndIEHost = ::GetParent(hwndIEHost);
				}
			}
		}
	}

	STDMETHODIMP MonitorSink::BeginningTransaction(
		LPCWSTR szURL,
		LPCWSTR szHeaders,
		DWORD dwReserved,
		LPWSTR *pszAdditionalHeaders)
	{
		if (pszAdditionalHeaders)
		{
			*pszAdditionalHeaders = 0;
		}

		// 先调用默认的 IHttpNegotiate 处理接口, 因为调用之后 pszAdditionalHeaders 才会有 Referer 的信息
		CComPtr<IHttpNegotiate> spHttpNegotiate;
		QueryServiceFromClient(&spHttpNegotiate);
		HRESULT hr = spHttpNegotiate ?
			spHttpNegotiate->BeginningTransaction(szURL, szHeaders,
			dwReserved, pszAdditionalHeaders) :
		E_UNEXPECTED;

		m_strURL = szURL;

		QueryIEHostWindow();

		// 根据 URL 来识别是否是页面内的子请求
		// @todo 用URI类替换FuzzyUrlCompare功能
		m_bIsSubRequest = !(m_pIEHostWindow && FuzzyUrlCompare(m_pIEHostWindow->m_strLoadingUrl, m_strURL));


		// 在这里把 User-Agent、Referrer 附加到 pszAdditionalHeaders 上
		SetCustomHeaders(pszAdditionalHeaders);

		if (!m_pIEHostWindow)
		{
			m_pIEHostWindow = CIEHostWindow::GetInstance(m_strReferer);
		}

		if (!m_pIEHostWindow)
		{
			if (MonitorSink::s_pLastIEHostWindow->GetSafeHwnd())
			{
				m_pIEHostWindow = MonitorSink::s_pLastIEHostWindow;
			}
			else
			{
				MonitorSink::s_pLastIEHostWindow = NULL;
			}
		}

		if (m_pIEHostWindow)
		{
			MonitorSink::s_pLastIEHostWindow = m_pIEHostWindow;
		}

		return hr;
	}

	void MonitorSink::SetCustomHeaders(LPWSTR *pszAdditionalHeaders)
	{
		if (pszAdditionalHeaders)
		{
			static const WCHAR REFERER [] = L"Referer:";

			CStringW strHeaders(*pszAdditionalHeaders);

			if ( m_pIEHostWindow)
			{
				if (!m_strURL.IsEmpty())
				{
					ImportCookies();
				}

				// 如果有 m_strUrlContext, 说明这是新窗口, 需要替 IE 加上 Referer
				if (!m_pIEHostWindow->m_strUrlContext.IsEmpty())
				{
					if (StrStrIW(*pszAdditionalHeaders, REFERER))
					{
						// 已经有 Referer 了, 那就不用了
						if (!m_bIsSubRequest)
						{
							m_pIEHostWindow->m_strUrlContext.Empty();
						}
					}
					else
					{
						CString strReferer;
						strReferer.Format( _T("%s %s\r\n"), REFERER, m_pIEHostWindow->m_strUrlContext);

						strHeaders += strReferer;
					}
				}


				size_t nLen = strHeaders.GetLength() + 2;
				if (*pszAdditionalHeaders = (LPWSTR)CoTaskMemRealloc(*pszAdditionalHeaders, nLen*sizeof(WCHAR)))
				{
					wcscpy_s(*pszAdditionalHeaders, nLen, strHeaders);
				}
			}

			LPWSTR lpReferer = NULL;
			size_t nRefererLen = 0;
			if (ExtractFieldValue(*pszAdditionalHeaders, REFERER, & lpReferer, & nRefererLen ) )
			{
				m_strReferer = lpReferer;

				VirtualFree(lpReferer, 0, MEM_RELEASE);
			}
		}
	}


	inline char * SplitCookies(char * cookies, std::string & cookie_name, std::string & cookie_value)
	{
		char * p = cookies;
		// IE 会自己过滤掉空格，所以下面的代码不需要了
		// while ( cookies && (*cookies == ' ') ) cookies++;			// 滤掉空格
		while ( p && (*p != 0) && (*p != '=') ) p++;
		if ( '=' == *p )
		{
			*p = 0;
			cookie_name = cookies;
			cookies = ++p;

			while ( (*p != 0) && (*p != ';') ) p++;
			if ( ';' == *p )
			{
				*p = 0;
			}
			cookie_value = cookies;

			return ++p;
		}

		return NULL;
	}

	void MonitorSink::ImportCookies()
	{
		CString strCookie = CIEHostWindow::GetFirefoxCookie(m_strURL);
		CT2A url(m_strURL);
		if (!strCookie.IsEmpty())
		{
			CT2A cookies(strCookie);
			LPSTR p = cookies;
			std::string cookie_name;
			std::string cookie_value;
			while ( p = SplitCookies(p, cookie_name, cookie_value) )
			{
				InternetSetCookieA(url, cookie_name.c_str(), cookie_value.c_str());
			}
		}
		TRACE(_T("[MonitorSink::ImportCookies] URL: %s Cookie: %s"), m_strURL, strCookie);
	}


	STDMETHODIMP MonitorSink::OnResponse(
		DWORD dwResponseCode,
		LPCWSTR szResponseHeaders,
		LPCWSTR szRequestHeaders,
		LPWSTR *pszAdditionalRequestHeaders)
	{
		if (pszAdditionalRequestHeaders)
		{
			*pszAdditionalRequestHeaders = 0;
		}

		CComPtr<IHttpNegotiate> spHttpNegotiate;
		QueryServiceFromClient(&spHttpNegotiate);
		HRESULT hr = spHttpNegotiate ?
			spHttpNegotiate->OnResponse(dwResponseCode, szResponseHeaders,
			szRequestHeaders, pszAdditionalRequestHeaders) :
		E_UNEXPECTED;

		if ((dwResponseCode >= 200 ) && (dwResponseCode < 300))
		{
			// 在这里导入 Cookies, 可能会有安全性问题, 把一些不符合 Cookie Policy 的 Cookie 也放过去
			// ReportProgress() 里面看文档有个 BINDSTATUS_SESSION_COOKIES_ALLOWED, 感觉要更安全一些, 但是实际运行时一直没有到过这个状态
			// 也许 Firefox 自己会处理？
			ExportCookies(szResponseHeaders);
		}
		return hr;
	}

	void MonitorSink::ExportCookies(LPCWSTR szResponseHeaders)
	{
		using namespace UserMessage;

		static const WCHAR SET_COOKIE_HEAD [] = L"\r\nSet-Cookie:";

		if (!m_pIEHostWindow) return;

		LPWSTR p = (LPWSTR)szResponseHeaders;
		LPWSTR lpCookies = NULL;
		size_t nCookieLen = 0;
		while (p = ExtractFieldValue(p, SET_COOKIE_HEAD, &lpCookies, & nCookieLen))
		{
			if (lpCookies)
			{
				CString strCookie((LPCTSTR)CW2T(lpCookies));
				TRACE(_T("[ExportCookies] URL: %s  Cookie: %s"), m_strURL, strCookie);
				CIEHostWindow::SetFirefoxCookie(m_strURL, strCookie);
				VirtualFree( lpCookies, 0, MEM_RELEASE);
				lpCookies = NULL;
				nCookieLen = 0;
			}

		}
	}

	STDMETHODIMP MonitorSink::ReportProgress(
		ULONG ulStatusCode,
		LPCWSTR szStatusText)
	{
		HRESULT hr = m_spInternetProtocolSink ?
			m_spInternetProtocolSink->ReportProgress(ulStatusCode, szStatusText) :
		E_UNEXPECTED;
		if(m_pIEHostWindow)
		{
			switch ( ulStatusCode )
			{
				// 重定向了, 更新记录的 URL
			case BINDSTATUS_REDIRECTING:
				{

					if (!m_bIsSubRequest)
					{
						m_pIEHostWindow->m_strLoadingUrl = szStatusText;
						m_strURL = szStatusText;
					}

					// 很多网站登录的时候会在302跳转时设置Cookie, 例如Gmail, 所以我们在这里也要处理 Cookie
					CComPtr<IWinInetHttpInfo> spWinInetHttpInfo;
					if ( SUCCEEDED(m_spTargetProtocol->QueryInterface(&spWinInetHttpInfo)) && spWinInetHttpInfo )
					{
						CHAR szRawHeader[8192];		// IWinInetHttpInfo::QueryInfo() 返回的 Raw Header 不是 Unicode 的
						DWORD dwBuffSize = ARRAYSIZE(szRawHeader);

						if ( SUCCEEDED(spWinInetHttpInfo->QueryInfo(HTTP_QUERY_RAW_HEADERS, szRawHeader, &dwBuffSize, 0, NULL)) )
						{
							// 注意 HTTP_QUERY_RAW_HEADERS 返回的 Raw Header 是 \0 分隔的, 以 \0\0 作为结束, 所以这里要做转换
							CString strHeader;
							HttpRawHeader2CrLfHeader(szRawHeader, strHeader);

							ExportCookies(strHeader);
						}
					}
				}
				break;
			}
		}
		return hr;
	}

	STDMETHODIMP MonitorSink::Authenticate( 
		/* [out] */ HWND *phwnd,
		/* [out] */ LPWSTR *pszUsername,
		/* [out] */ LPWSTR *pszPassword)
	{
		if ( (! m_strUsername.IsEmpty()) && (! m_strPassword.IsEmpty()) )
		{
			size_t len = m_strUsername.GetLength()+1;
			* pszUsername = (LPWSTR)CoTaskMemAlloc(len*sizeof(WCHAR));
			wcscpy_s( * pszUsername, len, m_strUsername);
			len = m_strPassword.GetLength()+1;
			* pszPassword = (LPWSTR)CoTaskMemAlloc(len*sizeof(WCHAR));
			wcscpy_s( * pszPassword, len, m_strPassword);
		}

		return S_OK;
	}


	HRESULT WINAPI MonitorSink::QueryIAuthenticate(void* pv, REFIID riid, LPVOID* ppv, DWORD dw)
	{
		* ppv = NULL;

		if ( pv && InlineIsEqualGUID(riid, IID_IAuthenticate) )
		{
			MonitorSink * pThis = (MonitorSink *)pv;

			if ( pThis->m_pIEHostWindow && ! pThis->m_strURL.IsEmpty() && pThis->m_spTargetProtocol )
			{
				do 
				{
					CComPtr<IWinInetHttpInfo> spWinInetHttpInfo;
					if ( FAILED(pThis->m_spTargetProtocol->QueryInterface(&spWinInetHttpInfo)) ) break;
					if ( ! spWinInetHttpInfo ) break;

					CHAR szRawHeader[8192];		// IWinInetHttpInfo::QueryInfo() 返回的 Raw Header 不是 Unicode 的
					DWORD dwBuffSize = ARRAYSIZE(szRawHeader);

					if ( FAILED(spWinInetHttpInfo->QueryInfo(HTTP_QUERY_RAW_HEADERS, szRawHeader, &dwBuffSize, 0, NULL)) ) break;

					CString strHeader;
					HttpRawHeader2CrLfHeader(szRawHeader, strHeader);

					static const WCHAR AUTH_HEAD [] = L"\r\nWWW-Authenticate:";

					LPWSTR lpAuth = NULL;
					size_t nAuthLen = 0;
					if ( ! ExtractFieldValue( strHeader, AUTH_HEAD, & lpAuth, & nAuthLen ) ) break;
					if ( ! lpAuth ) break;

					CString strAuthScheme;
					CString strAuthRealm;

					// 可能有以下几种情况：
					// WWW-Authenticate: Basic realm="Secure Area"
					// WWW-Authenticate: Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"
					// WWW-Authenticate: NTLM
					// WWW-Authenticate: NTLM <auth token>
					LPWSTR pPos = StrStrW(lpAuth, L" ");
					if ( pPos )
					{
						* pPos = L'\0';
						strAuthScheme = lpAuth;

						do 
						{
							pPos = StrStrIW( pPos + 1, L"realm");
							if ( ! pPos ) break;
							pPos = StrChrW( pPos + 5, L'=');
							if ( ! pPos ) break;
							pPos = StrChrW( pPos + 1, L'"');
							if ( ! pPos ) break;
							LPWSTR lpRealm = pPos + 1;
							pPos = StrChrW( lpRealm, L'"');
							if ( ! pPos ) break;
							* pPos = L'\0';

							strAuthRealm = lpRealm;

						} while (false);

					}
					else
					{
						strAuthScheme = lpAuth;
					}

					VirtualFree( lpAuth, 0, MEM_RELEASE);

					// 由于 NPN_GetAuthenticationInfo 得不到 NTLM 的 domain，没办法做登录，只好不支持了
					if (strAuthRealm == _T("NTLM")) return E_NOINTERFACE;

					CUrl url;
					if ( url.CrackUrl(pThis->m_strURL) )
					{
						CW2A aScheme(url.GetSchemeName());
						CW2A aHost(url.GetHostName());
						int aPort = url.GetPortNumber();

						char* username = NULL;
						char* password = NULL;
						uint32_t ulen = 0, plen = 0;

						char* szAuthScheme = CStringToUTF8String(strAuthScheme);
						char* szAuthRealm = CStringToUTF8String(strAuthRealm);
						NPError result = NPN_GetAuthenticationInfo(pThis->m_pIEHostWindow->m_pPlugin->m_pNPInstance, aScheme, aHost, aPort, szAuthScheme, szAuthRealm, &username, &ulen, &password, &plen );
						delete[] szAuthScheme;
						delete[] szAuthRealm;
						if (result != NPERR_NO_ERROR) break;

						pThis->m_strUsername = username;
						pThis->m_strPassword = password;

						NPN_MemFree(username);
						NPN_MemFree(password);
					}

					* ppv = dynamic_cast<IAuthenticate *>(pThis);

					((IUnknown*)*ppv)->AddRef();

					return S_OK;

				} while (false);
			}
		}

		return E_NOINTERFACE;
	}

}