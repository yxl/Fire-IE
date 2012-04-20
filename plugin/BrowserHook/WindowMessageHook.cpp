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
		if (nCode >= 0 && wParam == PM_REMOVE && lParam)
		{
			MSG * pMsg = reinterpret_cast<MSG *>(lParam);
			HWND hwnd = pMsg->hwnd;

			// here we only handle keyboard messages and right button messages
			if (!(WM_KEYFIRST <= pMsg->message && pMsg->message <= WM_KEYLAST)  && !(WM_MOUSEFIRST <= pMsg->message && pMsg->message <= WM_MOUSELAST) || hwnd == NULL)
			{
				goto Exit;
			}

			// Check if it is an IE control window by its window class name
			CString strClassName;
			GetClassName(hwnd, strClassName.GetBuffer(MAX_PATH), MAX_PATH);
			strClassName.ReleaseBuffer(); 
			if (WM_KEYDOWN == pMsg->message && VK_TAB == pMsg->wParam && strClassName == _T("Internet Explorer_TridentCmboBx"))
			{
				hwnd = ::GetParent(hwnd);
				GetClassName(hwnd, strClassName.GetBuffer(MAX_PATH), MAX_PATH);
				strClassName.ReleaseBuffer(); 
			}
			if (strClassName != _T("Internet Explorer_Server"))
			{
				goto Exit;
			}

			// Get CIEHostWindow object from its window handle
			CIEHostWindow* pIEHostWindow = CIEHostWindow::FromInternetExplorerServer(hwnd);
			if (pIEHostWindow == NULL) 
			{
				goto Exit;
			}

			// Forward the key press messages to firefox
			if (pMsg->message == WM_KEYDOWN || pMsg->message == WM_SYSKEYDOWN || pMsg->message == WM_SYSKEYUP)
			{
				BOOL bAltPressed = HIBYTE(GetKeyState(VK_MENU)) != 0;
				BOOL bCtrlPressed = HIBYTE(GetKeyState(VK_CONTROL)) != 0;
				BOOL bShiftPressed = HIBYTE(GetKeyState(VK_SHIFT))  != 0;

				// Send Alt key up message to Firefox, so that use could select the main window menu by press alt key.
				if (pMsg->message == WM_SYSKEYUP && pMsg->wParam == VK_MENU) 
				{
					bAltPressed = TRUE;
				}

				TRACE(_T("WindowMessageHook::GetMsgProc MSG: %x wParam: %x, lPara: %x\n"), pMsg->message, pMsg->wParam, pMsg->lParam);
				if (bCtrlPressed || bAltPressed || (pMsg->wParam >= VK_F1 && pMsg->wParam <= VK_F24))
				{
					int nKeyCode = static_cast<int>(pMsg->wParam);
					if (FilterFirefoxKey(nKeyCode, bAltPressed, bCtrlPressed, bShiftPressed))
					{
						HWND hwndMessageTarget = GetTopMozillaWindowClassWindow(pIEHostWindow->GetSafeHwnd());
						if (hwndMessageTarget)
						{
							::SetFocus(hwndMessageTarget);
							::PostMessage(hwndMessageTarget, pMsg->message, pMsg->wParam, pMsg->lParam);
							pMsg->message = WM_NULL;
							goto Exit;
						}
					}
				}
			}

			bool bShouldSwallow = false;

			// Check if we should enable mouse gestures
			if (WM_MOUSEFIRST <= pMsg->message && pMsg->message <= WM_MOUSELAST)
			{
				bool bShouldForward = false;
				GestureHandler* triggeredHandler = NULL;
				const std::vector<GestureHandler*>& handlers = GestureHandler::getHandlers();
				for (std::vector<GestureHandler*>::const_iterator iter = handlers.begin();
					iter != handlers.end(); ++iter)
				{
					if ((*iter)->getState() == GS_Triggered)
					{
						bShouldSwallow = true;
						bShouldForward = true;
						triggeredHandler = *iter;
						break;
					}
				}

				if (!triggeredHandler)
				{
					for (std::vector<GestureHandler*>::const_iterator iter = handlers.begin();
						iter != handlers.end(); ++iter)
					{
						MessageHandleResult res = (*iter)->handleMessage(pMsg);
						bShouldSwallow = bShouldSwallow || (*iter)->shouldSwallow(res);
						if (res == MHR_Triggered)
						{
							triggeredHandler = *iter;
							HWND hwndMessageTarget = GetTopMozillaWindowClassWindow(pIEHostWindow->GetSafeHwnd());
							if (hwndMessageTarget)
								triggeredHandler->forwardAllTarget(pMsg->hwnd, hwndMessageTarget);
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
				}
				else
				{
					MessageHandleResult res = triggeredHandler->handleMessage(pMsg);
					if (res == MHR_GestureEnd)
					{
						for (std::vector<GestureHandler*>::const_iterator iter = handlers.begin();
							iter != handlers.end(); ++iter)
						{
							(*iter)->reset();
						}
					}
				}

				if (bShouldForward)
				{
					// Forward the mousemove message to let firefox track the guesture.
					HWND hwndMessageTarget = GetTopMozillaWindowClassWindow(pIEHostWindow->GetSafeHwnd());
					if (hwndMessageTarget)
						GestureHandler::forwardTarget(pMsg, hwndMessageTarget);
				}
			}

			if (pIEHostWindow->m_ie.TranslateAccelerator(pMsg) == S_OK)
			{
				pMsg->message = WM_NULL;
			}

			if (bShouldSwallow)
				pMsg->message = WM_NULL;
		}
Exit:
		if (((MSG*)lParam)->message == WM_NULL)
		{
			TRACE (_T("SWALLOWED.\n"));
		}
		return CallNextHookEx(s_hhookGetMessage, nCode, wParam, lParam); 
	}

	BOOL WindowMessageHook::FilterFirefoxKey(int keyCode, BOOL bAltPressed, BOOL bCtrlPressed, BOOL bShiftPressed)
	{
		if (bCtrlPressed && bAltPressed)
		{
			// BUG FIX: Characters like @, #, € (and others that require AltGr on European keyboard layouts) cannot be entered in the plugin
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
				return FALSE;
				// The above shortcut keys will be handle by IE control only and won't be sent to Firefox
			case 'P': // Ctrl+P, Print
			//case 'F': // Ctrl+F, Find
			case 'C': // Ctrl+C, Copy
			case 'V': // Ctrl+V, Paste
			case 'X': // Ctrl+X, Cut
			case 'A': // Ctrl+A, Select ALl
			case 'Z': // Ctrl+Z, undo
			case 'Y': // Ctrl+Y, redo 
			case VK_HOME: // Ctrl+HOME, Scroll to Top
			case VK_END:  // Ctrl+END, Scroll to end
				return FALSE;
			default:
				return TRUE;
			}
		}
		else if (bAltPressed)
		{
			return TRUE;
		}
		else // shift-F3 works in FF...
		{
			switch (keyCode)
			{
			case VK_F3:
				return TRUE;
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
}
