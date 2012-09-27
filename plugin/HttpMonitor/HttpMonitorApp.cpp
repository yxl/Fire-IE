#include "StdAfx.h"
#include "HttpMonitorApp.h"

namespace HttpMonitor
{

	HttpMonitorAPP::~HttpMonitorAPP()
	{
	}

	HRESULT HttpMonitorAPP::FinalConstruct() {
	
		m_Sink = HttpMonitorStartPolicy::GetSink(this);
	
		m_nDataWritten = 0;

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
		const BYTE * pBuffer = m_Sink->pTargetBuffer;
		DWORD dwBufLen = m_Sink->dwTargetBufSize;
		if ( pBuffer )
		{
			DWORD dwSize = 0;
			if ( dwBufLen > m_nDataWritten )
			{
				dwSize = min(dwBufLen - m_nDataWritten, cb);
			}

			* pcbRead = dwSize;

			if ( dwSize > 0 )
			{
				memcpy( pv, pBuffer + m_nDataWritten, dwSize );

				m_nDataWritten += dwSize;

				if ( m_nDataWritten == dwBufLen ) return S_FALSE;
			}
			else
			{
				return S_FALSE;
			}

			return S_OK;
		}
		else
		{
			return BaseClass::Read(pv, cb, pcbRead);
		}
	}

	STDMETHODIMP HttpMonitorAPP::Terminate(/* [in] */ DWORD options)
	{
		return BaseClass::Terminate(options);
	}
}
