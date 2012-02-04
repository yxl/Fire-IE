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
