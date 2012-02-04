#pragma once
#include "ScriptablePluginObjectBase.h"

class CIEHostWindow;

namespace Plugin
{
	class ScriptablePluginObject : public ScriptablePluginObjectBase
	{
	protected:
		// methods
		NPIdentifier m_NavigateID;
		NPIdentifier m_RefreshID;
		NPIdentifier m_StopID;
		NPIdentifier m_BackID;
		NPIdentifier m_ForwardID;
		NPIdentifier m_FocusID;
		NPIdentifier m_CopyID;
		NPIdentifier m_CutID;
		NPIdentifier m_PasteID;
		NPIdentifier m_SelectAllID;
		NPIdentifier m_FindID;
		NPIdentifier m_HandOverFocusID;
		NPIdentifier m_ZoomID;
		NPIdentifier m_DisplaySecurityInfoID;
		NPIdentifier m_SaveAsID;
		NPIdentifier m_PrintID;
		NPIdentifier m_PrintPreviewID;
		NPIdentifier m_PrintSetupID;

		// properties
		NPIdentifier m_URLID;
		NPIdentifier m_TitleID;
		NPIdentifier m_CanRefreshID;
		NPIdentifier m_CanStopID;
		NPIdentifier m_CanBackID;
		NPIdentifier m_CanForwardID;
		NPIdentifier m_CanCopyID;
		NPIdentifier m_CanCutID;
		NPIdentifier m_CanPasteID;
		NPIdentifier m_CanSelectAllID; // 没用, 恒为真
		NPIdentifier m_ProgressID;
	public:
		ScriptablePluginObject(NPP npp)
			: ScriptablePluginObjectBase(npp)
			, m_pMainWindow(NULL)
		{
			// methods
			m_NavigateID = NPN_GetStringIdentifier("Navigate");
			m_RefreshID = NPN_GetStringIdentifier("Refresh");
			m_StopID = NPN_GetStringIdentifier("Stop");
			m_BackID = NPN_GetStringIdentifier("Back");
			m_ForwardID = NPN_GetStringIdentifier("Forward");
			m_FocusID = NPN_GetStringIdentifier("Focus");
			m_CopyID = NPN_GetStringIdentifier("Copy");
			m_CutID = NPN_GetStringIdentifier("Cut");
			m_PasteID = NPN_GetStringIdentifier("Paste");
			m_SelectAllID = NPN_GetStringIdentifier("SelectAll");
			m_FindID = NPN_GetStringIdentifier("Find");
			m_HandOverFocusID = NPN_GetStringIdentifier("HandOverFocus");
			m_ZoomID = NPN_GetStringIdentifier("Zoom");
			m_DisplaySecurityInfoID = NPN_GetStringIdentifier("DisplaySecurityInfo");
			m_SaveAsID = NPN_GetStringIdentifier("SaveAs");
			m_PrintID = NPN_GetStringIdentifier("Print");
			m_PrintPreviewID = NPN_GetStringIdentifier("PrintPreview");
			m_PrintSetupID = NPN_GetStringIdentifier("PrintSetup");

			// properties
			m_URLID = NPN_GetStringIdentifier("URL");
			m_TitleID = NPN_GetStringIdentifier("Title");
			m_CanRefreshID = NPN_GetStringIdentifier("CanRefresh");
			m_CanStopID = NPN_GetStringIdentifier("CanStop");
			m_CanBackID = NPN_GetStringIdentifier("CanBack");
			m_CanForwardID = NPN_GetStringIdentifier("CanForward");
			m_CanCopyID = NPN_GetStringIdentifier("CanCopy");
			m_CanCutID = NPN_GetStringIdentifier("CanCut");
			m_CanPasteID = NPN_GetStringIdentifier("CanPaste");
			m_CanSelectAllID = NPN_GetStringIdentifier("CanSelectAll");
			m_ProgressID = NPN_GetStringIdentifier("Progress");
		}

		virtual bool HasMethod(NPIdentifier name);
		virtual bool HasProperty(NPIdentifier name);
		virtual bool GetProperty(NPIdentifier name, NPVariant *result);
		virtual bool Invoke(NPIdentifier name, const NPVariant *args,
			uint32_t argCount, NPVariant *result);
		virtual bool InvokeDefault(const NPVariant *args, uint32_t argCount,
			NPVariant *result);
		void SetMainWindow(CIEHostWindow* pWnd);

	protected:
		CIEHostWindow* m_pMainWindow;
	};

	static NPObject *
		AllocateScriptablePluginObject(NPP npp, NPClass *aClass)
	{
		return new ScriptablePluginObject(npp);
	}

	DECLARE_NPOBJECT_CLASS_WITH_BASE(ScriptablePluginObject,
	AllocateScriptablePluginObject);
}
