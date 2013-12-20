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

		// Corresponding MonitorSink object
		MonitorSink *m_Sink;

		// Counter for how much data has been read
		DWORD m_nDataWritten;
	};

}
