#include "StdAfx.h"
#include "PluginGlobal.h"
#include "HttpMonitorAPP.h"
#include "WindowMessageHook.h"
#include "AtlDepHook.h"
#include "OS.h"

namespace Plugin
{
	using namespace Utils;

	/** ���ڼ���HTTP��HTTPS����, ͬ��Cookie */
	CComPtr<IClassFactory> g_spCFHTTP;
	CComPtr<IClassFactory> g_spCFHTTPS;

	typedef PassthroughAPP::CMetaFactory<PassthroughAPP::CComClassFactoryProtocol, HttpMonitor::HttpMonitorAPP> MetaFactory;

	// global plugin initialization
	NPError NS_PluginInitialize()
	{
		// ����http��https����ͬ��cookie�����˹��
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
			FEATURE_WEBOC_POPUPMANAGEMENT,		// ����IE�ĵ������ڹ���
			FEATURE_SECURITYBAND,				// ���غͰ�װ���ʱ��ʾ
			FEATURE_LOCALMACHINE_LOCKDOWN,		// ʹ��IE�ı��ذ�ȫ����(Apply Local Machine Zone security settings to all local content.)
			FEATURE_SAFE_BINDTOOBJECT,			// ActiveX���Ȩ�޵�����, ���幦�ܲ��꣬Coral IE Tab�������ѡ��
			FEATURE_TABBED_BROWSING			// ���ö��ǩ���
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

		// ȡ������http��https����
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