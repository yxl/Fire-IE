/*
This file is part of Fire-IE.

Fire-IE is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Fire-IE is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with Fire-IE.  If not, see <http://www.gnu.org/licenses/>.
*/
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

