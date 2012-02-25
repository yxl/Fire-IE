/* ***** BEGIN LICENSE BLOCK *****
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 * ***** END LICENSE BLOCK ***** */
// PluginApp.h : main header file for the plugin DLL
//

#pragma once

#ifndef __AFXWIN_H__
	#error "include 'stdafx.h' before including this file for PCH"
#endif

#include "resource.h"		// main symbols

#define STR_WINDOW_CLASS_NAME	_T("FireIE")	// CIEHostWindow窗口类名

/** 将CString转换为UTF8字符串，
 *  使用完毕后，需调用delete[]释放字符串
 */
char* CStringToUTF8String(const CString &str);

/** 将UTF8字符串转为CString*/
CString UTF8ToCString(const char* szUTF8);

// CPluginApp
// See PluginApp.cpp for the implementation of this class
//

/**
* 模糊匹配两个 URL.
* http://my.com/path/file.html#123 和 http://my.com/path/file.html 会认为是同一个 URL
* http://my.com/path/query?p=xyz 和 http://my.com/path/query 不认为是同一个 URL
*/
BOOL FuzzyUrlCompare (LPCTSTR lpszUrl1, LPCTSTR lpszUrl2);

class CPluginApp : public CWinApp
{
public:
	CPluginApp();

// Overrides
public:
	virtual BOOL InitInstance();

	DECLARE_MESSAGE_MAP()
  virtual int ExitInstance();
};
