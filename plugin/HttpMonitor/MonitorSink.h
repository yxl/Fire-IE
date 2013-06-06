#pragma once

#include "ContentType.h"

class CIEHostWindow;

namespace HttpMonitor 
{
	class MonitorSink:
		public PassthroughAPP::CInternetProtocolSinkWithSP<MonitorSink>,
		public IHttpNegotiate
	{
		typedef PassthroughAPP::CInternetProtocolSinkWithSP<MonitorSink> BaseClass;
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
		/** ��ѯ����������Ӧ�� CIEHostWindow ���� */
		void QueryIEHostWindow();

		// ��ReportProgress() �����ڲ�ר�ã�����Ƿ�Ҫ����
		bool CanLoadContent(ContentType_T aContentType);

		/** ���� Content-Type �� nsIContentPolicy �Ķ��� */
		ContentType_T ScanContentType(LPCWSTR szContentType);

		// Current http request URL
		CString GetBindURL() const;

		// Export IE cookies to firefox by parsing the HTTP response headers
		void ExportCookies(LPCWSTR szResponseHeaders);

		// ����Referer��Ϣ
		void ExtractReferer(LPWSTR *pszAdditionalHeaders);

		// �����Զ���headers
		void SetCustomHeaders(LPWSTR *pszAdditionalHeaders);

		/** ��������� URL */
		CString m_strURL;

		/** ��������� Referer */
		CString m_strReferer;

		/** ���𱾴������ CIEHostWindow ���� */
		CIEHostWindow * m_pIEHostWindow;

		/** �Ƿ���ҳ�������������, ��HTMLҳ�����������ͼƬ���ű��ȵ�������������� */
		bool m_bIsSubRequest;

	private:

		friend class HttpMonitorAPP;

		/**
		 * �����������˹���, �����ԭ����, ���� HTML ����ͼƬ, ���Ǹ� IE ��һ����
		 * �ļ���ȥ, �����͹�����. ������ļ�������, ������һ����������������, Ȼ��
		 * �� IE ��ȡ��ʱ��ѻ����������ݷ��ظ� IE.
		 */
		const BYTE * pTargetBuffer;
		DWORD dwTargetBufSize;
	};

}
