/* ***** BEGIN LICENSE BLOCK *****
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 * ***** END LICENSE BLOCK ***** */
#pragma once

namespace BrowserHook
{
	/**
	 * 这个类用于处理Firefox的Bug 78414(https://bugzilla.mozilla.org/show_bug.cgi?id=78414)
	 * Bug的内容是: (PluginShortcuts) Application shortcut keys (keyboard commands such as f11, ctrl+t, ctrl+r) fail to operate when plug-in (flash, acrobat, quicktime) has focus
	 * 这个会导致IE控件与Firefox主窗口间无法正确传递按键消息
	 */
	class WindowMessageHook
	{
	public:
		static WindowMessageHook s_instance;
		BOOL Install(void);
		BOOL Uninstall(void);

	private:
		WindowMessageHook(void);
    ~WindowMessageHook(void);
		static LRESULT CALLBACK GetMsgProc(int code, WPARAM wParam, LPARAM lParam);
		static LRESULT CALLBACK CallWndRetProc(int nCode, WPARAM wParam, LPARAM lParam);
    static BOOL FilterFirefoxKey(int keyCode, BOOL bAltPressed, BOOL bCtrlPressed, BOOL bShiftPressed);
	private:
		// WH_GETMESSAGE, 用于转发IE控件与Firefox窗口间的键盘消息
		static HHOOK s_hhookGetMessage;
		// WH_CALLWNDPROCRET, 用于拦截 WM_KILLFOCUS 消息
		static HHOOK s_hhookCallWndProcRet;
	};
}

