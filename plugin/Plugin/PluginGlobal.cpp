#include "StdAfx.h"
#include "PluginGlobal.h"
#include "HttpMonitorAPP.h"
#include "WindowMessageHook.h"
#include "AtlDepHook.h"
#include "OS.h"

namespace Plugin
{
	using namespace Utils;

	/** 用于监视HTTP和HTTPS请求, 同步Cookie */
	CComPtr<IClassFactory> g_spCFHTTP;
	CComPtr<IClassFactory> g_spCFHTTPS;

	typedef PassthroughAPP::CMetaFactory<PassthroughAPP::CComClassFactoryProtocol, HttpMonitor::HttpMonitorAPP> MetaFactory;

	// global plugin initialization
	NPError NS_PluginInitialize()
	{
		// 监视http和https请求，同步cookie
		CComPtr<IInternetSession> spSession;
		if (FAILED(CoInternetGetSession(0, &spSession, 0)) && spSession )
		{
			return NPERR_GENERIC_ERROR;
		}
		if (MetaFactory::CreateInstance(CLSID_HttpProtocol, &g_spCFHTTP) != S_OK)
		{
			return NPERR_GENERIC_ERROR;
		}
		if (spSession->RegisterNameSpace(g_spCFHTTP, CLSID_NULL, L"http", 0, 0, 0) != S_OK)
		{
			return NPERR_GENERIC_ERROR;
		}
		if (MetaFactory::CreateInstance(CLSID_HttpSProtocol, &g_spCFHTTPS) != S_OK)
		{
			return NPERR_GENERIC_ERROR;
		}
		if (spSession->RegisterNameSpace(g_spCFHTTPS, CLSID_NULL, L"https", 0, 0, 0) != S_OK)
		{
			return NPERR_GENERIC_ERROR;
		}
		if (!BrowserHook::WindowMessageHook::s_instance.Install())
		{
			return NPERR_GENERIC_ERROR;
		}
#ifndef _M_X64
		if (OS::GetVersion() == OS::WIN7 || OS::GetVersion() == OS::VISTA)
		{

			BrowserHook::AtlDepHook::s_instance.Install();

		}
#endif
		return NPERR_NO_ERROR;
	}

	// global shutdown
	void NS_PluginShutdown()
	{
		// 取消监视http和https请求
		CComPtr<IInternetSession> spSession;
		if (SUCCEEDED(CoInternetGetSession(0, &spSession, 0)) && spSession )
		{
			if (g_spCFHTTP)
			{
				spSession->UnregisterNameSpace(g_spCFHTTP, L"http");
				g_spCFHTTP.Release();
			}
			if (g_spCFHTTPS)
			{
				spSession->UnregisterNameSpace(g_spCFHTTPS, L"https");
				g_spCFHTTPS.Release();
			}
		}
		BrowserHook::WindowMessageHook::s_instance.Uninstall();
		//if (OS::GetVersion() == OS::WIN7 || OS::GetVersion() == OS::VISTA)
		//{
		//	BrowserHook::AtlDepHook::s_instance.Uninstall();
		//}
	}
}