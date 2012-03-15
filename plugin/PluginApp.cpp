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

// PluginApp.cpp : Defines the initialization routines for the DLL.
//

#include "stdafx.h"
#include "PluginApp.h"
#include "CookieManager.h"

#ifdef _DEBUG
#define new DEBUG_NEW
#endif

//
//TODO: If this DLL is dynamically linked against the MFC DLLs,
//		any functions exported from this DLL which call into
//		MFC must have the AFX_MANAGE_STATE macro added at the
//		very beginning of the function.
//
//		For example:
//
//		extern "C" BOOL PASCAL EXPORT ExportedFunction()
//		{
//			AFX_MANAGE_STATE(AfxGetStaticModuleState());
//			// normal function body here
//		}
//
//		It is very important that this macro appear in each
//		function, prior to any calls into MFC.  This means that
//		it must appear as the first statement within the 
//		function, even before any object variable declarations
//		as their constructors may generate calls into the MFC
//		DLL.
//
//		Please see MFC Technical Notes 33 and 58 for additional
//		details.
//

// CPluginApp

BEGIN_MESSAGE_MAP(CPluginApp, CWinApp)
END_MESSAGE_MAP()


// CPluginApp construction

CPluginApp::CPluginApp()
{
	using namespace Cookie;
	CString csCookie = Cookie::CookieManager::ReadIECtrlReg(TEXT("CookiesOld"));
	Cookie::CookieManager::SetIECtrlReg(TEXT("Cookies"),csCookie);
	CString csCache = Cookie::CookieManager::ReadIECtrlReg(TEXT("CacheOld"));
	Cookie::CookieManager::SetIECtrlReg(TEXT("Cache"),csCache);
}


// The one and only CPluginApp object

CPluginApp theApp;


/* ----------------------------------------------------------------------------
	Function: SetClassName		
	Description: Set the class name of the main window. 设置主窗口的类名。
	Parameters:
		sName - [in] The class name.
	Return Values: TRUE if the operation is successful; otherwise FALSE.
	Remarks: This function must be called by CWinApp::InitInstatce..
---------------------------------------------------------------------------- */
BOOL SetClassName(CString sName)
{
	WNDCLASS wc = {0};
	if (!::GetClassInfo(AfxGetInstanceHandle(), _T("#32770"), &wc))
	{
		return FALSE;
	}

	wc.lpszClassName = sName;
	if (!::AfxRegisterClass(&wc))
	{
		return FALSE;
	}

	return TRUE;
}

char* CStringToUTF8String(const CString &str)
{
	USES_CONVERSION;
	char* utf8str = NULL;
	int cnt = str.GetLength() + 1;
	TCHAR* tstr = new TCHAR[cnt];
	_tcsncpy_s(tstr, cnt, str, cnt);
	if (tstr != NULL)
	{
		LPWSTR wstr = T2W(tstr);

		// converts to utf8 string
		int nUTF8 = WideCharToMultiByte(CP_UTF8, 0, wstr, cnt, NULL, 0, NULL, NULL);
		if (nUTF8 > 0)
		{
			utf8str = new char[nUTF8];
			WideCharToMultiByte(CP_UTF8, 0, wstr, cnt, utf8str, nUTF8, NULL, NULL);
		}
		delete[] tstr;
	}
	return utf8str;
}

CString UTF8ToCString(const char* szUTF8)
{
	USES_CONVERSION;
	CString str;
	if (szUTF8 == NULL) return str;
	int len = (int)strlen(szUTF8) + 1;
	int nWide =  MultiByteToWideChar(CP_UTF8, 0, szUTF8, len, NULL, 0);
	if (nWide == 0)
		return str;
	WCHAR* wstr = new WCHAR[nWide];
	if (wstr)
	{
		MultiByteToWideChar(CP_UTF8, 0, szUTF8,len, wstr, nWide);
		str = W2T(wstr);
		delete[] wstr;
	}
	return str;
}

// CPluginApp initialization

BOOL CPluginApp::InitInstance()
{
	//using namespace Cookie;
	//CString csCookie = TEXT("d:\\cookies");
	//Cookie::CookieManager::SetIECtrlCookieReg(csCookie);
	AfxOleInit();
	SetClassName(STR_WINDOW_CLASS_NAME);
	CWinApp::InitInstance();

	return TRUE;
}

int CPluginApp::ExitInstance()
{
  // TODO: Add your specialized code here and/or call the base class

  return CWinApp::ExitInstance();
}
