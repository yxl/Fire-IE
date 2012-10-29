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

#include <mshtmcid.h>
#include <mshtmhst.h>
#include <mshtmdid.h>
#include <mshtml.h>

class CIEHostWindow;

class CIEControlSite : public COleControlSite
{
public:
	CIEControlSite(COleControlContainer* pContainer, CIEHostWindow* dlg);
	~CIEControlSite();

	BEGIN_INTERFACE_PART(DocHostUIHandler, IDocHostUIHandler)
		STDMETHOD(ShowContextMenu)(DWORD, LPPOINT, LPUNKNOWN, LPDISPATCH);
		STDMETHOD(GetHostInfo)(DOCHOSTUIINFO*);
		STDMETHOD(ShowUI)(DWORD, LPOLEINPLACEACTIVEOBJECT,
			LPOLECOMMANDTARGET, LPOLEINPLACEFRAME, LPOLEINPLACEUIWINDOW);
		STDMETHOD(HideUI)(void);
		STDMETHOD(UpdateUI)(void);
		STDMETHOD(EnableModeless)(BOOL);
		STDMETHOD(OnDocWindowActivate)(BOOL);
		STDMETHOD(OnFrameWindowActivate)(BOOL);
		STDMETHOD(ResizeBorder)(LPCRECT, LPOLEINPLACEUIWINDOW, BOOL);
		STDMETHOD(TranslateAccelerator)(LPMSG, const GUID*, DWORD);
		STDMETHOD(GetOptionKeyPath)(OLECHAR **, DWORD);
		STDMETHOD(GetDropTarget)(LPDROPTARGET, LPDROPTARGET*);
		STDMETHOD(GetExternal)(LPDISPATCH*);
		STDMETHOD(TranslateUrl)(DWORD, OLECHAR*, OLECHAR **);
		STDMETHOD(FilterDataObject)(LPDATAOBJECT , LPDATAOBJECT*);
	END_INTERFACE_PART(DocHostUIHandler)

	BEGIN_INTERFACE_PART(OleCommandTarget, IOleCommandTarget)
		STDMETHOD(Exec)( 
			/* [unique][in] */ const GUID __RPC_FAR *pguidCmdGroup,
			/* [in] */ DWORD nCmdID,
			/* [in] */ DWORD nCmdexecopt,
			/* [unique][in] */ VARIANT __RPC_FAR *pvaIn,
			/* [unique][out][in] */ VARIANT __RPC_FAR *pvaOut);

		STDMETHOD(QueryStatus)(
			/* [unique][in] */ const GUID __RPC_FAR *pguidCmdGroup,
			/* [in] */ ULONG cCmds,
			/* [out][in][size_is] */ OLECMD __RPC_FAR prgCmds[  ],
			/* [unique][out][in] */ OLECMDTEXT __RPC_FAR *pCmdText);
	END_INTERFACE_PART(OleCommandTarget)

	BEGIN_INTERFACE_PART(HTMLOMWindowServices, IHTMLOMWindowServices)
	    STDMETHOD(moveTo)( 
            /* [in] */ LONG x,
            /* [in] */ LONG y);
        
        STDMETHOD(moveBy)( 
            /* [in] */ LONG x,
            /* [in] */ LONG y);
        
        STDMETHOD(resizeTo)( 
            /* [in] */ LONG x,
            /* [in] */ LONG y);
        
        STDMETHOD(resizeBy)( 
            /* [in] */ LONG x,
            /* [in] */ LONG y);

		HRESULT window_call(const char * methodName, LONG x, LONG y);
	END_INTERFACE_PART(HTMLOMWindowServices)

	DECLARE_INTERFACE_MAP()

protected:
	CIEHostWindow* m_dlg;
};
