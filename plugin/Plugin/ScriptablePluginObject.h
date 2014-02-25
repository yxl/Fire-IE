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
#pragma once

#include "ScriptablePluginObjectBase.h"

#define NPI_ID(id) m_##id##ID
#define NPI_DEF(id) NPIdentifier NPI_ID(id)
#define NPN_GSI_M(id) NPI_ID(id) = NPN_GetStringIdentifier(#id); m_setMethods.insert(NPI_ID(id))
#define NPN_GSI_P(id) NPI_ID(id) = NPN_GetStringIdentifier(#id); m_setProperties.insert(NPI_ID(id))

class CIEHostWindow;

namespace Plugin
{
	class ScriptablePluginObject : public ScriptablePluginObjectBase
	{
	protected:
		std::set<NPIdentifier> m_setMethods;
		std::set<NPIdentifier> m_setProperties;

		// methods
		NPI_DEF(Navigate);
		NPI_DEF(Refresh);
		NPI_DEF(Stop);
		NPI_DEF(Back);
		NPI_DEF(Forward);
		NPI_DEF(Focus);
		NPI_DEF(Copy);
		NPI_DEF(Cut);
		NPI_DEF(Paste);
		NPI_DEF(SelectAll);
		NPI_DEF(Undo);
		NPI_DEF(Redo);
		NPI_DEF(Find);
		NPI_DEF(HandOverFocus);
		NPI_DEF(Zoom);
		NPI_DEF(DisplaySecurityInfo);
		NPI_DEF(SaveAs);
		NPI_DEF(Print);
		NPI_DEF(PrintPreview);
		NPI_DEF(PrintSetup);
		NPI_DEF(ViewPageSource);
		NPI_DEF(PageUp);
		NPI_DEF(PageDown);
		NPI_DEF(LineUp);
		NPI_DEF(LineDown);
		NPI_DEF(ScrollTop);
		NPI_DEF(ScrollBottom);
		NPI_DEF(ScrollLeft);
		NPI_DEF(ScrollRight);
		NPI_DEF(ScrollWheelUp);
		NPI_DEF(ScrollWheelDown);
		NPI_DEF(RemoveNewWindow);

		// findbar methods
		NPI_DEF(FBFindText); // FB stands for firefox FindBar
		NPI_DEF(FBEndFindText);
		NPI_DEF(FBFindAgain);
		NPI_DEF(FBFindPrevious);
		NPI_DEF(FBToggleHighlight);
		NPI_DEF(FBToggleCase);
		NPI_DEF(FBSetFindText);

		// util methods
		NPI_DEF(SetEnabledGestures);
		NPI_DEF(SetCookieSyncEnabled);
		NPI_DEF(SetDNTEnabled);
		NPI_DEF(SetDNTValue);

		// ABP methods
		NPI_DEF(ABPEnable);
		NPI_DEF(ABPDisable);
		NPI_DEF(ABPLoad);
		NPI_DEF(ABPClear);
		NPI_DEF(ABPSetAdditionalFilters);

		// properties
		NPI_DEF(URL);
		NPI_DEF(Title);
		NPI_DEF(FaviconURL);
		NPI_DEF(CanRefresh);
		NPI_DEF(CanStop);
		NPI_DEF(CanBack);
		NPI_DEF(CanForward);
		NPI_DEF(CanCopy);
		NPI_DEF(CanCut);
		NPI_DEF(CanPaste);
		NPI_DEF(CanSelectAll);
		NPI_DEF(CanUndo);
		NPI_DEF(CanRedo);
		NPI_DEF(Progress);
		NPI_DEF(SelectionText);
		NPI_DEF(SecureLockInfo);
		NPI_DEF(FBLastFindStatus);
		NPI_DEF(StatusText);
		NPI_DEF(ShouldShowStatusOurselves);
		NPI_DEF(ShouldPreventStatusFlash);
		NPI_DEF(IsDocumentComplete);
		NPI_DEF(ProcessName);

		// ABP properties
		NPI_DEF(ABPIsEnabled);
		NPI_DEF(ABPIsLoading);
		NPI_DEF(ABPLoadedFile);
		NPI_DEF(ABPAdditionalFilters);
	public:
		ScriptablePluginObject(NPP npp)
			: ScriptablePluginObjectBase(npp)
		{
			// methods
			NPN_GSI_M(Navigate);
			NPN_GSI_M(Refresh);
			NPN_GSI_M(Stop);
			NPN_GSI_M(Back);
			NPN_GSI_M(Forward);
			NPN_GSI_M(Focus);
			NPN_GSI_M(Copy);
			NPN_GSI_M(Cut);
			NPN_GSI_M(Paste);
			NPN_GSI_M(SelectAll);
			NPN_GSI_M(Undo);
			NPN_GSI_M(Redo);
			NPN_GSI_M(Find);
			NPN_GSI_M(HandOverFocus);
			NPN_GSI_M(Zoom);
			NPN_GSI_M(DisplaySecurityInfo);
			NPN_GSI_M(SaveAs);
			NPN_GSI_M(Print);
			NPN_GSI_M(PrintPreview);
			NPN_GSI_M(PrintSetup);
			NPN_GSI_M(ViewPageSource);
			NPN_GSI_M(PageUp);
			NPN_GSI_M(PageDown);
			NPN_GSI_M(LineUp);
			NPN_GSI_M(LineDown);
			NPN_GSI_M(ScrollTop);
			NPN_GSI_M(ScrollBottom);
			NPN_GSI_M(ScrollLeft);
			NPN_GSI_M(ScrollRight);
			NPN_GSI_M(ScrollWheelUp);
			NPN_GSI_M(ScrollWheelDown);
			NPN_GSI_M(RemoveNewWindow);
			NPN_GSI_M(FBFindText);
			NPN_GSI_M(FBEndFindText);
			NPN_GSI_M(FBFindAgain);
			NPN_GSI_M(FBFindPrevious);
			NPN_GSI_M(FBToggleHighlight);
			NPN_GSI_M(FBToggleCase);
			NPN_GSI_M(FBSetFindText);
			NPN_GSI_M(SetEnabledGestures);
			NPN_GSI_M(SetCookieSyncEnabled);
			NPN_GSI_M(SetDNTEnabled);
			NPN_GSI_M(SetDNTValue);
			NPN_GSI_M(ABPEnable);
			NPN_GSI_M(ABPDisable);
			NPN_GSI_M(ABPLoad);
			NPN_GSI_M(ABPClear);
			NPN_GSI_M(ABPSetAdditionalFilters);

			// properties
			NPN_GSI_P(URL);
			NPN_GSI_P(Title);
			NPN_GSI_P(FaviconURL);
			NPN_GSI_P(CanRefresh);
			NPN_GSI_P(CanStop);
			NPN_GSI_P(CanBack);
			NPN_GSI_P(CanForward);
			NPN_GSI_P(CanCopy);
			NPN_GSI_P(CanCut);
			NPN_GSI_P(CanPaste);
			NPN_GSI_P(CanSelectAll);
			NPN_GSI_P(CanUndo);
			NPN_GSI_P(CanRedo);
			NPN_GSI_P(Progress);
			NPN_GSI_P(SelectionText);
			NPN_GSI_P(SecureLockInfo);
			NPN_GSI_P(FBLastFindStatus);
			NPN_GSI_P(StatusText);
			NPN_GSI_P(ShouldShowStatusOurselves);
			NPN_GSI_P(ShouldPreventStatusFlash);
			NPN_GSI_P(IsDocumentComplete);
			NPN_GSI_P(ProcessName);
			NPN_GSI_P(ABPIsEnabled);
			NPN_GSI_P(ABPIsLoading);
			NPN_GSI_P(ABPLoadedFile);
			NPN_GSI_P(ABPAdditionalFilters);
		}

		virtual bool HasMethod(NPIdentifier name);
		virtual bool HasProperty(NPIdentifier name);
		virtual bool GetProperty(NPIdentifier name, NPVariant *result);
		virtual bool Invoke(NPIdentifier name, const NPVariant *args,
			uint32_t argCount, NPVariant *result);
		virtual bool InvokeDefault(const NPVariant *args, uint32_t argCount,
			NPVariant *result);

	protected:
		
		CIEHostWindow* GetIEHostWindow();
	};

	static NPObject *
		AllocateScriptablePluginObject(NPP npp, NPClass *aClass)
	{
		return new ScriptablePluginObject(npp);
	}

	DECLARE_NPOBJECT_CLASS_WITH_BASE(ScriptablePluginObject,
	AllocateScriptablePluginObject);
}

#undef NPI_DEF
#undef NPN_GSI_M
#undef NPN_GSI_P
