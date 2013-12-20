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

// PluginApp.h : main header file for the plugin DLL
//

#pragma once

#ifndef __AFXWIN_H__
	#error "include 'stdafx.h' before including this file for PCH"
#endif

#include "resource.h"		// main symbols

#define STR_WINDOW_CLASS_NAME	RES_PROJNAME_T	// CIEHostWindow´°¿ÚÀàÃû

#define SAFE_DELETE(X) if(X){delete X; X = NULL;}

/**
 * Conver CString into UTF8 character sequence
 * Caller is responsible to delete[] after use
 */
char* CStringToUTF8String(const CString &str);

// Convert UTF8 character sequence into CString
CString UTF8ToCString(const char* szUTF8);

// CPluginApp
// See PluginApp.cpp for the implementation of this class
//

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
