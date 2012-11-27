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

// App.cpp : App related information

#include "StdAfx.h"

#include "App.h"

using namespace Utils;

App::Application App::s_app = UNKNOWN;
CString App::s_strProcessName = _T("");

App::Application App::GetApplication()
{
	if (s_app != UNKNOWN) return s_app;

	CString strProcessName = GetProcessName().MakeLower();
	if (strProcessName == _T("firefox.exe"))
		s_app = FIREFOX;
	else if (strProcessName == _T("palemoon.exe"))
		s_app = PALEMOON;
	else if (strProcessName == _T("waterfox.exe"))
		s_app = WATERFOX;
	else if (strProcessName == _T("plugin-container.exe"))
		s_app = OOPP;
	else s_app = UNRECOGNIZED_APP;

	return s_app;
}

CString App::GetProcessName()
{
	if (s_strProcessName.GetLength()) return s_strProcessName;

	TCHAR szPathName[MAX_PATH];
	GetModuleFileName(NULL, szPathName, MAX_PATH);
	TCHAR szFileName[MAX_PATH];
	TCHAR szFileExt[MAX_PATH];
	if (0 == _tsplitpath_s(szPathName, NULL, 0, NULL, 0, szFileName, MAX_PATH, szFileExt, MAX_PATH))
	{
		return s_strProcessName = CString(szFileName) + szFileExt;
	}
	return s_strProcessName = _T("firefox.exe");
}
