#pragma once

#include "ContentType.h"

class CIEHostWindow;

namespace HttpMonitor 
{
	class MonitorSink:
		public PassthroughAPP::CInternetProtocolSinkWithSP<MonitorSink, CComMultiThreadModel>,
		public IHttpNegotiate
	{
		typedef PassthroughAPP::CInternetProtocolSinkWithSP<MonitorSink, CComMultiThreadModel> BaseClass;
	public:
		MonitorSink();
		~MonitorSink() {}

		BEGIN_COM_MAP(MonitorSink)
			COM_INTERFACE_ENTRY(IHttpNegotiate)
			COM_INTERFACE_ENTRY_CHAIN(BaseClass)
		END_COM_MAP()

		BEGIN_SERVICE_MAP(MonitorSink)
			SERVICE_ENTRY(IID_IHttpNegotiate)
			SERVICE_ENTRY(IID_IAuthenticate)
		END_SERVICE_MAP()

		//
		// IHttpNegotiate
		//

		STDMETHODIMP BeginningTransaction(
		LPCWSTR szURL,
		LPCWSTR szHeaders,
		DWORD dwReserved,
		LPWSTR *pszAdditionalHeaders);

		STDMETHODIMP OnResponse(
			DWORD dwResponseCode,
			LPCWSTR szResponseHeaders,
			LPCWSTR szRequestHeaders,
			LPWSTR *pszAdditionalRequestHeaders);
		
		//
		// IInternetProtocolSink
		//
		
		STDMETHODIMP ReportProgress(
			ULONG ulStatusCode,
			LPCWSTR szStatusText);

		STDMETHODIMP ReportResult( 
			HRESULT hrResult,
			DWORD dwError,
			LPCWSTR szResult);

		STDMETHODIMP ReportData( 
			DWORD grfBSCF,
			ULONG ulProgress,
			ULONG ulProgressMax);

		STDMETHODIMP Switch(PROTOCOLDATA *pProtocolData);

	private:
		// Query the CIEHostWindow object associated with this request
		void QueryIEHostWindow();

		// Check whether we should filter the request (adblock)
		bool CanLoadContent(ContentType_T aContentType);

		// Resolve raw Content-Type to type value defined in nsIContentPolicy
		ContentType_T ScanContentType(LPCWSTR szContentType);

		// Current http request URL
		CString GetBindURL() const;

		// Export IE cookies to firefox by parsing the HTTP response headers
		void ExportCookies(LPCWSTR szResponseHeaders);

		// Query referer of this request
		void ExtractReferer(LPWSTR *pszAdditionalHeaders);

		// Append custom headers (e.g. DNT)
		void SetCustomHeaders(LPWSTR *pszAdditionalHeaders);

		// URL of this request
		CString m_strURL;

		// Referer of this request
		CString m_strReferer;

		// The CIEHostWindow object associated with this request
		CIEHostWindow * m_pIEHostWindow;

		// Is this a sub-request (e.g. images/scripts inside HTML pages)?
		bool m_bIsSubRequest;

	private:

		friend class HttpMonitorAPP;

		/**
		 * Block ads.
		 * For HTML pages or images that need to be blocked, we transfer an 
		 * empty document or image to IE. pTargetBuffer holds the buffer to
		 * the empty document/image and dwTargetBufSize holds its size.
		 */
		const BYTE * pTargetBuffer;
		DWORD dwTargetBufSize;
	};

}
