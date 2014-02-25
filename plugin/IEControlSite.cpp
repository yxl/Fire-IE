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
#include "StdAfx.h"
#include "IEControlSite.h"
#include "IEHostWindow.h"

BEGIN_INTERFACE_MAP(CIEControlSite, COleControlSite)
	INTERFACE_PART(CIEControlSite, IID_IOleCommandTarget, OleCommandTarget)
	INTERFACE_PART(CIEControlSite, IID_IDocHostUIHandler, DocHostUIHandler)
	INTERFACE_PART(CIEControlSite, IID_IHTMLOMWindowServices, HTMLOMWindowServices)
END_INTERFACE_MAP()

CIEControlSite::CIEControlSite(COleControlContainer* pContainer, CIEHostWindow* dlg)
	: COleControlSite(pContainer), m_dlg(dlg)
{
}

CIEControlSite::~CIEControlSite()
{
}


ULONG FAR EXPORT CIEControlSite::XOleCommandTarget::AddRef()
{
	METHOD_PROLOGUE_EX_(CIEControlSite, OleCommandTarget);
	return pThis->ExternalAddRef();
}


ULONG FAR EXPORT CIEControlSite::XOleCommandTarget::Release()
{                            
	METHOD_PROLOGUE_EX_(CIEControlSite, OleCommandTarget);
	return pThis->ExternalRelease();
}

HRESULT FAR EXPORT CIEControlSite::XOleCommandTarget::QueryInterface(REFIID riid, void **ppvObj)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, OleCommandTarget);
	HRESULT hr = (HRESULT)pThis->ExternalQueryInterface(&riid, ppvObj);
	return hr;
}


STDMETHODIMP CIEControlSite::XOleCommandTarget::Exec(
	/* [unique][in] */ const GUID __RPC_FAR *pguidCmdGroup,
	/* [in] */ DWORD nCmdID,
	/* [in] */ DWORD nCmdexecopt,
	/* [unique][in] */ VARIANT __RPC_FAR *pvaIn,
	/* [unique][out][in] */ VARIANT __RPC_FAR *pvaOut
	)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, OleCommandTarget);
	if ( pguidCmdGroup && IsEqualGUID(*pguidCmdGroup, CGID_DocHostCommandHandler))
	{
		// 屏蔽脚本错误提示, 已测试IE9
		if (nCmdID == OLECMDID_SHOWSCRIPTERROR)
		{
			// 这里只是简单屏蔽掉
			// 如果要进一步处理, 参考:
			// 《How to handle script errors as a WebBrowser control host》
			// http://support.microsoft.com/default.aspx?scid=kb;en-us;261003

			(*pvaOut).vt = VT_BOOL;
			// Continue running scripts on the page.
			(*pvaOut).boolVal = VARIANT_TRUE;
			return S_OK;

		}
	} 
	// 通过脚本关闭IE页面时通知父窗口
	if (nCmdID == OLECMDID_CLOSE) 
	{
		pThis->m_dlg->OnCloseIETab();
	}
	return OLECMDERR_E_NOTSUPPORTED;
}

STDMETHODIMP CIEControlSite::XOleCommandTarget::QueryStatus(
	/* [unique][in] */ const GUID __RPC_FAR *pguidCmdGroup,
	/* [in] */ ULONG cCmds,
	/* [out][in][size_is] */ OLECMD __RPC_FAR prgCmds[  ],
	/* [unique][out][in] */ OLECMDTEXT __RPC_FAR *pCmdText
	)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, OleCommandTarget);
	return OLECMDERR_E_NOTSUPPORTED;
}

ULONG FAR EXPORT CIEControlSite::XHTMLOMWindowServices::AddRef()
{
	METHOD_PROLOGUE_EX_(CIEControlSite, OleCommandTarget);
	return pThis->ExternalAddRef();
}


ULONG FAR EXPORT CIEControlSite::XHTMLOMWindowServices::Release()
{                            
	METHOD_PROLOGUE_EX_(CIEControlSite, OleCommandTarget);
	return pThis->ExternalRelease();
}

STDMETHODIMP CIEControlSite::XHTMLOMWindowServices::moveTo(LONG x, LONG y)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, OleCommandTarget);

	return window_call("moveTo", x, y);
}

STDMETHODIMP CIEControlSite::XHTMLOMWindowServices::moveBy(LONG x, LONG y)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, HTMLOMWindowServices);

	return window_call("moveBy", x, y);
}

STDMETHODIMP CIEControlSite::XHTMLOMWindowServices::resizeTo(LONG x, LONG y)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, HTMLOMWindowServices);

	return window_call("resizeTo", x, y);
}

STDMETHODIMP CIEControlSite::XHTMLOMWindowServices::resizeBy(LONG x, LONG y)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, HTMLOMWindowServices);

	return window_call("resizeBy", x, y);
}

HRESULT CIEControlSite::XHTMLOMWindowServices::window_call(const char * methodName, LONG x, LONG y)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, HTMLOMWindowServices);

	HRESULT hr = S_FALSE;

	if ( ! pThis->m_dlg ) return S_OK;

	return hr;
}

STDMETHODIMP CIEControlSite::XHTMLOMWindowServices::QueryInterface(
	REFIID iid, LPVOID far* ppvObj)     
{
	METHOD_PROLOGUE_EX_(CIEControlSite, HTMLOMWindowServices);
	return pThis->ExternalQueryInterface(&iid, ppvObj);
}

STDMETHODIMP CIEControlSite::XDocHostUIHandler::GetExternal(LPDISPATCH *lppDispatch)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, DocHostUIHandler);
	return S_FALSE;
}


#define IDR_BROWSE_CONTEXT_MENU  24641
#define IDR_FORM_CONTEXT_MENU    24640
#define SHDVID_GETMIMECSETMENU   27
#define SHDVID_ADDMENUEXTENSIONS 53
#define IDM_OPEN_IN_FIREFOX      (IDM_MENUEXT_LAST__ + 1)

STDMETHODIMP CIEControlSite::XDocHostUIHandler::ShowContextMenu(
	DWORD dwID, LPPOINT ppt, LPUNKNOWN pcmdTarget, LPDISPATCH pdispReserved)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, DocHostUIHandler);
	return S_FALSE;
}

STDMETHODIMP CIEControlSite::XDocHostUIHandler::GetHostInfo(
	DOCHOSTUIINFO *pInfo)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, DocHostUIHandler);

	pInfo->dwFlags |= DOCHOSTUIFLAG_NO3DBORDER
		|DOCHOSTUIFLAG_THEME
		|DOCHOSTUIFLAG_ENABLE_FORMS_AUTOCOMPLETE
		|DOCHOSTUIFLAG_LOCAL_MACHINE_ACCESS_CHECK;

	pInfo->dwDoubleClick = DOCHOSTUIDBLCLK_DEFAULT;

	return S_OK;
}


STDMETHODIMP CIEControlSite::XDocHostUIHandler::ShowUI(
	DWORD dwID, LPOLEINPLACEACTIVEOBJECT pActiveObject,
	LPOLECOMMANDTARGET pCommandTarget, LPOLEINPLACEFRAME pFrame,
	LPOLEINPLACEUIWINDOW pDoc)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, DocHostUIHandler);
	return S_FALSE;
}

STDMETHODIMP CIEControlSite::XDocHostUIHandler::HideUI(void)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, DocHostUIHandler);
	return S_FALSE;
}

STDMETHODIMP CIEControlSite::XDocHostUIHandler::UpdateUI(void)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, DocHostUIHandler);
	return S_FALSE;
}


STDMETHODIMP CIEControlSite::XDocHostUIHandler::EnableModeless(BOOL fEnable)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, DocHostUIHandler);
	return E_NOTIMPL;
}

STDMETHODIMP CIEControlSite::XDocHostUIHandler::OnDocWindowActivate(BOOL fActivate)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, DocHostUIHandler);
	return E_NOTIMPL;
}

STDMETHODIMP CIEControlSite::XDocHostUIHandler::OnFrameWindowActivate(
	BOOL fActivate)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, DocHostUIHandler);
	return E_NOTIMPL;
}

STDMETHODIMP CIEControlSite::XDocHostUIHandler::ResizeBorder(
	LPCRECT prcBorder, LPOLEINPLACEUIWINDOW pUIWindow, BOOL fFrameWindow)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, DocHostUIHandler);
	return E_NOTIMPL;
}

STDMETHODIMP CIEControlSite::XDocHostUIHandler::TranslateAccelerator(
	LPMSG lpMsg, const GUID* pguidCmdGroup, DWORD nCmdID)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, DocHostUIHandler);
	return S_FALSE;
}


STDMETHODIMP CIEControlSite::XDocHostUIHandler::GetOptionKeyPath(
	LPOLESTR* pchKey, DWORD dwReserved)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, DocHostUIHandler);
	return S_FALSE;
}


STDMETHODIMP CIEControlSite::XDocHostUIHandler::GetDropTarget(
	LPDROPTARGET pDropTarget, LPDROPTARGET* ppDropTarget)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, DocHostUIHandler);
	return E_NOTIMPL;
}

STDMETHODIMP CIEControlSite::XDocHostUIHandler::TranslateUrl(
	DWORD dwTranslate, OLECHAR* pchURLIn, OLECHAR** ppchURLOut)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, DocHostUIHandler);
	return S_FALSE;
}

STDMETHODIMP CIEControlSite::XDocHostUIHandler::FilterDataObject(
	LPDATAOBJECT pDataObject, LPDATAOBJECT* ppDataObject)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, DocHostUIHandler);
	return S_FALSE;
}


STDMETHODIMP_(ULONG) CIEControlSite::XDocHostUIHandler::AddRef()
{
	METHOD_PROLOGUE_EX_(CIEControlSite, DocHostUIHandler);
	return pThis->ExternalAddRef();
}

STDMETHODIMP_(ULONG) CIEControlSite::XDocHostUIHandler::Release()
{
	METHOD_PROLOGUE_EX_(CIEControlSite, DocHostUIHandler);
	return pThis->ExternalRelease();
}

STDMETHODIMP CIEControlSite::XDocHostUIHandler::QueryInterface(
	REFIID iid, LPVOID far* ppvObj)     
{
	METHOD_PROLOGUE_EX_(CIEControlSite, DocHostUIHandler);
	return pThis->ExternalQueryInterface(&iid, ppvObj);
}