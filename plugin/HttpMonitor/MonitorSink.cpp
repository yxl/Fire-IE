#include "StdAfx.h"
#include <Wininet.h>
#include <string>
#pragma comment(lib, "Wininet.lib")

#include "plugin.h"
#include "IEHostWindow.h"
#include "MonitorSink.h"
#include "PluginApp.h"
#include "ScriptablePluginObject.h"
#include "abp/AdBlockPlus.h"
#include "URL.h"
#include "PrefManager.h"

namespace HttpMonitor
{
	
	/** 1x1 的空白透明 GIF 文件, 用来过滤图片 */
	static const BYTE  TRANSPARENT_GIF_1x1 [] =
	{
		0x47,0x49,0x46,0x38,0x39,0x61,0x01,0x00,/**/ 0x01,0x00,0x91,0x00,0x00,0x00,0x00,0x00,
		0xff,0xff,0xff,0xff,0xff,0xff,0x00,0x00,/**/ 0x00,0x21,0xf9,0x04,0x05,0x14,0x00,0x02,
		0x00,0x2c,0x00,0x00,0x00,0x00,0x01,0x00,/**/ 0x01,0x00,0x00,0x02,0x02,0x54,0x01,0x00,
		0x3b
	};
	static const DWORD  TRANSPARENT_GIF_1x1_LENGTH = sizeof(TRANSPARENT_GIF_1x1);
	/** 空白 HTML, 用来过滤网页 */
	static const BYTE   BLANK_HTML []= "<HTML></HTML>";
	static const DWORD  BLANK_HTML_LENGTH = sizeof(BLANK_HTML)-1;

	static const BYTE   EMPTY_FILE []= "";
	static const DWORD  EMPTY_FILE_LENGTH = sizeof(EMPTY_FILE)-1;

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
			LPWSTR lpBuffer = (LPWSTR)malloc(nBufLen * sizeof(WCHAR));
			if ( !lpBuffer ) break;

			if (wcsncpy_s( lpBuffer, nBufLen, pStart, nSize))
			{
				free(lpBuffer);
				break;
			}

			* pSize = nBufLen;
			* pFieldValue = lpBuffer;
			r = pEnd;

		} while(false);

		return r;
	}

	bool FuzzyUrlCompare( LPCTSTR lpszUrl1, LPCTSTR lpszUrl2 )
	{
		static const TCHAR ANCHOR = _T('#');
		static const TCHAR FILE_PROTOCOL [] = _T("file://");
		static const size_t FILE_PROTOCOL_LENGTH = _tcslen(FILE_PROTOCOL);

		bool bMatch = true;

		if ( lpszUrl1 && lpszUrl2 )
		{
			TCHAR szDummy1[MAX_PATH];
			TCHAR szDummy2[MAX_PATH];

			if ( _tcsncmp( lpszUrl1, FILE_PROTOCOL, FILE_PROTOCOL_LENGTH ) == 0 )
			{
				DWORD dwLen = MAX_PATH;
				if ( PathCreateFromUrl( lpszUrl1, szDummy1, & dwLen, 0 ) == S_OK )
				{
					lpszUrl1 = szDummy1;
				}
			}

			if ( _tcsncmp( lpszUrl2, FILE_PROTOCOL, FILE_PROTOCOL_LENGTH ) == 0 )
			{
				DWORD dwLen = MAX_PATH;
				if ( PathCreateFromUrl( lpszUrl2, szDummy2, & dwLen, 0 ) == S_OK )
				{
					lpszUrl2 = szDummy2;
				}
			}

			do
			{
				if ( *lpszUrl1 != *lpszUrl2 )
				{
					if ( ( ( ANCHOR == *lpszUrl1 ) && ( 0 == *lpszUrl2 ) ) ||
						( ( ANCHOR == *lpszUrl2 ) && ( 0 == *lpszUrl1 ) ) )
					{
						bMatch = true;
					}
					else
					{
						bMatch = false;
					}

					break;
				}

				lpszUrl1++;
				lpszUrl2++;

			} while ( *lpszUrl1 || *lpszUrl2 );
		}

		return bMatch;
	}

	// converts content types from nsIContentPolicy to ABP bit mask style
	abp::ContentType_T nsItoABP(HttpMonitor::ContentType_T contentType)
	{
		static abp::ContentType_T typeMap[] = { 0,
			abp::UNKNOWN_OTHER,
			abp::SCRIPT,
			abp::IMAGE,
			abp::STYLESHEET,
			abp::OBJECT,
			abp::DOCUMENT,
			abp::SUBDOCUMENT,
			0,/* Redirect */
			abp::XBL,
			abp::PING,
			abp::XMLHTTPREQUEST,
			abp::OBJECT_SUBREQUEST,
			abp::DTD
		};

		return typeMap[contentType];
	}

	// MonitorSink implementation

	MonitorSink::MonitorSink()
	{
		pTargetBuffer = NULL;
		dwTargetBufSize = 0;

		m_pIEHostWindow = NULL;
		m_bIsSubRequest = true;
	}

	STDMETHODIMP MonitorSink::BeginningTransaction(
		LPCWSTR szURL,
		LPCWSTR szHeaders,
		DWORD dwReserved,
		LPWSTR *pszAdditionalHeaders)
	{
		CComPtr<IHttpNegotiate> spHttpNegotiate;
		QueryServiceFromClient(&spHttpNegotiate);
		HRESULT hr = spHttpNegotiate ?
			spHttpNegotiate->BeginningTransaction(szURL, szHeaders,
			dwReserved, pszAdditionalHeaders) : E_UNEXPECTED;

		// BeginningTransaction() 是本对象最开始被调用的方法, 在这里记下调用的 URL
		m_strURL = szURL;

		ExtractReferer(pszAdditionalHeaders);

		// 查询请求所对应的 CIEHostWindow 对象, 后面随时会用到
		QueryIEHostWindow();

		// 设置自定义header，如DNT等
		SetCustomHeaders(pszAdditionalHeaders);
		
		return hr;
	}

	STDMETHODIMP MonitorSink::OnResponse(
		DWORD dwResponseCode,
		LPCWSTR szResponseHeaders,
		LPCWSTR szRequestHeaders,
		LPWSTR *pszAdditionalRequestHeaders)
	{
		if (pszAdditionalRequestHeaders)
			*pszAdditionalRequestHeaders = NULL;

		CComPtr<IHttpNegotiate> spHttpNegotiate;
		QueryServiceFromClient(&spHttpNegotiate);
		
		HRESULT hr = spHttpNegotiate ?
			spHttpNegotiate->OnResponse(dwResponseCode, szResponseHeaders,
			szRequestHeaders, pszAdditionalRequestHeaders) :
		S_OK;

		if ((dwResponseCode >= 200 ) && (dwResponseCode < 300))
		{
			bool bExportCookies = PrefManager::instance().isCookieSyncEnabled();

			if (abp::AdBlockPlus::isEnabled())
			{
				static const WCHAR CONTENT_TYPE_HEAD [] = L"Content-Type:";
				LPWSTR pContentType = NULL;
				size_t nLen = 0;
				if (ExtractFieldValue(szResponseHeaders, CONTENT_TYPE_HEAD, &pContentType, &nLen))
				{
					ContentType_T aContentType = ScanContentType(pContentType);

					if (pContentType) free(pContentType);

					if ((ContentType::TYPE_DOCUMENT == aContentType) && m_bIsSubRequest)
						aContentType = ContentType::TYPE_SUBDOCUMENT;

					// 只检查子请求：主页面始终应该被加载
					if (m_bIsSubRequest && !CanLoadContent(aContentType))
					{
						// 被过滤了就不用导入 Cookie 了
						bExportCookies = false;

						switch (aContentType)
						{
						case ContentType::TYPE_IMAGE:
							{
								pTargetBuffer = TRANSPARENT_GIF_1x1;
								dwTargetBufSize = TRANSPARENT_GIF_1x1_LENGTH;

								break;
							}
						case ContentType::TYPE_DOCUMENT:
						case ContentType::TYPE_SUBDOCUMENT:
							{
								pTargetBuffer = BLANK_HTML;
								dwTargetBufSize = BLANK_HTML_LENGTH;

								break;
							}
						case ContentType::TYPE_SCRIPT:
						case ContentType::TYPE_STYLESHEET:
						default:
							{
								pTargetBuffer = EMPTY_FILE;
								dwTargetBufSize = EMPTY_FILE_LENGTH;
								break;
							}
							//{
							//	// 对于其它类型的文件, 直接终止即可
							//	hr = E_ABORT;
							//}
						}

						if (m_spInternetProtocolSink) m_spInternetProtocolSink->ReportData(BSCF_FIRSTDATANOTIFICATION | BSCF_LASTDATANOTIFICATION | BSCF_DATAFULLYAVAILABLE, 0, 0);
						if (m_spInternetProtocolSink) m_spInternetProtocolSink->ReportResult(S_OK, S_OK, NULL);
					}
				}
			}

			if (bExportCookies)
				ExportCookies(szResponseHeaders);
		}

		return hr;
	}

	CString MonitorSink::GetBindURL() const
	{
		USES_CONVERSION_EX;

		CString strURL;
		WCHAR* pURL = NULL;
		ULONG cEl = 1;
		try
		{
			if (SUCCEEDED(m_spInternetBindInfo->GetBindString(BINDSTRING_URL, &pURL, cEl, &cEl)))
			{
				strURL = (LPCTSTR)CW2T(pURL);	
			}
		}
		catch(...)
		{
		}

		if (pURL)
		{
			CoTaskMemFree(pURL);
		}

		return strURL;
	}

	void MonitorSink::QueryIEHostWindow()
	{
		// 查询发出请求是哪个 IE 窗口
		CComPtr<IWindowForBindingUI> spWindowForBindingUI;
		if ( SUCCEEDED(QueryServiceFromClient(&spWindowForBindingUI)) && spWindowForBindingUI )
		{
			HWND hwndIEServer = NULL;
			if ( SUCCEEDED(spWindowForBindingUI->GetWindow(IID_IHttpSecurity, &hwndIEServer)) && IsWindow(hwndIEServer))
			{
				// 这里得到的 hwndIEServer 情况很复杂, 当 Internet Explorer_Server 窗口还没有来得及建立的时候(刚发出浏览请求的时候),
				// hwndIEServer 是 Shell Embedding 窗口的句柄; 之后多数情况是 Internet Explorer_Server 窗口的句柄, 有时候也会是
				// Shell DocObject View 窗口的句柄

				// 基于上面的情况, 这里就从 hwndIEServer 一直往上找, 直到找到了 CIEHostWindow 的 ATL Host 窗口为止. 为了安全起见, 最多
				// 往上找 5 层
				m_pIEHostWindow = CIEHostWindow::FromChildWindow(hwndIEServer);
			}
		}

		// 根据 URL 来识别是否是页面内的子请求
		m_bIsSubRequest = !(m_pIEHostWindow && FuzzyUrlCompare(m_pIEHostWindow->GetLoadingURL(), m_strURL));
	}

	void MonitorSink::ExportCookies(LPCWSTR szResponseHeaders)
	{
		static const WCHAR SET_COOKIE_HEAD [] = L"\r\nSet-Cookie:";

		std::vector<UserMessage::SetFirefoxCookieParams> vCookieParams;
		LPWSTR p = (LPWSTR)szResponseHeaders;
		LPWSTR lpCookies = NULL;
		size_t nCookieLen = 0;
		while (p = ExtractFieldValue(p, SET_COOKIE_HEAD, &lpCookies, & nCookieLen))
		{
			if (lpCookies)
			{
				CString strURL = GetBindURL();
				CString strCookie((LPCTSTR)CW2T(lpCookies));
				free(lpCookies);
				lpCookies = NULL;

				UserMessage::SetFirefoxCookieParams cookieParam;
				cookieParam.strURL = strURL;
				cookieParam.strCookie = strCookie;
				vCookieParams.push_back(cookieParam);
				TRACE(_T("[ExportCookies] URL: %s  Cookie: %s\n"), strURL, strCookie);
				nCookieLen = 0;
			}
		}
		if (vCookieParams.size())
			CIEHostWindow::SetFirefoxCookie(std::move(vCookieParams));
	}

	ContentType_T MonitorSink::ScanContentType(LPCWSTR szContentType)
	{
		static const struct	{ const wchar_t * name;	const int value; } MAP [] = {
			{L"image/", ContentType::TYPE_IMAGE},
			{L"text/css", ContentType::TYPE_STYLESHEET},
			{L"text/javascript", ContentType::TYPE_SCRIPT},
			{L"text/", ContentType::TYPE_DOCUMENT},
			{L"application/x-javascript", ContentType::TYPE_SCRIPT},
			{L"application/javascript", ContentType::TYPE_SCRIPT},
			{L"application/", ContentType::TYPE_OBJECT},
		};

		for ( int i = 0; i < ARRAYSIZE(MAP); i++ )
		{
			if ( _wcsnicmp(MAP[i].name, szContentType, wcslen(MAP[i].name)) == 0 )
			{
				return MAP[i].value;
			}
		}

		return ContentType::TYPE_OTHER;
	}

	void MonitorSink::ExtractReferer(LPWSTR *pszAdditionalHeaders)
	{
		if ( pszAdditionalHeaders )
		{
			static const WCHAR REFERER [] = L"Referer:";

			LPWSTR lpReferer = NULL;
			size_t nRefererLen = 0;
			if (ExtractFieldValue(*pszAdditionalHeaders, REFERER, &lpReferer, &nRefererLen))
			{
				m_strReferer = lpReferer;

				free(lpReferer);
			}
		}
	}
	bool MonitorSink::CanLoadContent(ContentType_T aContentType)
	{
		// stub implementation, filter baidu logo
		/*bool result = m_strURL != _T("http://www.baidu.com/img/baidu_sylogo1.gif")
			&& m_strURL != _T("http://www.baidu.com/img/baidu_jgylogo3.gif")
			&& m_strURL != _T("http://img.baidu.com/img/post-jg.gif")
			&& m_strURL.Find(_T("http://tb2.bdstatic.com/tb/static-common/img/tieba_logo")) != 0
			&& m_strURL.Find(_T("http://360.cn")) != 0
			&& m_strURL.Find(_T("http://static.youku.com/v1.0.0223/v/swf")) != 0
		;*/ /*!re::RegExp(_T("/http:\\/\\/\\w+\\.(qhimg\\.com)/i")).test(std::wstring(m_strURL.GetString()));*/
		bool thirdParty = m_strReferer.GetLength() ? Utils::IsThirdPartyRequest(m_strURL, m_strReferer) : false;
		const CString& referer =  m_strReferer.GetLength() ? m_strReferer : m_strURL;

		bool result = abp::AdBlockPlus::shouldLoad(m_strURL.GetString(), nsItoABP(aContentType), referer.GetString(), thirdParty);

		TRACE(_T("[CanLoadContent]: [%s] [%s] %s [Referer: %s]\n"), result ? _T("true") : _T("false"),
			m_bIsSubRequest ? _T("sub") : _T("main"), m_strURL, m_strReferer);
		return result;
	}

	void MonitorSink::SetCustomHeaders(LPWSTR *pszAdditionalHeaders)
	{
		if (pszAdditionalHeaders && *pszAdditionalHeaders)
		{
			CStringW strHeaders(*pszAdditionalHeaders);
			size_t nOrigLen = strHeaders.GetLength();

			bool bSendDNT1 = abp::AdBlockPlus::shouldSendDNTHeader(m_strURL.GetString());
			bool bSendDNT0 = PrefManager::instance().isDNTEnabled() && PrefManager::instance().getDNTValue() == 0;
			bool bSendDNT = bSendDNT1 || bSendDNT0;
			int nDNTValue = bSendDNT1 ? 1 : 0;
			if (bSendDNT)
			{
				LPWSTR lpDNT = NULL;
				size_t nDNTLen = 0;
				bool hasDNT = false;
				if (ExtractFieldValue(*pszAdditionalHeaders, L"DNT:", &lpDNT, &nDNTLen))
				{
					if (nDNTLen)
					{
						// 已经有DNT头了，不用再加
						hasDNT = true;
					}
					if (lpDNT) free(lpDNT);
				}
				// 增加 DoNotTrack (DNT) 头
				if (!hasDNT)
					strHeaders.AppendFormat(L"DNT: %d\r\n", nDNTValue);
			}

			if (strHeaders.GetLength() == nOrigLen)
				return; // 没改过，直接返回

			size_t nLen = strHeaders.GetLength() + 2;
			if (*pszAdditionalHeaders = (LPWSTR)CoTaskMemRealloc(*pszAdditionalHeaders, nLen * sizeof(WCHAR)))
			{
				wcscpy_s(*pszAdditionalHeaders, nLen, strHeaders);
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
		switch ( ulStatusCode )
		{
			 
		case BINDSTATUS_REDIRECTING:
			{
				// 重定向了, 更新记录的 URL
				if (!m_bIsSubRequest)
				{
					if (m_pIEHostWindow)
						m_pIEHostWindow->SetLoadingURL(szStatusText);
					m_strURL = szStatusText;
				}

				// 很多网站登录的时候会在302跳转时设置Cookie, 例如Gmail, 所以我们在这里也要处理 Cookie
				CComPtr<IWinInetHttpInfo> spWinInetHttpInfo;
				if (SUCCEEDED(m_spTargetProtocol->QueryInterface(&spWinInetHttpInfo)) && spWinInetHttpInfo )
				{
					CHAR szRawHeader[8192];		// IWinInetHttpInfo::QueryInfo() 返回的 Raw Header 不是 Unicode 的
					DWORD dwBuffSize = ARRAYSIZE(szRawHeader);

					if (SUCCEEDED(spWinInetHttpInfo->QueryInfo(HTTP_QUERY_RAW_HEADERS, szRawHeader, &dwBuffSize, 0, NULL)))
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
		return hr;
	}

	STDMETHODIMP MonitorSink::ReportResult( 
		HRESULT hrResult,
		DWORD dwError,
		LPCWSTR szResult)
	{
		HRESULT hr = m_spInternetProtocolSink ?
				m_spInternetProtocolSink->ReportResult(hrResult, dwError, szResult):
				E_UNEXPECTED;
		return hr;
	}

	STDMETHODIMP MonitorSink::ReportData( 
		DWORD grfBSCF,
		ULONG ulProgress,
		ULONG ulProgressMax)
	{
		HRESULT hr = m_spInternetProtocolSink ?
				m_spInternetProtocolSink->ReportData(grfBSCF, ulProgress, ulProgressMax):
				E_UNEXPECTED;
		return hr;
	}

	STDMETHODIMP MonitorSink::Switch(PROTOCOLDATA *pProtocolData)
	{
		HRESULT hr = m_spInternetProtocolSink ?
			m_spInternetProtocolSink->Switch(pProtocolData) :
			E_UNEXPECTED;
		return hr;
	}
}
