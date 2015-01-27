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

#pragma once

#include "npapi.h"
#include "npruntime.h"
#include "PluginApp.h"
#include "pluginbase.h"
#include "UserMessage.h"

class CIEHostWindow;

namespace Plugin
{
	class CPlugin: public nsPluginBase
	{
	public: 
		// Overrides

		CPlugin(const nsPluginCreateData& data);
		virtual ~CPlugin();
		// Initialize plugin window
		NPBool init(NPWindow* pNPWindow);
		// Update plugin window when its size or position changes.
		NPError SetWindow(NPWindow* pNPWindow);
		// Destruction of the plugin
		void shut();

		NPBool isInitialized();

		CIEHostWindow* GetIEHostWindow() {return m_pIEHostWindow;}
	private: 
		CIEHostWindow* CreateIEHostWindow(HWND hParent, ULONG_PTR ulId, bool isUtils, bool* opIsNewlyCreated);
		
		// Get the URL of the page where the plugin is hosted
		CString GetHostURL() const;

		CString GetNavigateParam(const NPUTF8* name) const;

		// Get CIEHostWindow ID
		ULONG_PTR GetNavigateWindowId() const;

		// Get URL to visit
		CString GetNavigateURL() const;

		// Get Http headers paramter for IECtrl::Navigate
		CString GetNavigateHeaders() const;

		// Get post data paramter for IECtrl::Navigate
		CString GetNavigatePostData() const;

		// Clear all the paramters for IECtrl::Navigate
		void RemoveNavigateParams();

		// Fire initialization event
		void FireInitEvent();
	public:

		// Set the plugin status text, which will be shown in the Firefox status bar
		void SetStatus(const CString& text);

		NPObject *GetScriptableObject();

		/** This function is equivalent to the following JavaScript function:
		* function FireEvent(strEventType, strDetail) {
		*   var event = document.createEvent("CustomEvent");
		*   event.initCustomEvent(strEventType, true, true, strDetail);
		*   pluginObject.dispatchEvent(event);
		* }
		* 
		* Uses following JavaScript code to listen to the event fired:
		* pluginObject.addEventListener(strEventType, function(event) {
		*    alert(event.detail);
		* }
		*/
		BOOL FireEvent(const CString &strEventType, const CString &strDetail);

		/** Get the window zoom level of Firefox by calling the JavaScript method of
		 * window.FireIEContainer.getZoomLevel()
		 */
		double GetZoomLevel();

		/**
		 * Whether we should show status ourselves, i.e. not through NPN_Status
		 */
		bool ShouldShowStatusOurselves();
		/**
		 * Whether we should prevent flashing caused by setting status text
		 * This is mainly due to the rendering bug in IE8 or lower that makes pages flash
		 * when rapidly rendering the status text
		 */
		bool ShouldPreventStatusFlash();
		/**
		 * Sets Firefox Cookie by firing a JavaScript event.
		 */
		void SetFirefoxCookie(const CString& strURL, const CString& strCookie, ULONG_PTR ulWindowId);
		/**
		 * Batch-setting Firefox Cookie by firing a JavaScript event.
		 */
		void SetFirefoxCookie(const std::vector<UserMessage::SetFirefoxCookieParams>& vCookies, ULONG_PTR ulWindowId);

		/** 
		 * Create a new IE engine tab in the Firefox to load the given CIEHostWindow.
		 * @param ulId The ID of the CIEHostWindow object.
		 * @param strURL The page URL to be loaded in the new tab.
		 * @param bShift Whether the shift key is pressed when the request is made
		 * @param bCtrl Whether the ctrl key is pressed when the request is made
		 */
		void IENewTab(ULONG_PTR ulId, const CString& strURL, bool bShift, bool bCtrl);

		// Close current IE engie tab.
		void CloseIETab();

		// Notify the Firefox that the page title has changed.
		void OnIETitleChanged(const CString& strTitle);

		// Send the IE UserAgent to the Firefox.
		void OnIEUserAgentReceived(const CString& strUserAgent);

		// Send the page loaded message to the Firefox.
		void OnDocumentComplete();

		// Set the security info icon
		void OnSetSecureLockIcon(const CString& description);

		// Utility plugin intialized
		void OnUtilsPluginInit();

		// Content plugin intialized
		void OnContentPluginInit();

		// AdBlock Plus filters loaded
		void OnABPFilterLoaded(int numFilters, unsigned int ticks);

		// AdBlock Plus filters failed load
		void OnABPLoadFailure();

		// IE engine URL changed
		void OnURLChanged(const CString& url);
	protected:

		NPP m_pNPInstance;

		HWND m_hWnd;

		CIEHostWindow *m_pIEHostWindow;

		NPStream * m_pNPStream;
		NPBool m_bInitialized;

		NPObject *m_pScriptableObject;

		// Plugin ID
		CString m_strId;

		// Whether this is a utils plugin (or a content plugin)
		bool m_bIsUtilsPlugin;

	private:
		// Caches for commonly-used objects
		mutable NPObject* m_pWindow;
		mutable NPObject* m_pContainer;

		NPObject* GetWindowPropertyObject(const NPUTF8* szPropertyName) const;
		NPObject* GetEnvironmentObject(NPNVariable variable, const TCHAR* szDescription) const;

		NPObject* GetWindow() const;
		NPObject* GetContainer() const;

		typedef std::string utf8string;
		static std::unordered_map<utf8string, NPIdentifier> s_mapIdentifierCache;
		static NPIdentifier GetIdentifier(const NPUTF8* npcharsId);
	};

}
