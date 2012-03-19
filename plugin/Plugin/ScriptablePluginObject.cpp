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
#include "stdafx.h"
#include "ScriptablePluginObject.h"
#include "IEHostWindow.h"

namespace Plugin
{
	bool ScriptablePluginObject::HasMethod(NPIdentifier name)
	{
		if (name == m_NavigateID ||
			name == m_RefreshID ||
			name == m_StopID ||
			name == m_BackID ||
			name == m_ForwardID ||
			name == m_FocusID ||
			name == m_CopyID ||
			name == m_CutID ||
			name == m_PasteID ||
			name == m_SelectAllID ||
			name == m_FindID ||
			name == m_HandOverFocusID ||
			name == m_ZoomID ||
			name == m_DisplaySecurityInfoID ||
			name == m_SaveAsID ||
			name == m_PrintID ||
			name == m_PrintPreviewID ||
			name == m_PrintSetupID)
		{
			return true;
		}
		return false;
	}

	bool ScriptablePluginObject::HasProperty(NPIdentifier name)
	{
		if (name == m_URLID ||
			name == m_TitleID ||
			name == m_FaviconURLID ||
			name == m_CanRefreshID ||
			name == m_CanStopID ||
			name == m_CanBackID ||
			name == m_CanForwardID ||
			name == m_CanCopyID ||
			name == m_CanCutID || 
			name == m_CanPasteID ||
			name == m_ProgressID)
		{
			return true;
		}
		return false;
	}

	bool ScriptablePluginObject::GetProperty(NPIdentifier name, NPVariant *result)
	{
		if (m_pMainWindow == NULL)
			return false;

		// readonly property {string} URL
		if (name == m_URLID) 
		{
			CString URL = m_pMainWindow->GetURL();
			STRINGZ_TO_NPVARIANT(CStringToNPStringCharacters(URL), *result);
			return true;
		} 
		// readonly property {title} LocationURL
		else if (name == m_TitleID)
		{
			CString title = m_pMainWindow->GetTitle();
			STRINGZ_TO_NPVARIANT(CStringToNPStringCharacters(title), *result);
			return true;
		}
		// readonly property {string} FaviconURL
		else if (name == m_FaviconURLID)
		{
			CString url = m_pMainWindow->GetFaviconURL();
			STRINGZ_TO_NPVARIANT(CStringToNPStringCharacters(url), *result);
			return true;
		}
		// readonly property {boolean} CanRefresh
		else if (name == m_CanRefreshID)
		{
			BOOL canRefresh = m_pMainWindow->GetCanRefresh();
			BOOLEAN_TO_NPVARIANT(canRefresh, *result);
			return true;
		}
		// readonly property {boolean} CanStop
		else if (name == m_CanStopID)
		{
			BOOL canStop = m_pMainWindow->GetCanStop();
			BOOLEAN_TO_NPVARIANT(canStop, *result);
			return true;
		}
		// readonly property {boolean} CanBack
		else if (name == m_CanBackID)
		{
			BOOL canBack = m_pMainWindow->GetCanBack();
			BOOLEAN_TO_NPVARIANT(canBack, *result);
			return true;
		}
		// readonly property {boolean} CanForward
		else if (name == m_CanForwardID)
		{
			BOOL canForward = m_pMainWindow->GetCanForward();
			BOOLEAN_TO_NPVARIANT(canForward, *result);
			return true;
		}
		// readonly property {boolean} CanCopy
		else if (name == m_CanCopyID)
		{
			BOOL canCopy = m_pMainWindow->GetCanCopy();
			BOOLEAN_TO_NPVARIANT(canCopy, *result);
			return true;
		}
		// readonly property {boolean} CanCut
		else if (name == m_CanCutID)
		{
			BOOL canCut = m_pMainWindow->GetCanCut();
			BOOLEAN_TO_NPVARIANT(canCut, *result);
			return true;
		}
		// readonly property {boolean} CanPaste
		else if (name == m_CanPasteID)
		{
			BOOL canPaste = m_pMainWindow->GetCanPaste();
			BOOLEAN_TO_NPVARIANT(canPaste, *result);
			return true;
		}
		// readonly property {boolean} Progress
		else if (name == m_ProgressID)
		{
			INT32_TO_NPVARIANT(m_pMainWindow->GetProgress(),*result);
			return true;
		}

		VOID_TO_NPVARIANT(*result);
		return true;
	}

	bool ScriptablePluginObject::Invoke(NPIdentifier name, const NPVariant *args,
		uint32_t argCount, NPVariant *result)
	{
		if (m_pMainWindow == NULL)
			return false;

		// void Navigate({string} URL)
		if (name == m_NavigateID) 
		{
			TRACE ("Navigate called!\n");
			if (argCount < 1)
				return false;

			NPVariant vURL = args[0];
			if (vURL.type != NPVariantType_String)
				return false;
			CString URL = NPStringToCString(vURL.value.stringValue);

			m_pMainWindow->Navigate(URL);

			VOID_TO_NPVARIANT(*result);

			return true;
		}
		// void Refresh()
		else if (name == m_RefreshID)
		{
			TRACE ("Refresh called!\n");
			m_pMainWindow->Refresh();
			return true;
		}
		// void Stop()
		else if (name == m_StopID)
		{
			TRACE ("Stop called!\n");
			m_pMainWindow->Stop();
			return true;
		}
		// void Back()
		else if (name == m_BackID)
		{
			TRACE ("Back called!\n");
			m_pMainWindow->Back();
			return true;
		}
		// void Forward()
		else if (name == m_ForwardID)
		{
			TRACE ("Forward called!\n");
			m_pMainWindow->Forward();
			return true;
		}
		// void Focus()
		else if (name == m_FocusID)
		{
			TRACE ("Focus called!\n");
			m_pMainWindow->Focus();
			return true;
		}
		// void Copy()
		else if (name == m_CopyID)
		{
			TRACE ("Copy called!\n");
			m_pMainWindow->Copy();
			return true;
		}
		// void Cut()
		else if (name == m_CutID)
		{
			TRACE ("Cut called!\n");
			m_pMainWindow->Cut();
			return true;
		}
		// void Paste()
		else if (name == m_PasteID)
		{
			TRACE ("Paste called!\n");
			m_pMainWindow->Paste();
			return true;
		}
		// void SelectAll()
		else if (name == m_SelectAllID)
		{
			TRACE ("SelectAll called!\n");
			m_pMainWindow->SelectAll();
			return true;
		}
		// void Find()
		else if (name == m_FindID)
		{
			TRACE ("Find called!\n");
			m_pMainWindow->Find();
			return true;
		}
		// void HandOverFocus()
		else if (name == m_HandOverFocusID)
		{
			TRACE ("HandOverFocus called!\n");
			m_pMainWindow->HandOverFocus();
			return true;
		}
		// void Zoom({number} level)
		else if (name == m_ZoomID)
		{
			TRACE ("Zoom called!\n");

			if (argCount < 1)
				return false;

			double level = 1;

			if (NPVARIANT_IS_DOUBLE(args[0])) 
				level = NPVARIANT_TO_DOUBLE(args[0]);
			else if ( NPVARIANT_IS_INT32(args[0]) ) 
				level = NPVARIANT_TO_INT32(args[0]);

			m_pMainWindow->Zoom(level);
			return true;
		}
		// void DisplaySecurityInfo()
		else if (name == m_DisplaySecurityInfoID)
		{
			TRACE ("DisplaySecurityInfo called!\n");
			m_pMainWindow->DisplaySecurityInfo();
			return true;
		}
		// void SaveAs()
		else if (name == m_SaveAsID)
		{
			TRACE ("SaveAs called!\n");
			m_pMainWindow->SaveAs();
			return true;
		}
		// void Print()
		else if (name == m_PrintID)
		{
			TRACE ("Print called!\n");
			m_pMainWindow->Print();
			return true;
		}
		// void PrintPreview()
		else if (name == m_PrintPreviewID)
		{
			TRACE ("PrintPreview called!\n");
			m_pMainWindow->PrintPreview();
			return true;
		}
		// void PrintSetup()
		else if (name == m_PrintSetupID)
		{
			TRACE ("PrintSetup called!\n");
			m_pMainWindow->PrintSetup();
			return true;
		}
		return false;
	}

	bool ScriptablePluginObject::InvokeDefault(const NPVariant *args, uint32_t argCount,
		NPVariant *result)
	{
		CString strMessage(_T("Welcome to use the FireIE Plugin for firefox!"));
		STRINGZ_TO_NPVARIANT(CStringToNPStringCharacters(strMessage), *result);
		return true;
	}

	void ScriptablePluginObject::SetMainWindow(CIEHostWindow* pWnd)
	{
		m_pMainWindow = pWnd;
	}
}

