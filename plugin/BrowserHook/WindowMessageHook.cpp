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
#include "StdAfx.h"
#include "WindowMessageHook.h"
#include "PluginApp.h"
#include "IEHostWindow.h"
#include "GestureHandler.h"

namespace BrowserHook
{
	// Initialize static variables
	HHOOK WindowMessageHook::s_hhookGetMessage = NULL;
	HHOOK WindowMessageHook::s_hhookCallWndProcRet = NULL;
	WindowMessageHook WindowMessageHook::s_instance;
	UINT WindowMessageHook::s_nLastMiddleClickTick = 0;

	WindowMessageHook::WindowMessageHook(void)
	{
	}


	WindowMessageHook::~WindowMessageHook(void)
	{
	}

	BOOL BrowserHook::WindowMessageHook::Install(void)
	{
		if (NULL == s_hhookGetMessage)
		{
			s_hhookGetMessage = SetWindowsHookEx( WH_GETMESSAGE, GetMsgProc, NULL, GetCurrentThreadId() );
		}

		if (NULL == s_hhookCallWndProcRet)
		{
			s_hhookCallWndProcRet = SetWindowsHookEx( WH_CALLWNDPROCRET, CallWndRetProc, NULL, GetCurrentThreadId() );
		}
		return TRUE;
	}

	BOOL BrowserHook::WindowMessageHook::Uninstall(void)
	{
		if (s_hhookGetMessage)
		{
			UnhookWindowsHookEx(s_hhookGetMessage);
			s_hhookGetMessage = NULL;
		}

		if (s_hhookCallWndProcRet)
		{
			UnhookWindowsHookEx(s_hhookCallWndProcRet);
			s_hhookCallWndProcRet= NULL;
		}
		return TRUE;
	}

	BOOL WindowMessageHook::IsMiddleButtonClicked() {
		return GetTickCount() - s_nLastMiddleClickTick < 200;
	}

	// The message loop of Mozilla does not handle accelertor keys.
	// IOleInplaceActivateObject requires MSG be filtered by its TranslateAccellerator() method.
	// So we install a hook to do the dirty hack.
	// Mozilla message loop is here:
	// http://mxr.mozilla.org/mozilla-central/source/widget/src/windows/nsAppShell.cpp
	// bool nsAppShell::ProcessNextNativeEvent(bool mayWait)
	// It does PeekMessage, TranslateMessage, and then pass the result directly
	// to DispatchMessage.
	// Just before PeekMessage returns, our hook procedure is called.
	LRESULT CALLBACK WindowMessageHook::GetMsgProc(int nCode, WPARAM wParam, LPARAM lParam) 
	{
		static bool s_bReentranceGuard = false;

		if (s_bReentranceGuard) // Prevent reentrance problems caused by SendMessage
		{
			TRACE(_T("WindowMessageHook::GetMsgProc WARNING: reentered.\n"));
			return CallNextHookEx(s_hhookGetMessage, nCode, wParam, lParam);
		}
		s_bReentranceGuard = true;

		if (nCode >= 0 && wParam == PM_REMOVE && lParam)
		{
			MSG * pMsg = reinterpret_cast<MSG *>(lParam);
			HWND hwnd = pMsg->hwnd;

			// here we only handle keyboard messages and mouse button messages
			if (!(WM_KEYFIRST <= pMsg->message && pMsg->message <= WM_KEYLAST)  && !(WM_MOUSEFIRST <= pMsg->message && pMsg->message <= WM_MOUSELAST) || hwnd == NULL)
			{
				goto Exit;
			}

			// Check if it is an IE control window by its window class name
			static const TCHAR* s_szWindowClassHierarchy[] = {
				_T("Shell Embedding"),
				_T("Shell DocObject View"),
				_T("Internet Explorer_Server"),
				_T("Internet Explorer_TridentCmboBx")
			};
			static const UINT s_nWindowClassHierarchy = ARRAYSIZE(s_szWindowClassHierarchy);

			// Get CIEHostWindow object from the window hierarchy
			CIEHostWindow* pIEHostWindow = CIEHostWindow::FromWindowHierarchy(hwnd, s_szWindowClassHierarchy, 
				(WM_KEYDOWN == pMsg->message && VK_TAB == pMsg->wParam) ? s_nWindowClassHierarchy : s_nWindowClassHierarchy - 1);
			if (pIEHostWindow == NULL) 
			{
				goto Exit;
			}

			HWND hwndFirefox = GetTopMozillaWindowClassWindow(pIEHostWindow->GetSafeHwnd());
			if (hwndFirefox == NULL)
			{
				goto Exit;
			}

			RecordMiddleClick(pMsg);

			bool bShouldSwallow = false;

			if (WM_KEYFIRST <= pMsg->message && pMsg->message <= WM_KEYLAST)
			{
				// Forward the key press messages to firefox
				if (pMsg->message == WM_KEYDOWN || pMsg->message == WM_SYSKEYDOWN || pMsg->message == WM_SYSKEYUP)
				{
					bShouldSwallow = bShouldSwallow || ForwardFirefoxKeyMessage(hwndFirefox, pMsg);
				}
				bShouldSwallow = bShouldSwallow || (pIEHostWindow->m_ie.TranslateAccelerator(pMsg) == S_OK);
			}

			// Check if we should enable mouse gestures
			if (WM_MOUSEFIRST <= pMsg->message && pMsg->message <= WM_MOUSELAST)
			{
				bShouldSwallow = bShouldSwallow || ForwardFirefoxMouseMessage(hwndFirefox, pMsg);
			}

			// Check if we should handle Ctrl+Wheel zooming
			bShouldSwallow = bShouldSwallow || ForwardZoomMessage(hwndFirefox, pMsg);

			if (bShouldSwallow)
			{
				TRACE (_T("WindowMessageHook::GetMsgProc SWALLOWED.\n"));
				pMsg->message = WM_NULL;
			}
		}
Exit:
		s_bReentranceGuard = false;
		return CallNextHookEx(s_hhookGetMessage, nCode, wParam, lParam); 
	}

	BOOL WindowMessageHook::ForwardFirefoxKeyMessage(HWND hwndFirefox, MSG* pMsg)
	{
		BOOL bAltPressed = HIBYTE(GetKeyState(VK_MENU)) != 0;
		BOOL bCtrlPressed = HIBYTE(GetKeyState(VK_CONTROL)) != 0;
		BOOL bShiftPressed = HIBYTE(GetKeyState(VK_SHIFT))  != 0;

		static MSG s_pendingAltDown = { 0 };

		TRACE(_T("WindowMessageHook::ForwardFirefoxKeyMessage MSG: %x wParam: %x, lPara: %x\n"), pMsg->message, pMsg->wParam, pMsg->lParam);
		if (bAltPressed && !bCtrlPressed && pMsg->wParam == VK_MENU)
		{
			// Alt without Ctrl is pressed. We'll delay sending the Alt down message, in case Ctrl is pressed
			// before Alt up.  AltGr is represented in Windows massages as the combination of Alt+Ctrl, and 
			// that is used for text input, not for menu naviagation.
			s_pendingAltDown = *pMsg;
			TRACE(_T("WindowMessageHook::ForwardFirefoxKeyMessage : Alt pending...\n"));
			return FALSE;
		} 
		else if (bCtrlPressed)
		{
			if (s_pendingAltDown.message != WM_NULL)
			{
				// Clear the pending Alt down message as Ctrl is pressed.
				s_pendingAltDown.message = WM_NULL;
				TRACE(_T("WindowMessageHook::ForwardFirefoxKeyMessage : Cleared pending Alt.\n"));
			}
		}

		// Send Alt key up message to Firefox, so that user could select the main window menu by press alt key.
		if (pMsg->message == WM_SYSKEYUP && pMsg->wParam == VK_MENU) 
		{
			if (s_pendingAltDown.message != WM_NULL)
			{
				// Send the pending Alt down message first.
				::SetFocus(hwndFirefox);
				::PostMessage(hwndFirefox, s_pendingAltDown.message, s_pendingAltDown.wParam, s_pendingAltDown.lParam);
				s_pendingAltDown.message = WM_NULL;
				bAltPressed = TRUE;
				TRACE(_T("WindowMessageHook::ForwardFirefoxKeyMessage : Sent pending Alt.\n"));
			}
		}
		// Might be in AltGr up sequence, skip
		else if (pMsg->message == WM_SYSKEYUP && pMsg->wParam == VK_CONTROL)
		{
			TRACE(_T("WindowMessageHook::ForwardFirefoxKeyMessage : Return from AltGr up sequence.\n"));
			return FALSE;
		}

		if (bCtrlPressed || bAltPressed || (pMsg->wParam >= VK_F1 && pMsg->wParam <= VK_F24))
		{
			int nKeyCode = static_cast<int>(pMsg->wParam);
			if (FilterFirefoxKey(nKeyCode, bAltPressed, bCtrlPressed, bShiftPressed))
			{
				::SetFocus(hwndFirefox);
				::PostMessage(hwndFirefox, pMsg->message, pMsg->wParam, pMsg->lParam);
				return TRUE;
			}
		}
		return FALSE;
	}

	BOOL WindowMessageHook::ForwardFirefoxMouseMessage(HWND hwndFirefox, MSG* pMsg)
	{
		// Forward plain move messages to let firefox handle full screen auto-hide or tabbar auto-arrange
		bool bShouldForward = pMsg->message == WM_MOUSEMOVE && pMsg->wParam == 0;

		const std::vector<GestureHandler*>& handlers = GestureHandler::getHandlers();

		// Forward the mouse message if any guesture handler is triggered.
		for (std::vector<GestureHandler*>::const_iterator iter = handlers.begin();
			iter != handlers.end(); ++iter)
		{
			if ((*iter)->getState() == GS_Triggered)
			{
				GestureHandler* triggeredHandler = *iter;
				MessageHandleResult res = triggeredHandler->handleMessage(pMsg);
				if (res == MHR_GestureEnd)
				{
					for (std::vector<GestureHandler*>::const_iterator iter = handlers.begin();
						iter != handlers.end(); ++iter)
					{
						(*iter)->reset();
					}
				}
				// Forward the mousemove message to let firefox track the guesture.
				GestureHandler::forwardTarget(pMsg, hwndFirefox);
				return TRUE;
			}
		}

		// Check if we could trigger a mouse guesture.
		bool bShouldSwallow = false;
		for (std::vector<GestureHandler*>::const_iterator iter = handlers.begin();
			iter != handlers.end(); ++iter)
		{
			MessageHandleResult res = (*iter)->handleMessage(pMsg);
			bShouldSwallow = bShouldSwallow || (*iter)->shouldSwallow(res);
			if (res == MHR_Triggered)
			{
				(*iter)->forwardAllTarget(pMsg->hwnd, hwndFirefox);
				bShouldForward = false;
				break;
			}
			else if (res == MHR_Canceled)
			{
				bool bShouldForwardBack = true;
				for (std::vector<GestureHandler*>::const_iterator iter2 = handlers.begin();
					iter2 != handlers.end(); ++iter2)
				{
					if ((*iter2)->getState() != GS_None)
					{
						bShouldForwardBack = false;
						break;
					}
				}
				if (bShouldForwardBack)
				{
					(*iter)->forwardAllOrigin(pMsg->hwnd);
					for (std::vector<GestureHandler*>::const_iterator iter2 = handlers.begin();
						iter2 != handlers.end(); ++iter2)
					{
						(*iter2)->reset();
					}
				}
			}
		}
		if (bShouldForward)
		{
			GestureHandler::forwardTarget(pMsg, hwndFirefox);
		}
		return bShouldSwallow;
	}

	BOOL WindowMessageHook::ForwardZoomMessage(HWND hwndFirefox, MSG* pMsg)
	{
		bool bCtrlPressed = HIBYTE(GetKeyState(VK_CONTROL)) != 0;
		bool bShouldForward = bCtrlPressed && pMsg->message == WM_MOUSEWHEEL;
		if (bShouldForward)
		{
			TRACE(_T("Ctrl+Wheel forwarded.\n"));
			GestureHandler::forwardTarget(pMsg, hwndFirefox);
		}
		return bShouldForward;
	}

	BOOL WindowMessageHook::FilterFirefoxKey(int keyCode, BOOL bAltPressed, BOOL bCtrlPressed, BOOL bShiftPressed)
	{
		if (bCtrlPressed && bAltPressed)
		{
			// BUG FIX: Characters like @, #, � (and others that require AltGr on European keyboard layouts) cannot be entered in the plugin
			// Suggested by Meyer Kuno (Helbling Technik): AltGr is represented in Windows massages as the combination of Alt+Ctrl, and that is used for text input, not for menu naviagation.
			// 
			switch (keyCode)
			{
			case 'R': // Ctrl+Alt+R, Restart firefox
				return TRUE;
			default:
				return FALSE;
			}
		}
		else if (bCtrlPressed)
		{
			switch (keyCode)
			{
			case VK_CONTROL: // Only Ctrl is pressed
			case VK_MENU: // Might be in AltGr up sequence
				return FALSE;
			case VK_SHIFT: // Issue #90: Ctrl-Shift switching IME, should not lose focus
			case VK_SPACE:
			case VK_PROCESSKEY:
				TRACE(_T("[WindowMessageHook] VK_SHIFT, VK_SPACE or VK_PROCESSKEY\n"));
				return FALSE;

			// The following shortcut keys will be handle by IE control only and won't be sent to Firefox
			case 'P': // Ctrl+P, Print
			case 'C': // Ctrl+C, Copy
			case 'V': // Ctrl+V, Paste
			case 'X': // Ctrl+X, Cut
			case 'A': // Ctrl+A, Select ALl
			case 'Z': // Ctrl+Z, undo
			case 'Y': // Ctrl+Y, redo 
			case VK_HOME: // Ctrl+HOME, Scroll to Top
			case VK_END:  // Ctrl+END, Scroll to end
			case VK_LEFT: // Ctrl+L/R, Jump to prev/next word
			case VK_RIGHT:
			case VK_UP: // Ctrl+U/D, identical to Up/Down
			case VK_DOWN:
			case VK_RETURN: // Ctrl-Return, fast post on Baidu Tieba & potentially other places
				return FALSE;
			default:
				TRACE(_T("[WindowMessageHook] Forwarded firefox key with keyCode = %d\n"), keyCode);
				return TRUE;
			}
		}
		else if (bAltPressed)
		{
			return TRUE;
		}
		else
		{
			switch (keyCode)
			{
			case VK_F2: // Developer toolbar, although not very useful
				return bShiftPressed;
			case VK_F3: // find next, with shift: find prev
				return TRUE;
			case VK_F4: // Shift-F4 opens Scratchpad which is very handy
				return bShiftPressed;
			case VK_F6: // Locate the address bar
				return !bShiftPressed;
			case VK_F7: // Style Editor, although not very useful
				return bShiftPressed;
			case VK_F10: // Locate the menu bar
				return !bShiftPressed;
			case VK_F11: // full screen
				return !bShiftPressed;
			case VK_F12: // Firebug, although not really useful
				return !bShiftPressed;
			default:
				return FALSE;
			}
		}

		return FALSE;
	}

	LRESULT CALLBACK WindowMessageHook::CallWndRetProc(int nCode, WPARAM wParam, LPARAM lParam)
	{
		if (nCode == HC_ACTION)
		{
			CWPRETSTRUCT * info = (CWPRETSTRUCT*) lParam;
			// If the IE control loses its focus, get it back.
			if (WM_KILLFOCUS == info->message && NULL == info->wParam)
			{
				HWND hwnd = info->hwnd;
				CString strClassName;
				GetClassName(hwnd, strClassName.GetBuffer(MAX_PATH), MAX_PATH);
				strClassName.ReleaseBuffer(); 
				if (strClassName ==  _T("Internet Explorer_Server"))
				{
					CIEHostWindow* pIEHostWindow = CIEHostWindow::FromInternetExplorerServer(hwnd);
					if (pIEHostWindow)
					{
						pIEHostWindow->SetFocus();
					}
				}
			}
		}

		return CallNextHookEx(s_hhookCallWndProcRet, nCode, wParam, lParam);
	}

	void WindowMessageHook::RecordMiddleClick(MSG* pMsg) {
		if (pMsg->message == WM_MBUTTONUP) {
			s_nLastMiddleClickTick = GetTickCount();
		}
	}
}
