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

	// Suggested by Sonja's boodschappenlijst (jeepeenl@gmail.com):
	// Tools -> Options -> Content -> Enable Javascript [Advanced] -> Allow scripts to “Move or resize existing windows”.
	if ( ! pThis->m_dlg ) return S_OK;
/*
	if (nsConfigManager::isClassicMode || m_pParent->m_pPluginInstance->getConfigManager()->getBoolPref("dom.disable_window_move_resize")) return S_OK;

	HRESULT hr = E_FAIL;

	do 
	{
		if ( ! m_pParent ) break;
		if ( ! m_pParent->m_pPluginInstance ) break;

		NPP npp = m_pParent->m_pPluginInstance->instance();

		NPObject * window_object_ = NULL;
		if ( NPN_GetValue(npp, NPNVWindowNPObject, &window_object_) != NPERR_NO_ERROR ) break;

		NPIdentifier id_method = NPN_GetStringIdentifier(methodName);
		if ( !id_method ) break;

		NPVariant pt[2];
		INT32_TO_NPVARIANT(x, pt[0]);
		INT32_TO_NPVARIANT(y, pt[1]);
		NPVariant result;
		NULL_TO_NPVARIANT(result);
		if ( NPN_Invoke(npp, window_object_, id_method, pt, 2, &result) )
		{
			NPN_ReleaseVariantValue(&result);
		}

		hr = S_OK;

	} while(false);
	*/

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

	pInfo->dwFlags = DOCHOSTUIFLAG_NO3DBORDER
		|DOCHOSTUIFLAG_THEME
		|DOCHOSTUIFLAG_ENABLE_FORMS_AUTOCOMPLETE
		|DOCHOSTUIFLAG_LOCAL_MACHINE_ACCESS_CHECK
		|DOCHOSTUIFLAG_CODEPAGELINKEDFONTS;
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
	return S_OK;
}

STDMETHODIMP CIEControlSite::XDocHostUIHandler::UpdateUI(void)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, DocHostUIHandler);
	return S_OK;
}


STDMETHODIMP CIEControlSite::XDocHostUIHandler::EnableModeless(BOOL fEnable)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, DocHostUIHandler);
	return S_OK;
}

STDMETHODIMP CIEControlSite::XDocHostUIHandler::OnDocWindowActivate(BOOL fActivate)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, DocHostUIHandler);
	return S_OK;
}

STDMETHODIMP CIEControlSite::XDocHostUIHandler::OnFrameWindowActivate(
	BOOL fActivate)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, DocHostUIHandler);
	return S_OK;
}

STDMETHODIMP CIEControlSite::XDocHostUIHandler::ResizeBorder(
	LPCRECT prcBorder, LPOLEINPLACEUIWINDOW pUIWindow, BOOL fFrameWindow)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, DocHostUIHandler);
	return S_OK;
}

STDMETHODIMP CIEControlSite::XDocHostUIHandler::TranslateAccelerator(
	LPMSG lpMsg, const GUID* pguidCmdGroup, DWORD nCmdID)
{
	METHOD_PROLOGUE_EX_(CIEControlSite, DocHostUIHandler);
	HRESULT hr = S_FALSE;

	if ( lpMsg )
	{
		switch ( lpMsg->message )
		{
		case WM_KEYDOWN:
			{
				bool bCtrlPressed = HIBYTE(GetKeyState(VK_CONTROL))!=0;
				bool bAltPressed = HIBYTE(GetKeyState(VK_MENU))!=0;
				bool bShiftPressed = HIBYTE(GetKeyState(VK_SHIFT))!=0;

				// Ctrl-N 会让 IE 自己打开一个 IE 窗口，该窗口无法被我们的处理函数拦截
				// BUG #22839: AltGr + N (也就是 Ctrl-Alt-N）也被拦截了，在这里只拦截 Ctrl-N
				if ( bCtrlPressed && (!bAltPressed) && (!bShiftPressed) && ('N' == lpMsg->wParam) )
				{
					hr = S_OK;
				}

				break;
			}
		}
	}

	return hr;
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
	return S_FALSE;
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