#include "StdAfx.h"
#include "CookieManager.h"

namespace Cookie
{
	CookieManager CookieManager::s_instance;

	// Restore the cookie and cache directories of the IE
	BOOL CookieManager::RestoreIETempDirectorySetting()
	{
		BOOL bSucceeded = FALSE;
		CString strCookie = Cookie::CookieManager::SetIECtrlRegString(_T("Cookies_fireie"));
		if (strCookie.IsEmpty() || 
			!Cookie::CookieManager::SetIECtrlRegString(_T("Cookies"),strCookie))
		{
			bSucceeded = FALSE;
		}
		CString strCache = Cookie::CookieManager::SetIECtrlRegString(_T("Cache_fireie"));
		if(strCache.IsEmpty() ||
			!Cookie::CookieManager::SetIECtrlRegString(_T("Cache"),strCache))
		{
			bSucceeded = FALSE;
		}
		return bSucceeded;
	}

	static LPCTSTR SUB_KEY =  _T("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders");

	CString CookieManager::SetIECtrlRegString(const CString& strRegName)
	{
		CString strValue;
		CString strDefaultValue = _T("");
		DWORD dwFlag = RRF_RT_ANY | RRF_NOEXPAND;		
		DWORD dwSzie= 0;
		LONG lResult = ERROR_SUCCESS;

		// Get the data size
		lResult = RegGetValue(HKEY_CURRENT_USER, SUB_KEY, strRegName,
			dwFlag, NULL, NULL, &dwSzie);
		if (lResult != ERROR_SUCCESS || dwSzie == 0)
		{
			return strDefaultValue;
		}

		lResult = RegGetValue(HKEY_CURRENT_USER, SUB_KEY, strRegName,
			dwFlag, NULL, strValue.GetBuffer(dwSzie / sizeof(TCHAR)), &dwSzie);
		strValue.ReleaseBuffer();
		if (lResult != ERROR_SUCCESS)
		{
			return strDefaultValue;
		}

		return strValue;
	}

	BOOL CookieManager::SetIECtrlRegString(const CString& strRegName, const CString& strValue)
	{
		BOOL bSucceeded = FALSE;
		HKEY key;
		if(ERROR_SUCCESS == RegOpenKeyEx(HKEY_CURRENT_USER, SUB_KEY, 0, KEY_SET_VALUE, &key))
		{
			LPBYTE cstr = (LPBYTE)strValue.GetString();
			DWORD length = (strValue.GetLength() + 1) * sizeof(TCHAR);
			if (ERROR_SUCCESS == RegSetValueEx(key, strRegName, 0, REG_EXPAND_SZ, cstr, length))
			{
				bSucceeded = TRUE;
			}
			RegCloseKey(key);
		}
		return bSucceeded;
	}
}
