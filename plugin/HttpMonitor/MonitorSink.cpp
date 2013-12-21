#include "StdAfx.h"

#include "plugin.h"
#include "IEHostWindow.h"
#include "MonitorSink.h"
#include "PluginApp.h"
#include "ScriptablePluginObject.h"
#include "abp/AdBlockPlus.h"
#include "URL.h"
#include "PrefManager.h"
#include "HTTP.h"

namespace HttpMonitor
{
	
	// 1x1 transparent GIF for blocking images
	static const BYTE  TRANSPARENT_GIF_1x1 [] =
	{
		0x47,0x49,0x46,0x38,0x39,0x61,0x01,0x00,/**/ 0x01,0x00,0x91,0x00,0x00,0x00,0x00,0x00,
		0xff,0xff,0xff,0xff,0xff,0xff,0x00,0x00,/**/ 0x00,0x21,0xf9,0x04,0x05,0x14,0x00,0x02,
		0x00,0x2c,0x00,0x00,0x00,0x00,0x01,0x00,/**/ 0x01,0x00,0x00,0x02,0x02,0x54,0x01,0x00,
		0x3b
	};
	static const DWORD  TRANSPARENT_GIF_1x1_LENGTH = sizeof(TRANSPARENT_GIF_1x1);
	// Empty HTML page for blocking webpages
	static const BYTE   BLANK_HTML []= "<HTML></HTML>";
	static const DWORD  BLANK_HTML_LENGTH = sizeof(BLANK_HTML)-1;

	static const BYTE   EMPTY_FILE []= "";
	static const DWORD  EMPTY_FILE_LENGTH = sizeof(EMPTY_FILE)-1;

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

		// BeginningTransaction() is the first function called for this sink object.
		// Record its URL here.
		m_strURL = szURL;

		ExtractReferer(pszAdditionalHeaders);

		// Query the associated CIEHostWindow object for later use.
		QueryIEHostWindow();

		// Abort everything the utils window requests
		if (m_pIEHostWindow && m_pIEHostWindow->IsUtils() && m_bIsSubRequest)
			return E_ABORT;

		if (m_pIEHostWindow && !m_bIsSubRequest)
			m_pIEHostWindow->SetMainPageDone();

		// Append additonal headers, such as DNT
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
				if (Utils::HTTP::ExtractFieldValue(szResponseHeaders, CONTENT_TYPE_HEAD, &pContentType, &nLen))
				{
					ContentType_T aContentType = ScanContentType(pContentType);

					if (pContentType) Utils::HTTP::FreeFieldValue(pContentType);

					if ((ContentType::TYPE_DOCUMENT == aContentType) && m_bIsSubRequest)
						aContentType = ContentType::TYPE_SUBDOCUMENT;

					// Check sub-requests only. The main page is always allowed to be loaded.
					if (m_bIsSubRequest && !CanLoadContent(aContentType))
					{
						// No need to export cookies if it's blocked
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
							//	// For other types of content, abort immediately
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
		// Query the IE window that initiated the request
		CComPtr<IWindowForBindingUI> spWindowForBindingUI;
		if ( SUCCEEDED(QueryServiceFromClient(&spWindowForBindingUI)) && spWindowForBindingUI )
		{
			HWND hwndIEServer = NULL;
			if ( SUCCEEDED(spWindowForBindingUI->GetWindow(IID_IHttpSecurity, &hwndIEServer)) && IsWindow(hwndIEServer))
			{
				// Here hwndIEServer could be different handles in different scenarios.
				// When Internet Explorer_Server window is not created yet (when the request is just initiated),
				// hwndIEServer is the handle to the Shell Embedding window; After that it is most likely a handle
				// to the Internet Explorer_Server, and sometimes it could be the Shell DocObject View window as well.

				// Based on the above information, we look for the CIEHostWindow by traversing up in the window
				// hierarchy. For security reasons, we only traverse up for 5 layers of windows.
				m_pIEHostWindow = CIEHostWindow::FromChildWindow(hwndIEServer);
			}
		}

		// Determine whether it's a sub-request by comparing request URL to the page URL
		m_bIsSubRequest = !(m_pIEHostWindow && FuzzyUrlCompare(m_pIEHostWindow->GetLoadingURL(), m_strURL));
	}

	void MonitorSink::ExportCookies(LPCWSTR szResponseHeaders)
	{
		static const WCHAR SET_COOKIE_HEAD [] = L"\r\nSet-Cookie:";

		std::vector<UserMessage::SetFirefoxCookieParams> vCookieParams;
		LPWSTR p = (LPWSTR)szResponseHeaders;
		LPWSTR lpCookies = NULL;
		size_t nCookieLen = 0;
		while (p = Utils::HTTP::ExtractFieldValue(p, SET_COOKIE_HEAD, &lpCookies, & nCookieLen))
		{
			if (lpCookies)
			{
				CString strURL = GetBindURL();
				CString strCookie((LPCTSTR)CW2T(lpCookies));
				Utils::HTTP::FreeFieldValue(lpCookies);
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
			CIEHostWindow::SetFirefoxCookie(std::move(vCookieParams), m_pIEHostWindow);
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
			if (Utils::HTTP::ExtractFieldValue(*pszAdditionalHeaders, REFERER, &lpReferer, &nRefererLen))
			{
				m_strReferer = lpReferer;

				Utils::HTTP::FreeFieldValue(lpReferer);
			}
		}
	}
	bool MonitorSink::CanLoadContent(ContentType_T aContentType)
	{
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
				if (Utils::HTTP::ExtractFieldValue(*pszAdditionalHeaders, L"DNT:", &lpDNT, &nDNTLen))
				{
					if (nDNTLen)
					{
						// Already has DNT header
						hasDNT = true;
					}
					if (lpDNT) Utils::HTTP::FreeFieldValue(lpDNT);
				}
				// Append DoNotTrack (DNT) header
				if (!hasDNT)
					strHeaders.AppendFormat(L"DNT: %d\r\n", nDNTValue);
			}

			if (strHeaders.GetLength() == nOrigLen)
				return; // Not modified, return immediately

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
				// Redirected, record redirected URL
				if (!m_bIsSubRequest)
				{
					if (m_pIEHostWindow)
					{
						m_pIEHostWindow->SetLoadingURL(szStatusText);
					}
					m_strURL = szStatusText;
				}

				// Many websites send cookies during 302 Redirect (e.g. Gmail).
				// We should also handle cookies here.
				CComPtr<IWinInetHttpInfo> spWinInetHttpInfo;
				if (SUCCEEDED(m_spTargetProtocol->QueryInterface(&spWinInetHttpInfo)) && spWinInetHttpInfo )
				{
					CHAR szRawHeader[8192];		// Raw headers returned by IWinInetHttpInfo::QueryInfo() is not Unicode
					DWORD dwBuffSize = ARRAYSIZE(szRawHeader);

					if (SUCCEEDED(spWinInetHttpInfo->QueryInfo(HTTP_QUERY_RAW_HEADERS, szRawHeader, &dwBuffSize, 0, NULL)))
					{
						// Raw headers returned from HTTP_QUERY_RAW_HEADERS is '\0'-separated and ends with "\0\0".
						// Use HttpRawHeader2CrLfHeader to convert.
						CString strHeader;
						Utils::HTTP::HttpRawHeader2CrLfHeader(szRawHeader, strHeader);

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
