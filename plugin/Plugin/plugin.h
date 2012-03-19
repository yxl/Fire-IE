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

class CIEHostWindow;

namespace Plugin
{
	class CPlugin: public nsPluginBase
	{
	public: 
		// Overrides

		CPlugin(const nsPluginCreateData& data);
		~CPlugin();
		// 初始化Plugin窗口
		NPBool init(NPWindow* pNPWindow);
		// 当Plugin窗口大小或者位置改变时, 通过 NPP_SetWindow 通知 update
		NPError SetWindow(NPWindow* pNPWindow);
		// 释放Plugin
		void shut();
		NPBool isInitialized();

	private: 
		CIEHostWindow* CreateIEHostWindow(HWND hParent, DWORD dwId);

	public:

		// 设置Plugin状态文本, 会在Firefox的状态栏中显示出来
		void SetStatus(const CString& text);

		// 获取Plugin所在页面的URL
		CString GetHostURL() const;

		CString GetNavigateParam(const NPUTF8* name) const;

		// 获取CIEHostWindow ID
		DWORD GetNavigateWindowId() const;

		// 清空IECtrl::Navigate的参数
		void RemoveNavigateParams();

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

		/** 获取Firefox窗口放大系数
		*  对应的JavaScript代码为IMode.getZoomLevel()，这里省略了window，
		*  完整的代码 window.IMode.getZoomLevel()
		*/
		double GetZoomLevel();

		/** 设置Firefox的Cookie
		* @param strCookie Cookie字符串值, 格式是 cookie1=value1;cookie2=value2;cookie3=value3
		*/
		void SetURLCookie(const CString& strURL, const CString& strCookie);

		CString GetFirefoxUserAgent();

		/** 打开一个新IE标签, 使用已创建的CIEHostWindow
		 * @param id CIEHostWindow ID
		 * @param strURL 新IE标签页面URL
		 */
		void IENewTab(DWORD id, const CString& strURL);

		/** 关闭当前的IE标签窗口*/
		void CloseIETab();

		/** 向Firefox发送IE窗口标题改变的消息 */
		void OnIETitleChanged(const CString& strTitle);

		/** 页面加载完成时产生的事件 */
		void OnDocumentComplete();
	protected:

		NPP m_pNPInstance;

		HWND m_hWnd;

		CIEHostWindow *m_pIEHostWindow;

		NPStream * m_pNPStream;
		NPBool m_bInitialized;

		NPObject *m_pScriptableObject;

		// Plugin ID
		CString m_strId;
	};

}