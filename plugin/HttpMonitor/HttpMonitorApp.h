#pragma once

#include "MonitorSink.h"

namespace HttpMonitor
{
	class HttpMonitorAPP;
	typedef PassthroughAPP::CustomSinkStartPolicy<HttpMonitorAPP, MonitorSink> HttpMonitorStartPolicy;

	class HttpMonitorAPP : public PassthroughAPP::CInternetProtocol<HttpMonitorStartPolicy, CComMultiThreadModel>
	{
		typedef PassthroughAPP::CInternetProtocol<HttpMonitorStartPolicy, CComMultiThreadModel> BaseClass;

	public:

		HttpMonitorAPP() {}

		~HttpMonitorAPP();

		// IInternetProtocolRoot
		STDMETHODIMP Start(
			/* [in] */ LPCWSTR szUrl,
			/* [in] */ IInternetProtocolSink *pOIProtSink,
			/* [in] */ IInternetBindInfo *pOIBindInfo,
			/* [in] */ DWORD grfPI,
			/* [in] */ HANDLE_PTR dwReserved);

		STDMETHODIMP Read(
			/* [in, out] */ void *pv,
			/* [in] */ ULONG cb,
			/* [out] */ ULONG *pcbRead);

		STDMETHODIMP Terminate(
			/* [in] */ DWORD dwOptions);

	public:

		HRESULT FinalConstruct();

	private:

		/** 对应的 MonitorSink 对象 */
		MonitorSink *m_Sink;

		/** 计数器, 因为 Read() 方法会被反复调用, 我们需要一个变量来记录已经 Read 了多少数据了 */
		DWORD m_nDataWritten;
	};

}
