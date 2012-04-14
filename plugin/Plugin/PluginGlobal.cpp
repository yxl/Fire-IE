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

		// Enable some new features of IE. Refer to CoInternetSetFeatureEnabled Function on MSDN for more information.
		INTERNETFEATURELIST features[] = {
			FEATURE_WEBOC_POPUPMANAGEMENT,		// 启用IE的弹出窗口管理
			FEATURE_SECURITYBAND,				// 下载和安装插件时提示
			FEATURE_LOCALMACHINE_LOCKDOWN,		// 使用IE的本地安全设置(Apply Local Machine Zone security settings to all local content.)
			FEATURE_SAFE_BINDTOOBJECT,			// ActiveX插件权限的设置, 具体功能不详，Coral IE Tab设置这个选项
			FEATURE_TABBED_BROWSING			// 启用多标签浏览
		};			
		int n = sizeof(features) / sizeof(INTERNETFEATURELIST);
		for (int i=0; i<n; i++)
		{
			CoInternetSetFeatureEnabled(features[i], SET_FEATURE_ON_PROCESS, TRUE);
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

#ifndef _M_X64
		if (OS::GetVersion() == OS::WIN7 || OS::GetVersion() == OS::VISTA)
		{
			BrowserHook::AtlDepHook::s_instance.Uninstall();
		}
#endif

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
			Sleep(100);
		}
		BrowserHook::WindowMessageHook::s_instance.Uninstall();
	}
}