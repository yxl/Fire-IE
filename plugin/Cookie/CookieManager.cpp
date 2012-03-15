#include "StdAfx.h"
#include "CookieManager.h"

namespace Cookie
{
	CookieManager CookieManager::s_instance;
	CString CookieManager::ReadIECtrlReg(CString csRegName)
	{
		TCHAR value[4096];
		DWORD dwSzie= sizeof(value);
		long ret = RegGetValue(HKEY_CURRENT_USER, TEXT("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders"),csRegName,
		RRF_RT_ANY|RRF_NOEXPAND,NULL,value,&dwSzie);
		return value;
	}
	void CookieManager::SetIECtrlReg(CString csRegName,CString& csCookie)
	{
		HKEY key;
		if(ERROR_SUCCESS == RegOpenKeyEx(HKEY_CURRENT_USER, TEXT("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders"), 0, KEY_SET_VALUE, &key))
		{
			RegSetValueEx(key, csRegName, 0, REG_EXPAND_SZ, (LPBYTE)csCookie.GetBuffer(), 1024);
			csCookie.ReleaseBuffer();
			RegCloseKey(key);
		}
	}
}
