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
}


// The one and only CPluginApp object

CPluginApp theApp;


/* ----------------------------------------------------------------------------
	Function: SetClassName		
	Description: Set the class name of the main window.
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

// CPluginApp initialization

BOOL CPluginApp::InitInstance()
{
	AfxOleInit();
	AfxEnableControlContainer();

	SetClassName(STR_WINDOW_CLASS_NAME);
	CWinApp::InitInstance();

	return TRUE;
}

int CPluginApp::ExitInstance()
{
  return CWinApp::ExitInstance();
}
