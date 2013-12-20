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
		/** 查询本请求所对应的 CIEHostWindow 对象 */
		void QueryIEHostWindow();

		// （ReportProgress() 方法内部专用）检查是否要过滤
		bool CanLoadContent(ContentType_T aContentType);

		/** 解析 Content-Type 成 nsIContentPolicy 的定义 */
		ContentType_T ScanContentType(LPCWSTR szContentType);

		// Current http request URL
		CString GetBindURL() const;

		// Export IE cookies to firefox by parsing the HTTP response headers
		void ExportCookies(LPCWSTR szResponseHeaders);

		// 设置Referer信息
		void ExtractReferer(LPWSTR *pszAdditionalHeaders);

		// 设置自定义headers
		void SetCustomHeaders(LPWSTR *pszAdditionalHeaders);

		/** 本次请求的 URL */
		CString m_strURL;

		/** 本次请求的 Referer */
		CString m_strReferer;

		/** 发起本次请求的 CIEHostWindow 对象 */
		CIEHostWindow * m_pIEHostWindow;

		/** 是否是页面的子请求？例如, 对HTML页面里面包含的图片、脚本等的请求就是子请求 */
		bool m_bIsSubRequest;

	private:

		friend class HttpMonitorAPP;

		/**
		 * 这是用来过滤广告的, 其基本原理是, 对于 HTML 或者图片, 我们给 IE 传一个空
		 * 文件过去, 这样就过滤了. 这个空文件的内容, 我们用一个缓冲区来保存它, 然后
		 * 在 IE 读取的时候把缓冲区的内容返回给 IE.
		 */
		const BYTE * pTargetBuffer;
		DWORD dwTargetBufSize;
	};

}
