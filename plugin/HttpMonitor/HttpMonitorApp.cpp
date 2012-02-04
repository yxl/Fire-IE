#include "StdAfx.h"
#include "HttpMonitorApp.h"

namespace HttpMonitor
{

	HttpMonitorAPP::~HttpMonitorAPP()
	{
	}

	HRESULT HttpMonitorAPP::FinalConstruct() {

		return S_OK;
	}

	STDMETHODIMP HttpMonitorAPP::Start(
		/* [in] */ LPCWSTR url,
		/* [in] */ IInternetProtocolSink *protocol_sink,
		/* [in] */ IInternetBindInfo *bind_info,
		/* [in] */ DWORD flags,
		/* [in] */ HANDLE_PTR reserved)
	{
		return BaseClass::Start(url, protocol_sink, bind_info, flags, reserved);
	}

	STDMETHODIMP HttpMonitorAPP::Read(
		/* [in, out] */ void *pv,
		/* [in] */ ULONG cb,
		/* [out] */ ULONG *pcbRead)
	{
		return BaseClass::Read(pv, cb, pcbRead);
	}

	STDMETHODIMP HttpMonitorAPP::Terminate(/* [in] */ DWORD options)
	{
		return BaseClass::Terminate(options);
	}
}