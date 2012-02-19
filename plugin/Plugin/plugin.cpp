/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* ***** BEGIN LICENSE BLOCK *****
* Version: NPL 1.1/GPL 2.0/LGPL 2.1
*
* The contents of this file are subject to the Netscape Public License
* Version 1.1 (the "License"); you may not use this file except in
* compliance with the License. You may obtain a copy of the License at
* http://www.mozilla.org/NPL/
*
* Software distributed under the License is distributed on an "AS IS" basis,
* WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
* for the specific language governing rights and limitations under the
* License.
*
* The Original Code is mozilla.org code.
*
* The Initial Developer of the Original Code is 
* Netscape Communications Corporation.
* Portions created by the Initial Developer are Copyright (C) 1998
* the Initial Developer. All Rights Reserved.
*
* Contributor(s):
*
* Alternatively, the contents of this file may be used under the terms of
* either the GNU General Public License Version 2 or later (the "GPL"), or 
* the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
* in which case the provisions of the GPL or the LGPL are applicable instead
* of those above. If you wish to allow use of your version of this file only
* under the terms of either the GPL or the LGPL, and not to allow others to
* use your version of this file under the terms of the NPL, indicate your
* decision by deleting the provisions above and replace them with the notice
* and other provisions required by the GPL or the LGPL. If you do not delete
* the provisions above, a recipient may use your version of this file under
* the terms of any one of the NPL, the GPL or the LGPL.
*
* ***** END LICENSE BLOCK ***** */

//////////////////////////////////////////////////
//
// CPlugin class implementation
//
#include "stdafx.h"
#include <windows.h>
#include <windowsx.h>
#include "IEHostWindow.h"
#include "plugin.h"
#include "npfunctions.h"
#include "ScriptablePluginObject.h"
#include "HttpMonitorAPP.h"
#include "WindowMessageHook.h"

namespace Plugin
{
	/** 用于监视HTTP和HTTPS请求, 同步Cookie */
	CComPtr<IClassFactory> g_spCFHTTP;
	CComPtr<IClassFactory> g_spCFHTTPS;

	typedef PassthroughAPP::CMetaFactory<PassthroughAPP::CComClassFactoryProtocol, HttpMonitor::HttpMonitorAPP> MetaFactory;

	// global plugin initialization
	NPError NS_PluginInitialize()
	{
    /*
    // 监视http和https请求，同步cookie
		CComPtr<IInternetSession> spSession;
		HRESULT hret = S_OK;
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
    */
		if (!BrowserHook::WindowMessageHook::s_instance.Install())
		{
			return NPERR_GENERIC_ERROR;
		}

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
	}


	CPlugin::CPlugin(NPP pNPInstance) :
	m_pNPInstance(pNPInstance),
		m_pNPStream(NULL),
		m_bInitialized(false),
		m_pScriptableObject(NULL),
		m_pIEHostWindow(NULL)
	{
	}

	CPlugin::~CPlugin()
	{
		if (m_pScriptableObject)
			NPN_ReleaseObject(m_pScriptableObject);
		if (m_pIEHostWindow)
			delete m_pIEHostWindow;
	}


	NPBool CPlugin::init(NPWindow* pNPWindow)
	{
		AfxEnableControlContainer();

		if(pNPWindow == NULL)
			return FALSE;

		m_hWnd = (HWND)pNPWindow->window;
		if (!IsWindow(m_hWnd))
			return FALSE;

		// 获取Plugin所在页面的URL, URL的格式是chrome://fireie/content/container.xhtml?url=XXX，
		// 其中XXX是实际要访问的URL
		CString strHostUrl = GetHostURL();
		static const CString PREFIX(_T("chrome://fireie/content/container.xhtml?url="));

		// 安全检查, 检查Plugin所在页面的URL，不允许其他插件或页面调用这个Plugin
		if (!strHostUrl.Mid(0, PREFIX.GetLength()) == PREFIX)
			return FALSE;

		// 从URL参数中获取实际要访问的URL地址
		CString url = strHostUrl.Mid(PREFIX.GetLength());

		CWnd parent;
		if (!parent.Attach(m_hWnd))
			return FALSE;
		try
		{
			DWORD id = GetNavigateWindowId();
			CString post = GetNavigatePostData();
			CString headers = GetNavigateHeaders();
			RemoveNavigateParams();
			if (id != 0)
			{
				CIEHostWindow::s_csNewIEWindowMap.Lock();
				// CIEhostWindow已创建
				m_pIEHostWindow = CIEHostWindow::s_NewIEWindowMap.Lookup(id);
				if (m_pIEHostWindow)
				{
					m_pIEHostWindow->SetPlugin(this);
					CIEHostWindow::s_NewIEWindowMap.Remove(id);
				}
				CIEHostWindow::s_csNewIEWindowMap.Unlock();
			}
			if (m_pIEHostWindow == NULL)
			{
				m_pIEHostWindow = new CIEHostWindow(this);
				if (m_pIEHostWindow == NULL || !m_pIEHostWindow->Create(CIEHostWindow::IDD))
				{
					throw CString(_T("Cannot Create CIEHostWindow!"));
				}
			}
			m_pIEHostWindow->SetParent(&parent);
			CRect rect;
			parent.GetClientRect(rect);
			m_pIEHostWindow->MoveWindow(rect);
			m_pIEHostWindow->ShowWindow(SW_SHOW);
			if (id == 0)
			{
				m_pIEHostWindow->Navigate(url, post, headers);
			}
		}
		catch (CString strMessage)
		{
			if (m_pIEHostWindow)
				delete m_pIEHostWindow;
			parent.Detach();
			TRACE(_T("[CPlugin::init] Exception: %s\n"), (LPCTSTR)strMessage);
			return FALSE;
		}
		parent.Detach();


		ScriptablePluginObject* sp = static_cast<ScriptablePluginObject*>(GetScriptableObject());
		if (sp == NULL)
			return false;
		sp->SetMainWindow(m_pIEHostWindow);

		// 有了这两句, Firefox 窗口变化的时候才会通知 IE 窗口刷新显示
		SetWindowLong(m_hWnd, GWL_STYLE, GetWindowLong(m_hWnd, GWL_STYLE)|WS_CLIPCHILDREN);
		SetWindowLong(m_hWnd, GWL_EXSTYLE, GetWindowLong(m_hWnd, GWL_EXSTYLE)|WS_EX_CONTROLPARENT);

		m_bInitialized = TRUE;
		return TRUE;
	}

	NPError CPlugin::SetWindow(NPWindow* aWindow)
	{
		m_hWnd = (HWND)aWindow->window;
		if (IsWindow(m_hWnd) && m_pIEHostWindow && IsWindow(m_pIEHostWindow->GetSafeHwnd()))
		{
			CRect rect(0, 0, aWindow->width, aWindow->height);
			m_pIEHostWindow->MoveWindow(rect);
		}
		return NPERR_NO_ERROR;
	}

	void CPlugin::shut()
	{
		m_pIEHostWindow->DestroyWindow();
		m_hWnd = NULL;
		m_bInitialized = false;
	}

	void CPlugin::setStatus(const CString& text)
	{
		if (m_pNPInstance)
		{
			char* message = CStringToNPStringCharacters(text);
			NPN_Status(m_pNPInstance, message);
			NPN_MemFree(message);
		}
	}

	NPBool CPlugin::isInitialized()
	{
		return m_bInitialized;
	}

	NPObject *CPlugin::GetScriptableObject()
	{
		if (!m_pScriptableObject) 
		{
			m_pScriptableObject =
				NPN_CreateObject(m_pNPInstance,
				GET_NPOBJECT_CLASS(ScriptablePluginObject));
		}

		if (m_pScriptableObject) 
		{
			NPN_RetainObject(m_pScriptableObject);
		}

		return m_pScriptableObject;
	}

	// 获取Plugin所在页面的URL
	CString CPlugin::GetHostURL() const
	{
		CString url;

		BOOL bOK = FALSE;
		NPObject* pWindow = NULL;
		NPVariant vLocation;
		VOID_TO_NPVARIANT(vLocation);
		NPVariant vHref;
		VOID_TO_NPVARIANT(vHref);

		try 
		{

			if (( NPN_GetValue( m_pNPInstance, NPNVWindowNPObject, &pWindow) != NPERR_NO_ERROR ) || !pWindow )
			{
				throw(CString(_T("Cannot get window")));
			}

			if ((!NPN_GetProperty( m_pNPInstance, pWindow, NPN_GetStringIdentifier ("location"), &vLocation)) || !NPVARIANT_IS_OBJECT (vLocation))
			{
				throw(CString(_T("Cannot get window.location")));
			}

			if ((!NPN_GetProperty( m_pNPInstance, NPVARIANT_TO_OBJECT(vLocation), NPN_GetStringIdentifier ("href"), &vHref)) || !NPVARIANT_IS_STRING(vHref))
			{
				throw(CString(_T("Cannot get window.location.href")));
			}

			// 转换window.location.href的编码
			int buffer_size = vHref.value.stringValue.UTF8Length + 1;
			char* szUnescaped = new char[buffer_size];
			DWORD dwSize = buffer_size;
			if (SUCCEEDED(UrlUnescapeA(const_cast<LPSTR>(vHref.value.stringValue.UTF8Characters), szUnescaped, &dwSize, 0)))
			{
				WCHAR* szURL = new WCHAR[dwSize + 1];
				if (MultiByteToWideChar(CP_UTF8, 0, szUnescaped, -1, szURL, dwSize + 1) > 0)
				{
					url = CW2T(szURL);
				}
				delete[] szURL;
			}
			delete[] szUnescaped;

		}
		catch (CString strMessage)
		{
			TRACE(_T("[CPlugin::GetHostURL Exception] %s"), strMessage);
		}

		if (!NPVARIANT_IS_VOID(vHref))	NPN_ReleaseVariantValue(&vHref);
		if (!NPVARIANT_IS_VOID(vLocation))	NPN_ReleaseVariantValue(&vLocation);
		if (pWindow != NULL) NPN_ReleaseObject(pWindow);

		return url;
	}

	CString CPlugin::GetNavigateParam(const NPUTF8* name) const
	{
		CString strParam;

		NPObject* pWindow = NULL;
		NPVariant vFireIEContainer;
		VOID_TO_NPVARIANT(vFireIEContainer);
		NPVariant vParam;
		VOID_TO_NPVARIANT(vParam);

		try
		{
			if ((NPN_GetValue( m_pNPInstance, NPNVWindowNPObject, &pWindow) != NPERR_NO_ERROR ) || !pWindow )
			{
				throw(CString(_T("Cannot get window")));
			}

			if ((!NPN_GetProperty( m_pNPInstance, pWindow, NPN_GetStringIdentifier ("FireIEContainer"), &vFireIEContainer)) || !NPVARIANT_IS_OBJECT (vFireIEContainer))
			{
				throw(CString(_T("Cannot get window.FireIEContainer")));
			}

			if (!NPN_Invoke(m_pNPInstance, NPVARIANT_TO_OBJECT(vFireIEContainer), NPN_GetStringIdentifier(name), NULL, 0, &vParam))
			{
				throw(CString(_T("Cannot execute window.FireIEContainer.getXXX()")));
			}
			if (!NPVARIANT_IS_STRING(vParam)) 
			{
				throw(CString(_T("Invalid return value.")));
			}
			strParam = NPStringToCString(vParam.value.stringValue);
		}
		catch (CString strMessage)
		{
			TRACE(_T("[CPlugin::GetNavigateHeaders Exception] %s"), strMessage);
		}

		if (!NPVARIANT_IS_VOID(vParam))	NPN_ReleaseVariantValue(&vParam);
		if (!NPVARIANT_IS_VOID(vFireIEContainer))	NPN_ReleaseVariantValue(&vFireIEContainer);
		if (pWindow != NULL) NPN_ReleaseObject(pWindow);

		return strParam;
	}
	// 获取IECtrl::Navigate的Http headers参数
	CString CPlugin::GetNavigateHeaders() const
	{
		return GetNavigateParam("getNavigateHeaders");
	}

	// 获取IECtrl::Navigate的Post data参数
	CString CPlugin::GetNavigatePostData() const
	{
		return GetNavigateParam("getNavigatePostData");
	}

	// 获取CIEHostWindow ID
	DWORD CPlugin::GetNavigateWindowId() const
	{
		CString strID = GetNavigateParam("getNavigateWindowId");
		return _tcstoul(strID, NULL, 10);
	}

	// 清空IECtrl::Navigate的参数
	void CPlugin::RemoveNavigateParams()
	{
		NPObject* pWindow = NULL;
		NPVariant vFireIEContainer;
		VOID_TO_NPVARIANT(vFireIEContainer);
		NPVariant vResult;
		VOID_TO_NPVARIANT(vResult);

		try
		{
			if ((NPN_GetValue( m_pNPInstance, NPNVWindowNPObject, &pWindow) != NPERR_NO_ERROR ) || !pWindow )
			{
				throw(CString(_T("Cannot get window")));
			}

			if ((!NPN_GetProperty( m_pNPInstance, pWindow, NPN_GetStringIdentifier ("FireIEContainer"), &vFireIEContainer)) || !NPVARIANT_IS_OBJECT (vFireIEContainer))
			{
				throw(CString(_T("Cannot get window.FireIEContainer")));
			}

			if (!NPN_Invoke(m_pNPInstance, NPVARIANT_TO_OBJECT(vFireIEContainer), NPN_GetStringIdentifier("removeNavigateParams"), NULL, 0, &vResult))
			{
				throw(CString(_T("Cannot execute window.FireIEContainer.removeNavigateParams()")));
			}
		}
		catch (CString strMessage)
		{
			TRACE(_T("[CPlugin::RemoveNavigateParams Exception] %s"), strMessage);
		}

		if (!NPVARIANT_IS_VOID(vResult))	NPN_ReleaseVariantValue(&vResult);
		if (!NPVARIANT_IS_VOID(vFireIEContainer))	NPN_ReleaseVariantValue(&vFireIEContainer);
		if (pWindow != NULL) NPN_ReleaseObject(pWindow);
	}

	// This function is equivalent to the following JavaScript function:
	// function FireEvent(strEventType, strDetail) {
	//   var event = document.createEvent("CustomEvent");
	//   event.initCustomEvent(strEventType, true, true, strDetail);
	//   pluginObject.dispatchEvent(event);
	// }
	// 
	// Uses following JavaScript code to listen to the event fired:
	// pluginObject.addEventListener(strEventType, function(event) {
	//    alert(event.detail);
	// }
	BOOL CPlugin::FireEvent(const CString &strEventType, const CString &strDetail)
	{
		BOOL bOK = FALSE;
		NPObject* pWindow = NULL;
		NPVariant vDocument;
		VOID_TO_NPVARIANT(vDocument);
		NPVariant vEvent;
		NPObject* pDocument = NULL;
		VOID_TO_NPVARIANT(vEvent);
		NPObject *pEvent = NULL;
		NPObject* pPlugin = NULL;

		try
		{
			// get window object
			if (NPN_GetValue(m_pNPInstance, NPNVWindowNPObject, &pWindow) != NPERR_NO_ERROR || pWindow == NULL)
			{
				throw CString(_T("Cannot get window"));
			}

			// get window.document
			bOK = NPN_GetProperty(m_pNPInstance, pWindow, NPN_GetStringIdentifier("document"), &vDocument);
			if (!NPVARIANT_IS_OBJECT(vDocument) || !bOK)
			{
				throw CString(_T("Cannot get window.document"));
			}
			pDocument = NPVARIANT_TO_OBJECT(vDocument);

			// var event = document.createEvent("CustomEvent");
			if (pDocument) 
			{
				NPVariant arg;
				STRINGZ_TO_NPVARIANT(CStringToNPStringCharacters(_T("CustomEvent")), arg);
				bOK = NPN_Invoke(m_pNPInstance, pDocument, NPN_GetStringIdentifier("createEvent"), &arg, 1, &vEvent);
				NPN_ReleaseVariantValue(&arg);
				if (!NPVARIANT_IS_OBJECT(vEvent) || !bOK)
				{
					throw CString(_T("Cannot document.createEvent"));
				}
			}
			else 
			{
				throw CString(_T("window.document is null"));
			}
			pEvent = NPVARIANT_TO_OBJECT(vEvent);;

			// event.initCustomEvent(strEventType, true, true, strDetail);
			if (pEvent)
			{
				NPVariant args[4];
				STRINGZ_TO_NPVARIANT(CStringToNPStringCharacters(strEventType), args[0]);
				BOOLEAN_TO_NPVARIANT(true, args[1]);
				BOOLEAN_TO_NPVARIANT(true, args[2]);
				STRINGZ_TO_NPVARIANT(CStringToNPStringCharacters(strDetail), args[3]);
				NPVariant vResult;
				bOK = NPN_Invoke(m_pNPInstance, pEvent, NPN_GetStringIdentifier("initCustomEvent"), args, 4, &vResult);
				for (int i=0; i<4; i++)
				{
					NPN_ReleaseVariantValue(&args[i]);
				}
				NPN_ReleaseVariantValue(&vResult);
				if (!bOK)
				{
					throw CString(_T("Cannot event.initCustomEvent"));
				}
			}
			else
			{
				throw CString(_T("event is null"));
			}

			// get plugin object
			if (NPN_GetValue(m_pNPInstance, NPNVPluginElementNPObject, &pPlugin) != NPERR_NO_ERROR || pPlugin == NULL)
			{
				throw CString(_T("Cannot get window"));
			}


			// pluginObject.dispatchEvent(event);
			NPVariant vNotCanceled; 
			bOK = NPN_Invoke(m_pNPInstance, pPlugin, NPN_GetStringIdentifier("dispatchEvent"), &vEvent, 1, &vNotCanceled);
			NPN_ReleaseVariantValue(&vEvent);
			if (!bOK || !NPVARIANT_IS_BOOLEAN(vNotCanceled)) 
			{
				throw CString(_T("Cannot dispatchEvent"));
			}
			if (NPVARIANT_TO_BOOLEAN(vNotCanceled) != true)
			{
				throw CString(_T("Event is canceled"));
			}
		}
		catch (CString strMessage)
		{
			TRACE(_T("[CPlugin::FireEvent Exception] %s"), strMessage);
			bOK = FALSE;
		}
		if (pPlugin != NULL) NPN_ReleaseObject(pPlugin);
		if (!NPVARIANT_IS_VOID(vEvent))	NPN_ReleaseVariantValue(&vEvent);
		if (!NPVARIANT_IS_VOID(vDocument))	NPN_ReleaseVariantValue(&vDocument);
		if (pWindow != NULL) NPN_ReleaseObject(pWindow);
		return bOK;
	}

	double CPlugin::GetZoomLevel()
	{
		double level = 1;

		NPObject* pWindow = NULL;
		NPVariant vFireIE;
		VOID_TO_NPVARIANT(vFireIE);
		NPVariant vLevel;
		VOID_TO_NPVARIANT(vLevel);

		try
		{
			if ((NPN_GetValue( m_pNPInstance, NPNVWindowNPObject, &pWindow) != NPERR_NO_ERROR ) || !pWindow )
			{
				throw(CString(_T("Cannot get window")));
			}

			if ((!NPN_GetProperty( m_pNPInstance, pWindow, NPN_GetStringIdentifier ("FireIE"), &vFireIE)) || !NPVARIANT_IS_OBJECT (vFireIE))
			{
				throw(CString(_T("Cannot get window.FireIE")));
			}

			if (!NPN_Invoke(m_pNPInstance, NPVARIANT_TO_OBJECT(vFireIE), NPN_GetStringIdentifier("getZoomLevel"), NULL, 0, &vLevel))
			{
				throw(CString(_T("Cannot execute window.FireIE.getZoomLevel()")));
			}
			if (NPVARIANT_IS_DOUBLE(vLevel)) 
				level = NPVARIANT_TO_DOUBLE(vLevel);
			else if ( NPVARIANT_IS_INT32(vLevel) ) 
				level = NPVARIANT_TO_INT32(vLevel);
		}
		catch (CString strMessage)
		{
			level = 1;
			TRACE(_T("[CPlugin::FireEvent Exception] %s"), strMessage);
		}

		if (!NPVARIANT_IS_VOID(vLevel))	NPN_ReleaseVariantValue(&vLevel);
		if (!NPVARIANT_IS_VOID(vFireIE))	NPN_ReleaseVariantValue(&vFireIE);
		if (pWindow != NULL) NPN_ReleaseObject(pWindow);

		return level;
	}

	CString CPlugin::GetURLCookie(const CString& strURL)
	{
		CString strCookie;
		char* url = CStringToNPStringCharacters(strURL);
		char * cookies = NULL;
		uint32_t len = 0;
		if (NPN_GetValueForURL(m_pNPInstance, NPNURLVCookie, url, &cookies, &len) == NPERR_NO_ERROR && cookies)
		{
			strCookie = UTF8ToCString(cookies);
			NPN_MemFree(cookies);
		}
		NPN_MemFree(url);
		return strCookie;
	}

	void CPlugin::SetURLCookie(const CString& strURL, const CString& strCookie)
	{
		char* url = CStringToNPStringCharacters(strURL);
		char* cookie = CStringToNPStringCharacters(strCookie);
		if (NPN_SetValueForURL(m_pNPInstance, NPNURLVCookie, url, cookie, strlen(cookie)) != NPERR_NO_ERROR)
		{
			TRACE(_T("[CPlugin::SetURLCookie] NPN_SetValueForURL failed! URL: %s"), strURL);
		}
		NPN_MemFree(cookie);
		NPN_MemFree(url);
	}

	CString CPlugin::GetFirefoxUserAgent()
	{
		return UTF8ToCString(NPN_UserAgent(m_pNPInstance));
	}

	void CPlugin::NewIETab(DWORD id, const CString& strURL)
	{
		CString strEventType = _T("NewIETab");
		CString strDetail;
		strDetail.Format(_T("{\"id\": \"%d\", \"url\": \"%s\"}"), id, strURL);
		FireEvent(strEventType, strDetail);
	}

	void CPlugin::CloseIETab()
	{
		CString strEventType = _T("CloseIETab");
		CString strDetail = _T("");
		FireEvent(strEventType, strDetail);
	}

	/** 向Firefox发送IE窗口标题改变的消息 */
	void CPlugin::OnIeTitleChanged(const CString& strTitle)
	{
		CString strEventType = _T("IeTitleChanged");
		CString strDetail = strTitle;
		FireEvent(strEventType, strDetail);
	}
}