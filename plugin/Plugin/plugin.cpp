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
#include "Poco/URI.h"
#include "json/json.h"

namespace Plugin
{

	CPlugin::CPlugin(const nsPluginCreateData& data)
		:m_pNPInstance(data.instance),
		m_pNPStream(NULL),
		m_bInitialized(false),
		m_pScriptableObject(NULL),
		m_pIEHostWindow(NULL)
	{
		USES_CONVERSION_EX;
		// <html:embed id='fireie-cookie-object' type='application/fireie' hidden='true' width='0' height='0'/>
		// argc == 5
		// argn[0] = "id",                   argn[1] = "type",               argn[2] = "hidden", argn[3] = "width", argn[4] = "height"
		// argn[0] = "fireie-cookie-object", argn[1] = "application/fireie", argn[2] = "true",   argn[3]="0",       argn[4]="0"

		// 从Plugin参数中获取Plugin ID
		int i = 0;
		for (i=0; i<data.argc; i++)
		{
			if (_stricmp(data.argn[i], "id") == 0)
			{
				break;			
			}
		}
		if (i < data.argc)
		{
			m_strId = A2T_EX(data.argv[i], strlen(data.argv[i]) + 1);
		}
	}

	CPlugin::~CPlugin()
	{
		if (m_pScriptableObject)
			NPN_ReleaseObject(m_pScriptableObject);
		if (m_pIEHostWindow)
		{
			delete m_pIEHostWindow;
			m_pIEHostWindow = NULL;
		}
	}


	NPBool CPlugin::init(NPWindow* pNPWindow)
	{
		if(pNPWindow == NULL)
			return FALSE;

		m_hWnd = (HWND)pNPWindow->window;
		if (!IsWindow(m_hWnd))
			return FALSE;

		DWORD navId = 0;
		CString url;

		if (m_strId == _T("fireie-object"))
		{
			// 获取Plugin所在页面的URL, URL的格式是chrome://fireie/content/container.xhtml?url=XXX，
			// 其中XXX是实际要访问的URL
			CString strHostUrl = GetHostURL();
			static const CString PREFIX(_T("chrome://fireie/content/container.xhtml?url="));

			// 安全检查, 检查Plugin所在页面的URL，不允许其他插件或页面调用这个Plugin
			if (!strHostUrl.Mid(0, PREFIX.GetLength()) == PREFIX)
				return FALSE;

			// 从URL参数中获取实际要访问的URL地址
			url = strHostUrl.Mid(PREFIX.GetLength());

			// 获取从Firefox传入的其他参数
			navId = GetNavigateWindowId();
			RemoveNavigateParams();
		}

		m_pIEHostWindow = CreateIEHostWindow(m_hWnd, navId);
		if (m_pIEHostWindow == NULL)
		{
			return FALSE;
		}

		if (m_strId == _T("fireie-cookie-object"))
		{
			CIEHostWindow::AddCookieIEWindow(m_pIEHostWindow);
		}

		// navId为0时，IEHostWindow是新创建的，需要指定浏览器的地址
		if (navId == 0)
		{
			m_pIEHostWindow->Navigate(url);
		}

		// 有了这两句, Firefox 窗口变化的时候才会通知 IE 窗口刷新显示
		SetWindowLong(m_hWnd, GWL_STYLE, GetWindowLong(m_hWnd, GWL_STYLE)|WS_CLIPCHILDREN);
		SetWindowLong(m_hWnd, GWL_EXSTYLE, GetWindowLong(m_hWnd, GWL_EXSTYLE)|WS_EX_CONTROLPARENT);

		m_bInitialized = TRUE;
		return TRUE;
	}

	CIEHostWindow* CPlugin::CreateIEHostWindow(HWND hParent, DWORD dwId)
	{
		CIEHostWindow *pIEHostWindow = NULL;
		CWnd parent;
		if (!parent.Attach(hParent))
		{
			return NULL;
		}
		try
		{
			pIEHostWindow = CIEHostWindow::CreateNewIEHostWindow(dwId);
			if (pIEHostWindow == NULL)
			{
				throw CString(_T("Cannot Create CIEHostWindow!"));
			}
			pIEHostWindow->SetPlugin(this);
			pIEHostWindow->SetParent(&parent);
			CRect rect;
			parent.GetClientRect(rect);
			pIEHostWindow->MoveWindow(rect);
			pIEHostWindow->ShowWindow(SW_SHOW);
		}
		catch (CString strMessage)
		{
			if (pIEHostWindow) 
			{
				delete pIEHostWindow;
				pIEHostWindow = NULL;
			}
			TRACE(_T("[CPlugin::CreateIEHostWindow] Exception: %s\n"), (LPCTSTR)strMessage);
		}
		parent.Detach();
		return pIEHostWindow;
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
		if (m_pIEHostWindow)
		{
			m_pIEHostWindow->DestroyWindow(); 
		}
		m_hWnd = NULL;
		m_bInitialized = FALSE;
	}

	void CPlugin::SetStatus(const CString& text)
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
		NPVariant vFireIEContainer;
		VOID_TO_NPVARIANT(vFireIEContainer);
		NPVariant vLevel;
		VOID_TO_NPVARIANT(vLevel);

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

			if (!NPN_Invoke(m_pNPInstance, NPVARIANT_TO_OBJECT(vFireIEContainer), NPN_GetStringIdentifier("getZoomLevel"), NULL, 0, &vLevel))
			{
				throw(CString(_T("Cannot execute window.FireIEContainer.getZoomLevel()")));
			}
			if (NPVARIANT_IS_DOUBLE(vLevel)) 
				level = NPVARIANT_TO_DOUBLE(vLevel);
			else if ( NPVARIANT_IS_INT32(vLevel) ) 
				level = NPVARIANT_TO_INT32(vLevel);
		}
		catch (CString strMessage)
		{
			level = 1;
			TRACE(_T("[CPlugin::GetZoomLevel Exception] %s"), strMessage);
		}

		if (!NPVARIANT_IS_VOID(vLevel))	NPN_ReleaseVariantValue(&vLevel);
		if (!NPVARIANT_IS_VOID(vFireIEContainer))	NPN_ReleaseVariantValue(&vFireIEContainer);
		if (pWindow != NULL) NPN_ReleaseObject(pWindow);

		return level;
	}

	void CPlugin::SetFirefoxCookie(const CString& strURL, const CString& strCookieHeader)
	{
		USES_CONVERSION_EX;
		CString strEventType = _T("IESetCookie");
		CString strDetail;
		Json::Value json;
		json["url"] = T2A_EX(strURL, strURL.GetLength() + 1);
		json["header"] = T2A_EX(strCookieHeader, strCookieHeader + 1);
		const char* szDetail = json.toStyledString().c_str();
		strDetail = A2T_EX(szDetail, stlen(szDetail) + 1);
		FireEvent(strEventType, strDetail);
	}

	void CPlugin::SetURLCookie(const CString& strURL, const CString& strCookie)
	{
		char* url = CStringToNPStringCharacters(strURL);
		char* cookie = CStringToNPStringCharacters(strCookie);
		if (NPN_SetValueForURL(m_pNPInstance, NPNURLVCookie, url, cookie, (uint32_t)strlen(cookie)) != NPERR_NO_ERROR)
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

	void CPlugin::IENewTab(DWORD id, const CString& strURL)
	{
		CString strEventType = _T("IENewTab");
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
	void CPlugin::OnIETitleChanged(const CString& strTitle)
	{
		CString strEventType = _T("IETitleChanged");
		CString strDetail = strTitle;
		FireEvent(strEventType, strDetail);
	}

	/** 通过消息向Firefox发送IE的UserAgent*/
	void CPlugin::OnIEUserAgentReceived(const CString& strUserAgent)
	{
		CString strEventType = _T("IEUserAgentReceived");
		CString strDetail = strUserAgent;
		FireEvent(strEventType, strDetail);
	}

	void CPlugin::OnDocumentComplete()
	{
		CString strEventType = _T("IEDocumentComplete");
		CString strDetail = _T("");
		FireEvent(strEventType, strDetail);
	}
}