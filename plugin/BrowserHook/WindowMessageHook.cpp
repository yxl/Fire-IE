/* ***** BEGIN LICENSE BLOCK *****
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 * ***** END LICENSE BLOCK ***** */
#include "StdAfx.h"
#include "WindowMessageHook.h"
#include "PluginApp.h"
#include "IEHostWindow.h"

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

			// 只处理键盘消息
			if (pMsg->message < WM_KEYFIRST || pMsg->message > WM_KEYLAST || hwnd == NULL)
			{
				goto Exit;
			}

			// 只处理IE窗口消息，通过检查窗口类名过滤非IE窗口
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

			// 获取CIEHostWindow对象
			CIEHostWindow* pIEHostWindow = CIEHostWindow::FromInternetExplorerServer(hwnd);
			if (pIEHostWindow == NULL) 
			{
				goto Exit;
			}

			if (pMsg->message == WM_KEYDOWN || pMsg->message == WM_SYSKEYDOWN || pMsg->message == WM_SYSKEYUP)
			{
				BOOL bAltPressed = HIBYTE(GetKeyState(VK_MENU)) != 0;
				BOOL bCtrlPressed = HIBYTE(GetKeyState(VK_CONTROL)) != 0;
				BOOL bShiftPressed = HIBYTE(GetKeyState(VK_SHIFT))  != 0;

				// 当Alt键释放时，也向Firefox窗口转发按钮消息。否则无法通过Alt键选中主菜单。
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

			if (pIEHostWindow->m_ie.TranslateAccelerator(pMsg) == S_OK)
			{
				pMsg->message = WM_NULL;
			}
		}
Exit:
		return CallNextHookEx(s_hhookGetMessage, nCode, wParam, lParam); 
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
				return FALSE;
				// 以下快捷键由 IE 内部处理, 如果传给 Firefox 的话会导致重复
			case 'P': // Ctrl+P, Print
			case 'F': // Ctrl+F, Find
			case 'C': // Ctrl+C, Copy
			case 'V': // Ctrl+V, Paste
			case 'X': // Ctrl+X, Cut
			case 'A': // Ctrl+A, Select ALl
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

		return FALSE;
	}

	LRESULT CALLBACK WindowMessageHook::CallWndRetProc(int nCode, WPARAM wParam, LPARAM lParam)
	{
		if (nCode == HC_ACTION)
		{
			CWPRETSTRUCT * info = (CWPRETSTRUCT*) lParam;
			// info->wParam == NULL 表示焦点移到其它进程去了，我们只有在这个时候才要保护IE的焦点
			if (WM_KILLFOCUS == info->message && NULL == info->wParam)
			{
				HWND hwnd = info->hwnd;
				CString strClassName;
				GetClassName(hwnd, strClassName.GetBuffer(MAX_PATH), MAX_PATH);
				strClassName.ReleaseBuffer(); 
				if (strClassName ==  _T("Internet Explorer_Server"))
				{
					// 重新把焦点移到 plugin 窗口上，这样从别的进程窗口切换回来的时候IE才能有焦点
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
