#pragma once

#include <urlmon.h>

class CIEHostWindow;

namespace HttpMonitor 
{
	class MonitorSink:
		public PassthroughAPP::CInternetProtocolSinkWithSP<MonitorSink>,
		public IHttpNegotiate,
		public IAuthenticate
	{
		typedef PassthroughAPP::CInternetProtocolSinkWithSP<MonitorSink> BaseClass;
	public:
		MonitorSink();
		~MonitorSink();

		BEGIN_COM_MAP(MonitorSink)
			COM_INTERFACE_ENTRY(IHttpNegotiate)
			COM_INTERFACE_ENTRY_FUNC(IID_IAuthenticate, 0, QueryIAuthenticate)
			COM_INTERFACE_ENTRY_CHAIN(BaseClass)
		END_COM_MAP()

		BEGIN_SERVICE_MAP(MonitorSink)
			SERVICE_ENTRY(IID_IHttpNegotiate)
			SERVICE_ENTRY(IID_IAuthenticate)
		END_SERVICE_MAP()

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

		STDMETHODIMP ReportProgress(
			ULONG ulStatusCode,
			LPCWSTR szStatusText);

		// IAuthenticate
		STDMETHODIMP Authenticate( 
			/* [out] */ HWND *phwnd,
			/* [out] */ LPWSTR *pszUsername,
			/* [out] */ LPWSTR *pszPassword);

		/**
		* 为了保证兼容性，在不确定能否正确登录的时候，屏蔽 IAuthenticate 接口，这样，IE 会弹出自己的 login 对话框。
		*/
		static HRESULT WINAPI QueryIAuthenticate(void* pv, REFIID riid, LPVOID* ppv, DWORD dw);

	private:
		static CIEHostWindow* s_pLastIEHostWindow;
		// 查询本请求所对应的 CIEHostWindow 对象
		void QueryIEHostWindow();

		// 把我们要定制的 Headers 加上去
		void SetCustomHeaders(LPWSTR *pszAdditionalHeaders);

		// 从 Firefox 中导入 Cookie
		void ImportCookies();

		/** 从 HTTP Response Headers 中扫描出 Cookies 并设置到 Firefox 中 */
		void ExportCookies(LPCWSTR szResponseHeaders);

		/** 本次请求的 URL */
		CString m_strURL;

		/** 本次请求的 Referer */
		CString m_strReferer;

		/** Login 用户名*/
		CString m_strUsername;
		/** Login 密码 */
		CString m_strPassword;

		/** 发起本次请求的 CIEHostWindow 对象 */
		CIEHostWindow * m_pIEHostWindow;

		/** 是否是页面的子请求？例如, 对HTML页面里面包含的图片、脚本等的请求就是子请求 */
		bool m_bIsSubRequest;
	};
}