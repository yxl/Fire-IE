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
	* The message loop of Mozilla does not handle accelertor keys and mouse event.
	* A hook is installed to do the hack.
	* Bug related to this hack: 
	*  https://bugzilla.mozilla.org/show_bug.cgi?id=78414
	* (PluginShortcuts) Application shortcut keys (keyboard commands such as f11, ctrl+t, ctrl+r) fail to operate when plug-in (flash, acrobat, quicktime) has focus
	*
	*/
	class WindowMessageHook
	{
	public:
		static WindowMessageHook s_instance;
		BOOL Install(void);
		BOOL Uninstall(void);
		static BOOL IsMiddleButtonClicked();
	private:
		WindowMessageHook(void);
		~WindowMessageHook(void);
		static LRESULT CALLBACK GetMsgProc(int code, WPARAM wParam, LPARAM lParam);
		static LRESULT CALLBACK CallWndRetProc(int nCode, WPARAM wParam, LPARAM lParam);
		static BOOL FilterFirefoxKey(int keyCode, BOOL bAltPressed, BOOL bCtrlPressed, BOOL bShiftPressed);
		static BOOL ForwardFirefoxKeyMessage(HWND hwndFirefox, MSG* pMsg);
		static BOOL ForwardFirefoxMouseMessage(HWND hwndFirefox, MSG* pMsg);
		static BOOL ForwardZoomMessage(HWND hwndFirefox, MSG* pMsg);
		static void RecordMiddleClick(MSG* pMsg);
	private:
		// WH_GETMESSAGE hook.
		static HHOOK s_hhookGetMessage;
		// WH_CALLWNDPROCRET
		static HHOOK s_hhookCallWndProcRet;
		// Record the last time middle button was clicked
		static UINT64 s_nLastMiddleClickTick;
	};
}

