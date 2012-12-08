#include "StdAfx.h"
#include "PluginGlobal.h"
#include "HttpMonitorAPP.h"
#include "WindowMessageHook.h"
#include "AtlDepHook.h"
#include "OS.h"
#include "App.h"

namespace Plugin
{
	using namespace Utils;

	/** ���ڼ���HTTP��HTTPS����, ͬ��Cookie */
	CComPtr<IClassFactory> g_spCFHTTP;
	CComPtr<IClassFactory> g_spCFHTTPS;

	typedef PassthroughAPP::CMetaFactory<PassthroughAPP::CComClassFactoryProtocol, HttpMonitor::HttpMonitorAPP> MetaFactory;

	/** Features that can only be enabled through registry */
	static const struct { TCHAR* feature; DWORD value; } g_RegOnlyFeatures[] = {
		// For compatibility, allow the href attribute of a objects to support the javascript prototcol.
		{ _T("FEATURE_SCRIPTURL_MITIGATION"), 1 },

		// Use confirmation dialog boxes when opening content from potentially untrusted sources
		{ _T("FEATURE_SHOW_APP_PROTOCOL_WARN_DIALOG"), 1 },

		// Security-related features
		{ _T("FEATURE_LOCALMACHINE_LOCKDOWN"), 1 },
		{ _T("FEATURE_RESTRICT_ABOUT_PROTOCOL_IE7"), 1 },
		{ _T("FEATURE_ENABLE_SCRIPT_PASTE_URLACTION_IF_PROMPT"), 0 },
		{ _T("FEATURE_BLOCK_CROSS_PROTOCOL_FILE_NAVIGATION"), 1 },
		{ _T("FEATURE_VIEWLINKEDWEBOC_IS_UNSAFE"), 1 },
		{ _T("FEATURE_IFRAME_MAILTO_THRESHOLD"), 1 },
		{ _T("FEATURE_RESTRICT_RES_TO_LMZ"), 1 },
		{ _T("FEATURE_SHIM_MSHELP_COMBINE"), 0 }
	};
	static const int g_nRegOnlyFeatures = sizeof(g_RegOnlyFeatures) / sizeof(g_RegOnlyFeatures[0]);
	static const CString g_strSubkey = _T("SOFTWARE\\Microsoft\\Internet Explorer\\Main\\FeatureControl\\");

	/** Retrieve feature value from registry */
	static bool getFeatureReg(const TCHAR* feature, DWORD* value)
	{
		HKEY hKey;
		if (ERROR_SUCCESS != RegOpenKeyEx(HKEY_CURRENT_USER, g_strSubkey + feature, 0, KEY_QUERY_VALUE, &hKey))
			return false;
		DWORD dwType;
		DWORD cbData = sizeof(*value);
		bool ret = (ERROR_SUCCESS == RegQueryValueEx(hKey, App::GetProcessName(), NULL, &dwType, (LPBYTE)value, &cbData)
					&& dwType == REG_DWORD);
		RegCloseKey(hKey);
		return ret;
	}

	/** Write feature value into registry */
	static bool setFeatureReg(const TCHAR* feature, DWORD value)
	{
		HKEY hKey;
		if (ERROR_SUCCESS != RegCreateKeyEx(HKEY_CURRENT_USER, g_strSubkey + feature, 0, NULL, 0, KEY_SET_VALUE, NULL, &hKey, NULL))
			return false;
		bool ret = (ERROR_SUCCESS == RegSetValueEx(hKey, App::GetProcessName(), 0, REG_DWORD, (LPBYTE)&value, sizeof(value)));
		RegCloseKey(hKey);
		return ret;
	}

	/** Ensures feature is set to the given value */
	static bool ensureFeatureReg(const TCHAR* feature, DWORD value)
	{
		DWORD origValue;
		if (getFeatureReg(feature, &origValue) && origValue == value)
			return true;
		return setFeatureReg(feature, value);
	}

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

		// Enable registry-only features
		for (int i = 0; i < g_nRegOnlyFeatures; i++)
		{
			auto& rof = g_RegOnlyFeatures[i];
			ensureFeatureReg(rof.feature, rof.value);
		}

		// Enable some new features of IE. Refer to CoInternetSetFeatureEnabled Function on MSDN for more information.
		INTERNETFEATURELIST features[] = {
			FEATURE_WEBOC_POPUPMANAGEMENT,		// ����IE�ĵ������ڹ���
			FEATURE_SECURITYBAND,				// ���غͰ�װ���ʱ��ʾ
			FEATURE_LOCALMACHINE_LOCKDOWN,		// ʹ��IE�ı��ذ�ȫ����(Apply Local Machine Zone security settings to all local content.)
			FEATURE_SAFE_BINDTOOBJECT,			// ActiveX���Ȩ�޵�����, ���幦�ܲ��꣬Coral IE Tab�������ѡ��
			FEATURE_TABBED_BROWSING,			// ���ö��ǩ���
			FEATURE_SSLUX,						// ��SSL����ҳ�����ģ̬�Ի���
			FEATURE_VALIDATE_NAVIGATE_URL,		// ��ֹ����badly-formed URL
			FEATURE_DISABLE_NAVIGATION_SOUNDS,	// �ر�ҳ���л�ʱ�ĵ������ʹ֮����Firefox
			FEATURE_BLOCK_INPUT_PROMPTS,		// ��������ֹ��������javascript prompt
			FEATURE_MIME_HANDLING,				// MIME Type ����
			FEATURE_UNC_SAVEDFILECHECK,			// UNC·��MotW����
			FEATURE_HTTP_USERNAME_PASSWORD_DISABLE // ��ֹ��httpЭ���URL�а����û�������
		};
		int n = sizeof(features) / sizeof(INTERNETFEATURELIST);
		for (int i = 0; i < n; i++)
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