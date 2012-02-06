#pragma once

namespace BrowserHook
{
	class WindowMessageHook
	{
	public:
		static WindowMessageHook s_instance;
		~WindowMessageHook(void);
		BOOL Install(void);
		BOOL Uninstall(void);

	private:
		WindowMessageHook(void);
		static LRESULT CALLBACK GetMsgProc(int code, WPARAM wParam, LPARAM lParam);
		static LRESULT CALLBACK CallWndRetProc(int nCode, WPARAM wParam, LPARAM lParam);
	private:
		// WH_GETMESSAGE, 用于转发IE控件与Firefox窗口间的键盘消息
		static HHOOK s_hhookGetMessage;
		// WH_CALLWNDPROCRET, 用于拦截 WM_KILLFOCUS 消息
		static HHOOK s_hhookCallWndProcRet;
	};
}

