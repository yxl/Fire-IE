#pragma once
#include <cstring>

namespace Cookie
{
	class CookieManager
	{
	public:
		static CookieManager s_instance;
		static CString ReadIECtrlReg(CString csRegName);
		static void SetIECtrlReg(CString csRegName,CString& csCookie);
		//static void RestoreIECookieReg(CString& csIECookie);
	private:
		CookieManager(void){}
		~CookieManager(void){}

	};
}
