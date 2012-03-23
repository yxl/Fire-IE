#include "StdAfx.h"
#include <Wininet.h>
#include <string>
#include "Cookie.h"
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

	MonitorSink::MonitorSink()
	{
	}

	MonitorSink::~MonitorSink()
	{
	}

	STDMETHODIMP MonitorSink::BeginningTransaction(
		LPCWSTR szURL,
		LPCWSTR szHeaders,
		DWORD dwReserved,
		LPWSTR *pszAdditionalHeaders)
	{
		if (pszAdditionalHeaders)
		{
			*pszAdditionalHeaders = NULL;
		}

		// 先调用默认的 IHttpNegotiate 处理接口, 因为调用之后 pszAdditionalHeaders 才会有 Referer 的信息
		CComPtr<IHttpNegotiate> spHttpNegotiate;
		QueryServiceFromClient(&spHttpNegotiate);
		HRESULT hr = spHttpNegotiate ?
			spHttpNegotiate->BeginningTransaction(szURL, szHeaders,
			dwReserved, pszAdditionalHeaders) : E_UNEXPECTED;

		m_strURL = szURL;

		return hr;
	}

	STDMETHODIMP MonitorSink::OnResponse(
		DWORD dwResponseCode,
		LPCWSTR szResponseHeaders,
		LPCWSTR szRequestHeaders,
		LPWSTR *pszAdditionalRequestHeaders)
	{
		USES_CONVERSION;

		if (pszAdditionalRequestHeaders)
		{
			*pszAdditionalRequestHeaders = 0;
		}

		CComPtr<IHttpNegotiate> spHttpNegotiate;
		QueryServiceFromClient(&spHttpNegotiate);

		// 去除httponly属性, 临时解决httponly Cookie无法同步问题
		// @todo 寻找更安全的方法解决这个问题。
		// @author Yuan Xulei
		CString strResponseHeaderBuffer(szResponseHeaders);
		//strResponseHeaderBuffer.Replace(_T("httponly"), _T(""));
		//strResponseHeaderBuffer.Replace(_T("HttpOnly"), _T(""));
		
		HRESULT hr = spHttpNegotiate ?
			spHttpNegotiate->OnResponse(dwResponseCode, strResponseHeaderBuffer,
			szRequestHeaders, pszAdditionalRequestHeaders) :
		E_UNEXPECTED;

		if ((dwResponseCode >= 200 ) && (dwResponseCode < 300))
		{
			ExportCookies(strResponseHeaderBuffer);
		}
		return hr;
	}

	void MonitorSink::ExportCookies(LPCWSTR szResponseHeaders)
	{
		static const WCHAR SET_COOKIE_HEAD [] = L"\r\nSet-Cookie:";

		LPWSTR p = (LPWSTR)szResponseHeaders;
		LPWSTR lpCookies = NULL;
		size_t nCookieLen = 0;
		while (p = ExtractFieldValue(p, SET_COOKIE_HEAD, &lpCookies, & nCookieLen))
		{
			if (lpCookies)
			{
				CString strCookie((LPCTSTR)CW2T(lpCookies));
				TRACE(_T("[ExportCookies] URL: %s  Cookie: %s\n"), m_strURL, strCookie);
				CIEHostWindow::SetFirefoxCookie(m_strURL, strCookie);
				VirtualFree(lpCookies, 0, MEM_RELEASE);
				lpCookies = NULL;
				nCookieLen = 0;

				Cookie::Cookie cookieObject(m_strURL, strCookie);
				TRACE("Cookie %s\n", cookieObject.toString().c_str());
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
			 
			// 重定向了, 更新记录的 URL
		case BINDSTATUS_REDIRECTING:
			{
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