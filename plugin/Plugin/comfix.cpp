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

// comfix.cpp : Work around browser hang issues related to QQ ActiveX controls
//

#include "StdAfx.h"

#include "comfix.h"

using namespace Plugin;

const TCHAR* COMFix::s_astrCLSID[] = {
	_T("{ED4CA2E5-0EEA-44C1-AD7E-74A07A7507A4}"), // TimwpDll.TimwpCheck
	_T("{23752AA7-CAD7-40C2-99EE-7A9CD3C20C6D}")  // QQCPHelper.CPAdder
};

const int COMFix::s_cntCLSID = sizeof(s_astrCLSID) / sizeof(s_astrCLSID[0]);

bool COMFix::ifNeedFix()
{
	for (int i = 0; i < s_cntCLSID; i++)
	{
		if (ifNeedFixForCLSID(s_astrCLSID[i]))
			return true;
	}
	return false;
}

bool COMFix::ifNeedFixForCLSID(const TCHAR* clsid)
{
	// For 32-bit OS, registry subkey is at HKEY_CLASSES_ROOT\CLSID\{...}\InProcServer32
	TCHAR strSubKey[100] = {0};
	_tcscat_s(strSubKey, _T("CLSID\\"));
	_tcscat_s(strSubKey, clsid);
	_tcscat_s(strSubKey, _T("\\InProcServer32"));
	if (queryValueForSubkey(strSubKey)) return true;

	// For 64-bit OS, registry subkey is at HKEY_CLASSES_ROOT\Wow6432Node\CLSID\{...}\InProcServer32
	strSubKey[0] = 0;
	_tcscat_s(strSubKey, _T("Wow6432Node\\CLSID\\"));
	_tcscat_s(strSubKey, clsid);
	_tcscat_s(strSubKey, _T("\\InProcServer32"));
	return queryValueForSubkey(strSubKey);
}

bool COMFix::queryValueForSubkey(const TCHAR* subkey)
{
	TCHAR* strValueName = _T("ThreadingModel");
	TCHAR* strExpectedValue = _T("Apartment");

	HKEY key;
	if (ERROR_SUCCESS == RegOpenKeyEx(HKEY_CLASSES_ROOT, subkey, 0, KEY_QUERY_VALUE, &key))
	{
		DWORD dwType;
		const int BUFFER_LEN = 20;
		TCHAR cstrValue[BUFFER_LEN] = {0};
		DWORD cbSize = sizeof(cstrValue);

		bool ret = ERROR_SUCCESS != RegQueryValueEx(key, strValueName, NULL, &dwType, (LPBYTE)cstrValue, &cbSize)
					|| dwType != REG_SZ || _tcscmp(cstrValue, strExpectedValue);
		RegCloseKey(key);
		return ret;
	}
	return false;
}

void COMFix::doFix()
{
	for (int i = 0; i < s_cntCLSID; i++)
	{
		doFixForCLSID(s_astrCLSID[i]);
	}
}

void COMFix::doFixForCLSID(const TCHAR* clsid)
{
	// For 32-bit OS, registry subkey is at HKEY_CLASSES_ROOT\CLSID\{...}\InProcServer32
	TCHAR strSubKey[100] = {0};
	_tcscat_s(strSubKey, _T("CLSID\\"));
	_tcscat_s(strSubKey, clsid);
	_tcscat_s(strSubKey, _T("\\InProcServer32"));
	setValueForSubkey(strSubKey);

	// For 64-bit OS, registry subkey is at HKEY_CLASSES_ROOT\Wow6432Node\CLSID\{...}\InProcServer32
	strSubKey[0] = 0;
	_tcscat_s(strSubKey, _T("Wow6432Node\\CLSID\\"));
	_tcscat_s(strSubKey, clsid);
	_tcscat_s(strSubKey, _T("\\InProcServer32"));
	setValueForSubkey(strSubKey);
}

void COMFix::setValueForSubkey(const TCHAR* subkey)
{
	TCHAR* strValueName = _T("ThreadingModel");
	TCHAR* strValue = _T("Apartment");
	DWORD cbValue = (DWORD)((_tcslen(strValue) + 1) * sizeof(TCHAR));
	HKEY key;
	if (ERROR_SUCCESS == RegOpenKeyEx(HKEY_CLASSES_ROOT, subkey, 0, KEY_SET_VALUE, &key))
	{
		RegSetValueEx(key, strValueName, 0, REG_SZ, (const LPBYTE)strValue, cbValue);
		RegCloseKey(key);
	}
}
