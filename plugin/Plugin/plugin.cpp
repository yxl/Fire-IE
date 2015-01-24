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
#include "IEHostWindow.h"
#include "plugin.h"
#include "npfunctions.h"
#include "ScriptablePluginObject.h"
#include "json/json.h"
#include "OS.h"
#include "comfix.h"

#ifdef DEBUG
#include "test/test.h"
#endif

using namespace UserMessage;

namespace Plugin
{

	std::unordered_map<CPlugin::utf8string, NPIdentifier> CPlugin::s_mapIdentifierCache;

	CPlugin::CPlugin(const nsPluginCreateData& data)
		:m_pNPInstance(data.instance),
		m_pNPStream(NULL),
		m_bInitialized(false),
		m_pScriptableObject(NULL),
		m_pIEHostWindow(NULL),
		m_pWindow(NULL),
		m_pContainer(NULL),
		m_pDocument(NULL),
		m_pPlugin(NULL)
	{
		USES_CONVERSION_EX;
		// <html:embed id='fireie-utils-object' type='application/fireie' hidden='true' width='0' height='0'/>
		// argc == 5
		// argn[0] = "id",                   argn[1] = "type",               argn[2] = "hidden", argn[3] = "width", argn[4] = "height"
		// argn[0] = "fireie-utils-object", argn[1] = "application/fireie", argn[2] = "true",   argn[3]="0",       argn[4]="0"

		// Get Plugin ID
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

		if (m_pWindow)
			NPN_ReleaseObject(m_pWindow);
		if (m_pContainer)
			NPN_ReleaseObject(m_pContainer);
		if (m_pDocument)
			NPN_ReleaseObject(m_pDocument);
		if (m_pPlugin)
			NPN_ReleaseObject(m_pPlugin);
	}

	NPObject* CPlugin::GetWindowPropertyObject(const NPUTF8* szPropertyName) const
	{
		NPObject* pWindow = GetWindow();
		NPVariant vObject;
		VOID_TO_NPVARIANT(vObject);

		if ((!NPN_GetProperty(m_pNPInstance, pWindow, GetIdentifier(szPropertyName), &vObject)) || !NPVARIANT_IS_OBJECT(vObject))
		{
			if (!NPVARIANT_IS_VOID(vObject))
				NPN_ReleaseVariantValue(&vObject);
			throw CString(_T("Cannot get window.")) + NPStringCharactersToCString(szPropertyName);
		}

		NPObject* pObject = NPVARIANT_TO_OBJECT(vObject);
		if (!pObject)
		{
			NPN_ReleaseVariantValue(&vObject);
			throw CString(_T("window.")) + NPStringCharactersToCString(szPropertyName) + _T(" is null");
		}

		NPN_RetainObject(pObject);
		NPN_ReleaseVariantValue(&vObject);

		return pObject;
	}

	NPObject* CPlugin::GetEnvironmentObject(NPNVariable variable, const TCHAR* szDescription) const
	{
		NPObject* pObject;

		if ((NPN_GetValue(m_pNPInstance, variable, &pObject) != NPERR_NO_ERROR) || !pObject)
			throw CString(_T("Cannot get ")) + szDescription;

		return pObject;
	}

	NPObject* CPlugin::GetWindow() const
	{
		if (m_pWindow)
			return m_pWindow;

		m_pWindow = GetEnvironmentObject(NPNVWindowNPObject, _T("window"));
		return m_pWindow;
	}

	NPObject* CPlugin::GetContainer() const
	{
		if (m_pContainer)
			return m_pContainer;

		m_pContainer = GetWindowPropertyObject(RES_CONTAINER);
		return m_pContainer;
	}

	NPObject* CPlugin::GetDocument() const
	{
		if (m_pDocument)
			return m_pDocument;

		m_pDocument = GetWindowPropertyObject("document");
		return m_pDocument;
	}

	NPObject* CPlugin::GetPlugin() const
	{
		if (m_pPlugin)
			return m_pPlugin;

		m_pPlugin = GetEnvironmentObject(NPNVPluginElementNPObject, _T("plugin element"));
		return m_pPlugin;
	}

	NPIdentifier CPlugin::GetIdentifier(const NPUTF8* npcharsId)
	{
		utf8string utf8strId = npcharsId;
		auto iter = s_mapIdentifierCache.find(utf8strId);
		if (iter != s_mapIdentifierCache.end())
			return iter->second;

		NPIdentifier npid = NPN_GetStringIdentifier(npcharsId);

		s_mapIdentifierCache.insert(make_pair(std::move(utf8strId), npid));
		return npid;
	}

	NPBool CPlugin::init(NPWindow* pNPWindow)
	{
		if(pNPWindow == NULL)
			return FALSE;

		m_hWnd = (HWND)pNPWindow->window;
		if (!IsWindow(m_hWnd))
			return FALSE;

		ULONG_PTR ulId = 0;
		CString url;
		CString post;
		CString headers;

		bool bIsContentPlugin = m_strId == RES_OBJECTNAME_T;
		m_bIsUtilsPlugin = m_strId == RES_UTILS_OBJECT_T;

		if (bIsContentPlugin)
		{
			// Fetch the hosting page's URL. The format is chrome://fireie/content/container.xhtml?url=XXX
			// where XXX is the actual URL to visit
			CString strHostUrl = GetHostURL();
			static const CString PREFIX(RES_CHROME_PREFIX_T);

			// Secrity check. Do not allow other pages to load this plugin.
			if (strHostUrl.Mid(0, PREFIX.GetLength()) != PREFIX)
				return FALSE;

			// Fetch the URL to visit from host URL
			url = strHostUrl.Mid(PREFIX.GetLength());

			// Fetch other parameters from Firefox
			ulId = GetNavigateWindowId();
			post = GetNavigatePostData();
			headers = GetNavigateHeaders();
			RemoveNavigateParams();
		}
		else if (m_bIsUtilsPlugin)
		{
			CString strHostUrl = GetHostURL();

			// Secrity check. Do not allow pages other than the hidden window to load the utils plugin.
			if (strHostUrl != RES_UTILS_URL_T)
				return FALSE;
		}
		else return FALSE;

		bool bIsNewlyCreated = true;
		m_pIEHostWindow = CreateIEHostWindow(m_hWnd, ulId, m_bIsUtilsPlugin, &bIsNewlyCreated);
		if (m_pIEHostWindow == NULL)
		{
			return FALSE;
		}

		if (m_bIsUtilsPlugin)
		{
			CIEHostWindow::AddUtilsIEWindow(m_pIEHostWindow);
		}

		// if the IEHostWindow is newly created, we should specify its URL
		if (bIsNewlyCreated)
		{
			m_pIEHostWindow->Navigate(url, post, headers);
		}

		// Let IE redraw when Firefox window size changes
		SetWindowLong(m_hWnd, GWL_STYLE, GetWindowLong(m_hWnd, GWL_STYLE)|WS_CLIPCHILDREN);
		SetWindowLong(m_hWnd, GWL_EXSTYLE, GetWindowLong(m_hWnd, GWL_EXSTYLE)|WS_EX_CONTROLPARENT);

		m_bInitialized = TRUE;

		// Init event is fired when the scriptable plugin object is created

		return TRUE;
	}

	CIEHostWindow* CPlugin::CreateIEHostWindow(HWND hParent, ULONG_PTR ulId, bool isUtils, bool* opIsNewlyCreated)
	{
		CIEHostWindow *pIEHostWindow = NULL;
		CWnd parent;
		if (!parent.Attach(hParent))
		{
			return NULL;
		}
		try
		{
			pIEHostWindow = CIEHostWindow::CreateNewIEHostWindow(&parent, ulId, isUtils, opIsNewlyCreated);
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
		catch (const CString& strMessage)
		{
			if (pIEHostWindow)
			{
				delete pIEHostWindow;
				pIEHostWindow = NULL;
			}
			UNUSED(strMessage);
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

	bool CPlugin::ShouldShowStatusOurselves()
	{
		// handle all status text ourselves
		return true;
	}

	bool CPlugin::ShouldPreventStatusFlash()
	{
		//// return true; // for debugging under win7
		//return Utils::OS::GetVersion() == Utils::OS::WINXP
		//	|| Utils::OS::GetVersion() == Utils::OS::WIN2003;

		// Above all nonsense = =||
		// Flashing is related to IE version, IE9 or higher won't flash
		return Utils::OS::GetIEVersion() < 9;
	}

	void CPlugin::SetStatus(const CString& text)
	{
		if (ShouldShowStatusOurselves())
		{
			FireEvent(_T("IEStatusChanged"), text);
			return;
		}

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

	void CPlugin::FireInitEvent()
	{
		if (m_bIsUtilsPlugin)
			OnUtilsPluginInit();
		else
			OnContentPluginInit();
	}

	NPObject *CPlugin::GetScriptableObject()
	{
		if (!m_pScriptableObject) 
		{
			m_pScriptableObject =
				NPN_CreateObject(m_pNPInstance,
				GET_NPOBJECT_CLASS(ScriptablePluginObject));
			if (m_pIEHostWindow)
				m_pIEHostWindow->RunAsync([this] { FireInitEvent(); });
		}

		if (m_pScriptableObject) 
		{
			NPN_RetainObject(m_pScriptableObject);
		}

		return m_pScriptableObject;
	}

	// Get the URL of the page where the plugin is hosted
	CString CPlugin::GetHostURL() const
	{
		CString url;

		BOOL bOK = FALSE;
		NPVariant vLocation;
		VOID_TO_NPVARIANT(vLocation);
		NPVariant vHref;
		VOID_TO_NPVARIANT(vHref);

		try 
		{
			NPObject* pWindow = GetWindow();

			if ((!NPN_GetProperty( m_pNPInstance, pWindow, GetIdentifier("location"), &vLocation)) || !NPVARIANT_IS_OBJECT (vLocation))
			{
				throw(CString(_T("Cannot get window.location")));
			}

			if ((!NPN_GetProperty( m_pNPInstance, NPVARIANT_TO_OBJECT(vLocation), GetIdentifier("href"), &vHref)) || !NPVARIANT_IS_STRING(vHref))
			{
				throw(CString(_T("Cannot get window.location.href")));
			}

			// Convert encoding of window.location.href
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
		catch (const CString& strMessage)
		{
			UNUSED(strMessage);
			TRACE(_T("[CPlugin::GetHostURL Exception] %s\n"), strMessage);
		}

		if (!NPVARIANT_IS_VOID(vHref))	NPN_ReleaseVariantValue(&vHref);
		if (!NPVARIANT_IS_VOID(vLocation))	NPN_ReleaseVariantValue(&vLocation);

		return url;
	}

	CString CPlugin::GetNavigateParam(const NPUTF8* name) const
	{
		CString strParam;

		NPVariant vParam;
		VOID_TO_NPVARIANT(vParam);

		try
		{
			NPObject* pContainer = GetContainer();

			if (!NPN_Invoke(m_pNPInstance, pContainer, GetIdentifier(name), NULL, 0, &vParam))
			{
				throw(CString(_T("Cannot invoke window.Container.getXXX()")));
			}
			if (!NPVARIANT_IS_STRING(vParam)) 
			{
				throw(CString(_T("Invalid return value.")));
			}
			strParam = NPStringToCString(vParam.value.stringValue);
		}
		catch (const CString& strMessage)
		{
			UNUSED(strMessage);
			TRACE(_T("[CPlugin::GetNavigateHeaders Exception] %s\n"), strMessage);
		}

		if (!NPVARIANT_IS_VOID(vParam))	NPN_ReleaseVariantValue(&vParam);

		return strParam;
	}

	// Get CIEHostWindow ID
	ULONG_PTR CPlugin::GetNavigateWindowId() const
	{
		CString strId = GetNavigateParam("getNavigateWindowId");
#ifdef _M_X64
		return _tcstoui64(strId, NULL, 10);
#else
		return _tcstoul(strId, NULL, 10);
#endif
	}

	// Get Http headers paramter for IECtrl::Navigate
	CString CPlugin::GetNavigateHeaders() const
	{
		return GetNavigateParam("getNavigateHeaders");
	}

	// Get post data paramter for IECtrl::Navigate
	CString CPlugin::GetNavigatePostData() const
	{
		return GetNavigateParam("getNavigatePostData");
	}

	// Clear all the paramters for IECtrl::Navigate
	void CPlugin::RemoveNavigateParams()
	{
		NPVariant vResult;
		VOID_TO_NPVARIANT(vResult);

		try
		{
			NPObject* pContainer = GetContainer();

			if (!NPN_Invoke(m_pNPInstance, pContainer, GetIdentifier("removeNavigateParams"), NULL, 0, &vResult))
			{
				throw(CString(_T("Cannot execute window.Container.removeNavigateParams()")));
			}
		}
		catch (const CString& strMessage)
		{
			UNUSED(strMessage);
			TRACE(_T("[CPlugin::RemoveNavigateParams Exception] %s\n"), strMessage);
		}

		if (!NPVARIANT_IS_VOID(vResult))	NPN_ReleaseVariantValue(&vResult);
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

		if (!m_bIsUtilsPlugin)
		{
			// Fast event dispatching, requires helper function in container object
			try
			{
				// FireIEContainer.dispatchEvent(strEventType, strDetail)
				NPObject* pContainer = GetContainer();
				NPVariant args[2];
				STRINGZ_TO_NPVARIANT(CStringToNPStringCharacters(strEventType), args[0]);
				STRINGZ_TO_NPVARIANT(CStringToNPStringCharacters(strDetail), args[1]);
				NPVariant vSucceeded;
				VOID_TO_NPVARIANT(vSucceeded);

				bOK = NPN_Invoke(m_pNPInstance, pContainer, GetIdentifier("dispatchEvent"), args, 2, &vSucceeded);
				
				for (int i = 0; i < 2; i++)
					NPN_ReleaseVariantValue(&args[i]);

				if (!bOK || !NPVARIANT_IS_BOOLEAN(vSucceeded))
				{
					NPN_ReleaseVariantValue(&vSucceeded);
					throw CString(_T("Cannot invoke dispatchEvent"));
				}
				bool bSucceeded = NPVARIANT_TO_BOOLEAN(vSucceeded);
				NPN_ReleaseVariantValue(&vSucceeded);
				if (!bSucceeded)
					throw CString(_T("Event dispatch failed"));

				return TRUE;
			}
			catch (const CString& strMessage)
			{
				UNUSED(strMessage);
				TRACE(_T("[CPlugin::FireEvent Exception] Fast event dispatching failed: %s\n"), strMessage);
				return FALSE;
			}
		}

		bOK = FALSE;
		NPVariant vEvent;
		VOID_TO_NPVARIANT(vEvent);
		NPObject *pEvent = NULL;

		try
		{
			// var event = document.createEvent("CustomEvent");
			NPObject* pDocument = GetDocument();
			NPVariant arg;
			STRINGZ_TO_NPVARIANT(CStringToNPStringCharacters(_T("CustomEvent")), arg);
			bOK = NPN_Invoke(m_pNPInstance, pDocument, GetIdentifier("createEvent"), &arg, 1, &vEvent);
			NPN_ReleaseVariantValue(&arg);
			if (!NPVARIANT_IS_OBJECT(vEvent) || !bOK)
			{
				throw CString(_T("Cannot invoke document.createEvent"));
			}
			
			pEvent = NPVARIANT_TO_OBJECT(vEvent);
			if (!pEvent)
				throw CString(_T("event is null"));

			// event.initCustomEvent(strEventType, true, true, strDetail);
			NPVariant args[4];
			STRINGZ_TO_NPVARIANT(CStringToNPStringCharacters(strEventType), args[0]);
			BOOLEAN_TO_NPVARIANT(true, args[1]);
			BOOLEAN_TO_NPVARIANT(true, args[2]);
			STRINGZ_TO_NPVARIANT(CStringToNPStringCharacters(strDetail), args[3]);
			NPVariant vResult;
			VOID_TO_NPVARIANT(vResult);

			bOK = NPN_Invoke(m_pNPInstance, pEvent, GetIdentifier("initCustomEvent"), args, 4, &vResult);

			for (int i = 0; i < 4; i++)
				NPN_ReleaseVariantValue(&args[i]);
			NPN_ReleaseVariantValue(&vResult);

			if (!bOK)
				throw CString(_T("Cannot invoke event.initCustomEvent"));

			// get plugin object
			NPObject* pPlugin = GetPlugin();

			// pluginObject.dispatchEvent(event);
			NPVariant vNotCanceled;
			VOID_TO_NPVARIANT(vNotCanceled);
			bOK = NPN_Invoke(m_pNPInstance, pPlugin, GetIdentifier("dispatchEvent"), &vEvent, 1, &vNotCanceled);
			
			if (!bOK || !NPVARIANT_IS_BOOLEAN(vNotCanceled)) 
			{
				NPN_ReleaseVariantValue(&vNotCanceled);
				throw CString(_T("Cannot invoke dispatchEvent"));
			}
			bool bNotCanceled = NPVARIANT_TO_BOOLEAN(vNotCanceled);
			NPN_ReleaseVariantValue(&vNotCanceled);
			if (!bNotCanceled)
				throw CString(_T("Event is canceled"));
		}
		catch (const CString& strMessage)
		{
			UNUSED(strMessage);
			TRACE(_T("[CPlugin::FireEvent Exception] %s\n"), strMessage);
			bOK = FALSE;
		}
		if (!NPVARIANT_IS_VOID(vEvent))	NPN_ReleaseVariantValue(&vEvent);
		return bOK;
	}

	double CPlugin::GetZoomLevel()
	{
		double level = 1;

		NPVariant vLevel;
		VOID_TO_NPVARIANT(vLevel);

		try
		{
			NPObject* pContainer = GetContainer();

			if (!NPN_Invoke(m_pNPInstance, pContainer, GetIdentifier("getZoomLevel"), NULL, 0, &vLevel))
			{
				throw CString(_T("Cannot invoke window.Container.getZoomLevel()"));
			}
			if (NPVARIANT_IS_DOUBLE(vLevel)) 
				level = NPVARIANT_TO_DOUBLE(vLevel);
			else if ( NPVARIANT_IS_INT32(vLevel) ) 
				level = NPVARIANT_TO_INT32(vLevel);
		}
		catch (const CString& strMessage)
		{
			level = 1;
			UNUSED(strMessage);
			TRACE(_T("[CPlugin::GetZoomLevel Exception] %s\n"), strMessage);
		}

		if (!NPVARIANT_IS_VOID(vLevel))	NPN_ReleaseVariantValue(&vLevel);

		return level;
	}

	void CPlugin::SetFirefoxCookie(const CString& strURL, const CString& strCookieHeader, ULONG_PTR ulWindowId)
	{
		USES_CONVERSION_EX;
		CString strEventType = _T("IESetCookie");
		CString strDetail;
		Json::Value json;
		json["url"] = T2A_EX(strURL, strURL.GetLength() + 1);
		json["header"] = T2A_EX(strCookieHeader, strCookieHeader.GetLength() + 1);
		if (ulWindowId)
		{
			char szWindowId[32] = { 0 };
			_ui64toa_s(ulWindowId, szWindowId, 32, 10);
			json["windowId"] = szWindowId;
		}
		strDetail = CA2T(json.toStyledString().c_str());
		FireEvent(strEventType, strDetail);
	}

	void CPlugin::SetFirefoxCookie(const vector<SetFirefoxCookieParams>& vCookies, ULONG_PTR ulWindowId)
	{
		USES_CONVERSION_EX;
		CString strEventType = _T("IEBatchSetCookie");
		CString strDetail;
		Json::Value json;
		Json::Value aCookies;
		for (size_t i = 0; i < vCookies.size(); i++)
		{
			const SetFirefoxCookieParams& param = vCookies[i];
			Json::Value cookie;
			cookie["url"] = T2A_EX(param.strURL, param.strURL.GetLength() + 1);
			cookie["header"] = T2A_EX(param.strCookie, param.strCookie.GetLength() + 1);
			aCookies.append(cookie);
		}
		json["cookies"] = aCookies;

		if (ulWindowId)
		{
			char szWindowId[32] = { 0 };
			_ui64toa_s(ulWindowId, szWindowId, 32, 10);
			json["windowId"] = szWindowId;
		}

		strDetail = CA2T(json.toStyledString().c_str());
		FireEvent(strEventType, strDetail);
	}

	void CPlugin::IENewTab(ULONG_PTR ulId, const CString& strURL, bool bShift, bool bCtrl)
	{
		CString strEventType = _T("IENewTab");
		CString strDetail;

		TCHAR szId[32] = { 0 };
		_ui64tot_s(ulId, szId, 32, 10);
		CString strId = szId;

		// Retrieve additional info for cursor & keyboard state
		CString strShift = bShift ? _T("true") : _T("false");
		CString strCtrl = bCtrl ? _T("true") : _T("false");
		strDetail.Format(_T("{\"id\": \"%s\", \"url\": \"%s\", \"shift\": %s, \"ctrl\": %s}"),
			strId, strURL, strShift, strCtrl);
		FireEvent(strEventType, strDetail);
	}

	void CPlugin::CloseIETab()
	{
		CString strEventType = _T("CloseIETab");
		CString strDetail = _T("");
		FireEvent(strEventType, strDetail);
	}

	// Notify the Firefox that the page title has changed.
	void CPlugin::OnIETitleChanged(const CString& strTitle)
	{
		CString strEventType = _T("IETitleChanged");
		CString strDetail = strTitle;
		FireEvent(strEventType, strDetail);
	}

	// Send the IE UserAgent to the Firefox.
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

	void CPlugin::OnSetSecureLockIcon(const CString& description)
	{
		CString strEventType = _T("IESetSecureLockIcon");
		FireEvent(strEventType, description);
	}

	void CPlugin::OnUtilsPluginInit()
	{
#ifdef DEBUG
		test::doTest();
#endif
		if (COMFix::ifNeedFix())
			COMFix::doFix();

		CString strEventType = _T("IEUtilsPluginInitialized");
		CString strDetail = _T("");
		FireEvent(strEventType, strDetail);
	}

	void CPlugin::OnContentPluginInit()
	{
		CString strEventType = _T("IEContentPluginInitialized");
		CString strDetail = _T("");
		FireEvent(strEventType, strDetail);
	}

	void CPlugin::OnABPFilterLoaded(int numFilters, unsigned int ticks)
	{
		CString strEventType = _T("IEABPFilterLoaded");
		CString strDetail;
		strDetail.Format(_T("{ \"number\": %d, \"ticks\": %d }"), numFilters, ticks);
		FireEvent(strEventType, strDetail);
	}

	void CPlugin::OnABPLoadFailure()
	{
		CString strEventType = _T("IEABPLoadFailure");
		CString strDetail = _T("");
		FireEvent(strEventType, strDetail);
	}

	void CPlugin::OnURLChanged(const CString& url)
	{
		CString strEventType = _T("IEURLChanged");
		CString strDetail = url;
		FireEvent(strEventType, strDetail);
	}
}
