#pragma once
#include <cstring>

namespace Cookie
{
	class CookieManager
	{
	public:
		static CookieManager s_instance;
		static CString ReadIECtrlCookieReg();
		static void SetIECtrlCookieReg(CString& csCookie);
		//static void RestoreIECookieReg(CString& csIECookie);
	private:
		CookieManager(void){}
		~CookieManager(void){}

	};
}
