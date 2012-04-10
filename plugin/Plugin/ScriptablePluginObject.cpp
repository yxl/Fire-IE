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
#include "plugin.h"

namespace Plugin
{
	bool ScriptablePluginObject::HasMethod(NPIdentifier name)
	{
		return m_setMethods.find(name) != m_setMethods.end();
	}

	bool ScriptablePluginObject::HasProperty(NPIdentifier name)
	{
		return m_setProperties.find(name) != m_setProperties.end();
	}

	bool ScriptablePluginObject::GetProperty(NPIdentifier name, NPVariant *result)
	{
		CIEHostWindow* pMainWindow = GetIEHostWindow();
		if (pMainWindow == NULL)
			return false;

		// readonly property {string} URL
		if (name == NPI_ID(URL)) 
		{
			CString URL = pMainWindow->GetURL();
			STRINGZ_TO_NPVARIANT(CStringToNPStringCharacters(URL), *result);
			return true;
		} 
		// readonly property {title} LocationURL
		else if (name == NPI_ID(Title))
		{
			CString title = pMainWindow->GetTitle();
			STRINGZ_TO_NPVARIANT(CStringToNPStringCharacters(title), *result);
			return true;
		}
		// readonly property {string} FaviconURL
		else if (name == NPI_ID(FaviconURL))
		{
			CString url = pMainWindow->GetFaviconURL();
			STRINGZ_TO_NPVARIANT(CStringToNPStringCharacters(url), *result);
			return true;
		}
		// readonly property {boolean} CanRefresh
		else if (name == NPI_ID(CanRefresh))
		{
			BOOL canRefresh = pMainWindow->GetCanRefresh();
			BOOLEAN_TO_NPVARIANT(canRefresh, *result);
			return true;
		}
		// readonly property {boolean} CanStop
		else if (name == NPI_ID(CanStop))
		{
			BOOL canStop = pMainWindow->GetCanStop();
			BOOLEAN_TO_NPVARIANT(canStop, *result);
			return true;
		}
		// readonly property {boolean} CanBack
		else if (name == NPI_ID(CanBack))
		{
			BOOL canBack = pMainWindow->GetCanBack();
			BOOLEAN_TO_NPVARIANT(canBack, *result);
			return true;
		}
		// readonly property {boolean} CanForward
		else if (name == NPI_ID(CanForward))
		{
			BOOL canForward = pMainWindow->GetCanForward();
			BOOLEAN_TO_NPVARIANT(canForward, *result);
			return true;
		}
		// readonly property {boolean} CanCopy
		else if (name == NPI_ID(CanCopy))
		{
			BOOL canCopy = pMainWindow->GetCanCopy();
			BOOLEAN_TO_NPVARIANT(canCopy, *result);
			return true;
		}
		// readonly property {boolean} CanCut
		else if (name == NPI_ID(CanCut))
		{
			BOOL canCut = pMainWindow->GetCanCut();
			BOOLEAN_TO_NPVARIANT(canCut, *result);
			return true;
		}
		// readonly property {boolean} CanPaste
		else if (name == NPI_ID(CanPaste))
		{
			BOOL canPaste = pMainWindow->GetCanPaste();
			BOOLEAN_TO_NPVARIANT(canPaste, *result);
			return true;
		}
		// readonly property {boolean} CanSelectAll
		else if (name == NPI_ID(CanSelectAll))
		{
			BOOL canSelectAll = pMainWindow->GetCanSelectAll();
			BOOLEAN_TO_NPVARIANT(canSelectAll, *result);
			return true;
		}
		// readonly property {boolean} CanUndo
		else if (name == NPI_ID(CanUndo))
		{
			BOOL canUndo = pMainWindow->GetCanUndo();
			BOOLEAN_TO_NPVARIANT(canUndo, *result);
			return true;
		}
		// readonly property {boolean} CanRedo
		else if (name == NPI_ID(CanRedo))
		{
			BOOL canRedo = pMainWindow->GetCanRedo();
			BOOLEAN_TO_NPVARIANT(canRedo, *result);
			return true;
		}
		// readonly property {boolean} Progress
		else if (name == NPI_ID(Progress))
		{
			INT32_TO_NPVARIANT(pMainWindow->GetProgress(),*result);
			return true;
		}
		// readonly property {string} SelectionText
		else if (name == NPI_ID(SelectionText))
		{
			CString text = pMainWindow->GetSelectionText();
			STRINGZ_TO_NPVARIANT(CStringToNPStringCharacters(text), *result);
			return true;
		}
		// readonly property {string} FBLastFindStatus
		else if (name == NPI_ID(FBLastFindStatus))
		{
			CString status = pMainWindow->FBGetLastFindStatus();
			STRINGZ_TO_NPVARIANT(CStringToNPStringCharacters(status), *result);
			return true;
		}

		VOID_TO_NPVARIANT(*result);
		return true;
	}

	bool ScriptablePluginObject::Invoke(NPIdentifier name, const NPVariant *args,
		uint32_t argCount, NPVariant *result)
	{
		CIEHostWindow* pMainWindow = GetIEHostWindow();

		if (pMainWindow == NULL)
			return false;

		// void Navigate({string} URL, {string} post, {string} headers)
		if (name == NPI_ID(Navigate)) 
		{
			TRACE ("Navigate called!\n");
			if (argCount < 3)
				return false;

			NPVariant vURL = args[0];
			if (vURL.type != NPVariantType_String)
				return false;
			CString URL = NPStringToCString(vURL.value.stringValue);

			NPVariant vHeaders = args[1];
			if (vHeaders.type != NPVariantType_String)
				return false;
			CString headers = NPStringToCString(vHeaders.value.stringValue);

			NPVariant vPost = args[2];
			if (vPost.type != NPVariantType_String)
				return false;
			CString post = NPStringToCString(vPost.value.stringValue);

			pMainWindow->Navigate(URL, post, headers);

			VOID_TO_NPVARIANT(*result);

			return true;
		}
		// void Refresh()
		else if (name == NPI_ID(Refresh))
		{
			TRACE ("Refresh called!\n");
			pMainWindow->Refresh();
			return true;
		}
		// void Stop()
		else if (name == NPI_ID(Stop))
		{
			TRACE ("Stop called!\n");
			pMainWindow->Stop();
			return true;
		}
		// void Back()
		else if (name == NPI_ID(Back))
		{
			TRACE ("Back called!\n");
			pMainWindow->Back();
			return true;
		}
		// void Forward()
		else if (name == NPI_ID(Forward))
		{
			TRACE ("Forward called!\n");
			pMainWindow->Forward();
			return true;
		}
		// void Focus()
		else if (name == NPI_ID(Focus))
		{
			TRACE ("Focus called!\n");
			pMainWindow->Focus();
			return true;
		}
		// void Copy()
		else if (name == NPI_ID(Copy))
		{
			TRACE ("Copy called!\n");
			pMainWindow->Copy();
			return true;
		}
		// void Cut()
		else if (name == NPI_ID(Cut))
		{
			TRACE ("Cut called!\n");
			pMainWindow->Cut();
			return true;
		}
		// void Paste()
		else if (name == NPI_ID(Paste))
		{
			TRACE ("Paste called!\n");
			pMainWindow->Paste();
			return true;
		}
		// void SelectAll()
		else if (name == NPI_ID(SelectAll))
		{
			TRACE ("SelectAll called!\n");
			pMainWindow->SelectAll();
			return true;
		}
		// void Undo()
		else if (name == NPI_ID(Undo))
		{
			TRACE ("Undo called!\n");
			pMainWindow->Undo();
			return true;
		}
		// void Redo()
		else if (name == NPI_ID(Redo))
		{
			TRACE ("Redo called!\n");
			pMainWindow->Redo();
			return true;
		}
		// void Find()
		else if (name == NPI_ID(Find))
		{
			TRACE ("Find called!\n");
			pMainWindow->Find();
			return true;
		}
		// void HandOverFocus()
		else if (name == NPI_ID(HandOverFocus))
		{
			TRACE ("HandOverFocus called!\n");
			pMainWindow->HandOverFocus();
			return true;
		}
		// void Zoom({number} level)
		else if (name == NPI_ID(Zoom))
		{
			TRACE ("Zoom called!\n");

			if (argCount < 1)
				return false;

			double level = 1;

			if (NPVARIANT_IS_DOUBLE(args[0])) 
				level = NPVARIANT_TO_DOUBLE(args[0]);
			else if ( NPVARIANT_IS_INT32(args[0]) ) 
				level = NPVARIANT_TO_INT32(args[0]);

			pMainWindow->Zoom(level);
			return true;
		}
		// void DisplaySecurityInfo()
		else if (name == NPI_ID(DisplaySecurityInfo))
		{
			TRACE ("DisplaySecurityInfo called!\n");
			pMainWindow->DisplaySecurityInfo();
			return true;
		}
		// void SaveAs()
		else if (name == NPI_ID(SaveAs))
		{
			TRACE ("SaveAs called!\n");
			pMainWindow->SaveAs();
			return true;
		}
		// void Print()
		else if (name == NPI_ID(Print))
		{
			TRACE ("Print called!\n");
			pMainWindow->Print();
			return true;
		}
		// void PrintPreview()
		else if (name == NPI_ID(PrintPreview))
		{
			TRACE ("PrintPreview called!\n");
			pMainWindow->PrintPreview();
			return true;
		}
		// void PrintSetup()
		else if (name == NPI_ID(PrintSetup))
		{
			TRACE ("PrintSetup called!\n");
			pMainWindow->PrintSetup();
			return true;
		}
		else if (name == NPI_ID(ViewPageSource))
		{
			TRACE ("ViewPageSource called!\n");
			pMainWindow->ViewPageSource();
			return true;
		}
		else if (name == NPI_ID(PageUp))
		{
			TRACE ("PageUp called!\n");
			pMainWindow->ScrollPage(true);
			return true;
		}
		else if (name == NPI_ID(PageDown))
		{
			TRACE ("PageDown called!\n");
			pMainWindow->ScrollPage(false);
			return true;
		}
		else if (name == NPI_ID(LineUp))
		{
			TRACE ("LineUp called!\n");
			pMainWindow->ScrollLine(true);
			return true;
		}
		else if (name == NPI_ID(LineDown))
		{
			TRACE ("LineDown called!\n");
			pMainWindow->ScrollLine(false);
			return true;
		}
		else if (name == NPI_ID(FBFindText))
		{
			TRACE ("FBFindText called!\n");
			if (argCount < 1) return false;

			CString text = _T("");
			if (NPVARIANT_IS_STRING(args[0]))
				text = NPStringToCString(NPVARIANT_TO_STRING(args[0]));
			else
				return false;

			pMainWindow->FBFindText(text);
			return true;
		}
		else if (name == NPI_ID(FBEndFindText))
		{
			TRACE ("FBEndFindText called!\n");

			pMainWindow->FBEndFindText();
			return true;
		}
		else if (name == NPI_ID(FBFindAgain))
		{
			TRACE ("FBFindAgain called!\n");
			
			pMainWindow->FBFindAgain();
			return true;
		}
		else if (name == NPI_ID(FBFindPrevious))
		{
			TRACE ("FBFindPrevious called!\n");
			
			pMainWindow->FBFindPrevious();
			return true;
		}
		else if (name == NPI_ID(FBToggleHighlight))
		{
			TRACE ("FBToggleHighlight called!\n");
			if (argCount < 1) return false;

			bool ifHighlight;

			if (NPVARIANT_IS_BOOLEAN(args[0]))
				ifHighlight = NPVARIANT_TO_BOOLEAN(args[0]);
			else
				return false;

			pMainWindow->FBToggleHighlight(ifHighlight);
			return true;
		}
		else if (name == NPI_ID(FBToggleCase))
		{
			TRACE ("FBToggleCase called!\n");
			if (argCount < 1) return false;

			bool ifCase;

			if (NPVARIANT_IS_BOOLEAN(args[0]))
				ifCase = NPVARIANT_TO_BOOLEAN(args[0]);
			else
				return false;

			pMainWindow->FBToggleCase(ifCase);
			return true;
		}
		else if (name == NPI_ID(FBSetFindText))
		{
			TRACE ("FBSetFindText called!\n");
			if (argCount < 1) return false;

			CString text = _T("");
			if (NPVARIANT_IS_STRING(args[0]))
				text = NPStringToCString(NPVARIANT_TO_STRING(args[0]));
			else
				return false;

			pMainWindow->FBSetFindText(text);
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


	CIEHostWindow* ScriptablePluginObject::GetIEHostWindow()
	{
		CPlugin* pPlugin =  reinterpret_cast<CPlugin*>(mNpp->pdata);
		if (pPlugin)
		{
			return pPlugin->GetIEHostWindow();
		}
		return NULL;
	}
}

