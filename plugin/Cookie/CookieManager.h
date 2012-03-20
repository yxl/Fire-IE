#pragma once

namespace Cookie
{
	class CookieManager
	{
	public:
	    // Single instance of the CookieManager for use in the plugin.
		static CookieManager s_instance;

		// Restore the cookie and cache directories of the IE
		BOOL RestoreIETempDirectorySetting();	
	private:
		CookieManager(void){}
		~CookieManager(void){}	

		CString SetIECtrlRegString(const CString& strRegName);

		BOOL SetIECtrlRegString(const CString& strRegName, const CString& strValue);
	};
}
