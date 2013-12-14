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

// IEHostWindow.cpp : implementation file
//

#include "stdafx.h"
#include "IEControlSite.h"
#include "PluginApp.h"
#include "HttpMonitorApp.h"
#include "IEHostWindow.h"
#include "plugin.h"
#include "URL.h"
#include "abp/AdBlockPlus.h"
#include "re/strutils.h"
#include "OS.h"
#include "App.h"
#include "WindowMessageHook.h"
#include "HTTP.h"
#include "UserAgentListener.h"

using namespace UserMessage;
using namespace Utils;
using namespace abp;
using namespace re::strutils;

// Initilizes the static member variables of CIEHostWindow

CSimpleMap<HWND, CIEHostWindow *> CIEHostWindow::s_IEWindowMap;
CCriticalSection CIEHostWindow::s_csIEWindowMap; 
CSimpleMap<ULONG_PTR, CIEHostWindow *> CIEHostWindow::s_NewIEWindowMap;
CCriticalSection CIEHostWindow::s_csNewIEWindowMap;
CSimpleMap<HWND, CIEHostWindow *> CIEHostWindow::s_UtilsIEWindowMap;
CCriticalSection CIEHostWindow::s_csUtilsIEWindowMap;
CString CIEHostWindow::s_strIEUserAgent = _T("");
bool CIEHostWindow::s_bUserAgentProccessed = false;
const TCHAR* const CIEHostWindow::s_strElemHideClass = _T("fireie-elemhide-style");

// CIEHostWindow dialog

IMPLEMENT_DYNAMIC(CIEHostWindow, CDialog)

CIEHostWindow::CIEHostWindow(Plugin::CPlugin* pPlugin /*=NULL*/, CWnd* pParent /*=NULL*/)
	: CDialog(CIEHostWindow::IDD, pParent)
	, m_pPlugin(pPlugin)
	, m_bCanBack(FALSE)
	, m_bCanForward(FALSE)
	, m_iProgress(-1)
	, m_strFaviconURL(_T("NONE"))
	, m_bFBHighlight(false)
	, m_bFBCase(false)
	, m_strFBText(_T(""))
	, m_bFBInProgress(false)
	, m_lFBCurrentDoc(0)
	, m_strSecureLockInfo(_T("Unsecure"))
	, m_pNavigateParams(NULL)
	, m_strStatusText(_T(""))
	, m_bUtils(false)
	, m_strLoadingUrl(_T(""))
	, m_bIsRefresh(false)
	, m_bMainPageDone(false)
	, m_nObjCounter(0)
{
	FBResetFindStatus();
}

CIEHostWindow::~CIEHostWindow()
{
	SAFE_DELETE(m_pNavigateParams);

	m_csFuncs.Lock();
	m_qFuncs.clear();
	m_csFuncs.Unlock();
}

CIEHostWindow* CIEHostWindow::GetInstance(HWND hwnd)
{
	CIEHostWindow *pInstance = NULL;
	s_csIEWindowMap.Lock();
	pInstance = s_IEWindowMap.Lookup(hwnd);
	s_csIEWindowMap.Unlock();
	return pInstance;
}

CIEHostWindow* CIEHostWindow::FromInternetExplorerServer(HWND hwndIEServer)
{
	// Internet Explorer_Server 往上三级是 plugin 窗口
	HWND hwnd = ::GetParent(::GetParent(::GetParent(hwndIEServer)));
	CString strClassName;
	GetClassName(hwnd, strClassName.GetBuffer(MAX_PATH), MAX_PATH);
	strClassName.ReleaseBuffer();
	if (strClassName != STR_WINDOW_CLASS_NAME)
	{
		return NULL;
	}

	// 从Window Long中取出CIEHostWindow对象指针 
	CIEHostWindow* pInstance = reinterpret_cast<CIEHostWindow* >(::GetWindowLongPtr(hwnd, GWLP_USERDATA));
	return pInstance;
}

CIEHostWindow* CIEHostWindow::FromChildWindow(HWND hwndChild)
{
	// 用一个循环网上找（最多找 5 层）
	HWND hwnd = hwndChild;
	int count = 0;
	while ((count++ < 5) && (hwnd = ::GetParent(hwnd)))
	{
		CString strClassName;
		GetClassName(hwnd, strClassName.GetBuffer(MAX_PATH), MAX_PATH);
		strClassName.ReleaseBuffer();
		if (strClassName != STR_WINDOW_CLASS_NAME)
			continue;

		// 从Window Long中取出CIEHostWindow对象指针 
		CIEHostWindow* pInstance = reinterpret_cast<CIEHostWindow* >(::GetWindowLongPtr(hwnd, GWLP_USERDATA));
		return pInstance;
	}
	return NULL;
}

CIEHostWindow* CIEHostWindow::CreateNewIEHostWindow(CWnd* pParentWnd, ULONG_PTR ulId, bool isUtils)
{
	CIEHostWindow *pIEHostWindow = NULL;

	if (ulId != 0)
	{
		// The CIEHostWindow has been created that we needn't recreate it.
		s_csNewIEWindowMap.Lock();
		pIEHostWindow = CIEHostWindow::s_NewIEWindowMap.Lookup(ulId);
		if (pIEHostWindow)
		{
			pIEHostWindow->m_bUtils = isUtils;
			CIEHostWindow::s_NewIEWindowMap.Remove(ulId);
		}
		s_csNewIEWindowMap.Unlock();
	}
	if (!pIEHostWindow)
	{
		pIEHostWindow = new CIEHostWindow();
		if (pIEHostWindow == NULL || !pIEHostWindow->Create(CIEHostWindow::IDD, pParentWnd))
		{
			if (pIEHostWindow)
			{
				delete pIEHostWindow;
			}
			pIEHostWindow = NULL;
		}
		else
		{
			pIEHostWindow->m_bUtils = isUtils;
		}
	}
	return pIEHostWindow;
}

void CIEHostWindow::AddUtilsIEWindow(CIEHostWindow *pWnd)
{
	s_csUtilsIEWindowMap.Lock();
	s_UtilsIEWindowMap.Add(pWnd->GetSafeHwnd(), pWnd);
	s_csUtilsIEWindowMap.Unlock();
}

Plugin::CPlugin* CIEHostWindow::GetAnyUtilsPlugin()
{
	CIEHostWindow* pWindow = GetAnyUtilsWindow();
	if (pWindow)
		return pWindow->m_pPlugin;
	return NULL;
}

CIEHostWindow* CIEHostWindow::GetAnyUtilsWindow()
{
	CIEHostWindow* pWindow = NULL;
	HWND hwnd = GetAnyUtilsHWND();
	if (hwnd)
	{
		pWindow = reinterpret_cast<CIEHostWindow* >(::GetWindowLongPtr(hwnd, GWLP_USERDATA));
	}
	return pWindow;
}

HWND CIEHostWindow::GetAnyUtilsHWND()
{
	HWND hwnd = NULL;
	s_csUtilsIEWindowMap.Lock();
	if (s_UtilsIEWindowMap.GetSize() > 0)
	{
		hwnd = s_UtilsIEWindowMap.GetValueAt(0)->GetSafeHwnd();
	}
	s_csUtilsIEWindowMap.Unlock();
	return hwnd;
}

void CIEHostWindow::SetFirefoxCookie(vector<UserMessage::SetFirefoxCookieParams>&& vCookieParams, CIEHostWindow* pWindowContext)
{
	CIEHostWindow* pUtilsWindow = GetAnyUtilsWindow();
	if (pUtilsWindow)
	{
		vector<UserMessage::SetFirefoxCookieParams> vParams(std::move(vCookieParams));
		pUtilsWindow->RunAsync([pWindowContext, pUtilsWindow, vParams]
		{
			// Ensure that pWindowContext still exists
			// No need to use lock - modifications happen only on main thread
			bool bExists = pWindowContext && (-1 != s_IEWindowMap.FindVal(pWindowContext));

			// To use the window context, the window must already be attached to a plugin object,
			// otherwise, we can't fire the event.
			if (bExists && pWindowContext->m_pPlugin)
			{
				pWindowContext->m_pPlugin->SetFirefoxCookie(vParams, 0);
			}
			else
			{
				// Fall back to use the utils plugin
				if (pUtilsWindow && pUtilsWindow->m_pPlugin)
				{
					// Figure out the id of the window where the cookie(s) come from
					ULONG_PTR ulId = pWindowContext ? reinterpret_cast<ULONG_PTR>(pWindowContext) : 0;
					// Send cookies as well as window id, so that extension can recover the context information
					pUtilsWindow->m_pPlugin->SetFirefoxCookie(vParams, ulId);
				}
			}
		});
	}
}

BOOL CIEHostWindow::CreateControlSite(COleControlContainer* pContainer, 
	COleControlSite** ppSite, UINT nID, REFCLSID clsid)
{
	ASSERT(ppSite != NULL);
	if (ppSite == NULL)
	{
		return FALSE;
	}
	*ppSite = new CIEControlSite(pContainer, this);
	return TRUE;
}

void CIEHostWindow::DoDataExchange(CDataExchange* pDX)
{
	CDialog::DoDataExchange(pDX);
	DDX_Control(pDX, IDC_IE_CONTROL, m_ie);
}


BEGIN_MESSAGE_MAP(CIEHostWindow, CDialog)
	ON_WM_SIZE()
	ON_MESSAGE(WM_USER_MESSAGE, OnUserMessage)
	ON_WM_PARENTNOTIFY()
END_MESSAGE_MAP()


// CIEHostWindow message handlers

BOOL CIEHostWindow::OnInitDialog()
{
	CDialog::OnInitDialog();

	InitIE();

	// 保存CIEHostWindow对象指针，让BrowserHook::WindowMessageHook可以通过Window handle找到对应的CIEHostWindow对象
	::SetWindowLongPtr(GetSafeHwnd(), GWLP_USERDATA, reinterpret_cast<LONG_PTR>(this)); 

	return TRUE;  // return TRUE unless you set the focus to a control
}

void CIEHostWindow::InitIE()
{
	s_csIEWindowMap.Lock();
	s_IEWindowMap.Add(GetSafeHwnd(), this);
	s_csIEWindowMap.Unlock();

	m_ie.put_RegisterAsBrowser(TRUE);

	// 允许打开拖拽到浏览器窗口的文件。
	m_ie.put_RegisterAsDropTarget(TRUE);
}


void CIEHostWindow::UninitIE()
{
	/**
	*  屏蔽页面关闭时IE控件的脚本错误提示
	*  虽然在CIEControlSite::XOleCommandTarget::Exec已经屏蔽了IE控件脚本错误提示，
	*  但IE Ctrl关闭时，在某些站点(如map.baidu.com)仍会显示脚本错误提示; 这里用put_Silent
	*  强制关闭所有弹窗提示。
	*  注意：不能在页面加载时调用put_Silent，否则会同时屏蔽插件安装的提示。
	*/
	if (m_ie.GetSafeHwnd())
		m_ie.put_Silent(TRUE);

	s_csIEWindowMap.Lock();
	s_IEWindowMap.Remove(GetSafeHwnd());
	s_csIEWindowMap.Unlock();

	s_csUtilsIEWindowMap.Lock();
	s_UtilsIEWindowMap.Remove(GetSafeHwnd());
	s_csUtilsIEWindowMap.Unlock();

	if (m_bUtils)
	{
		AdBlockPlus::clearFilters();
#ifdef MATCHER_PERF
		AdBlockPlus::showPerfInfo();
#endif
		TRACE(L"Remaining windows: IEWindowMap: %d, UtilsIEWindowMap: %d, NewIEWindowMap: %d\n",
			s_IEWindowMap.GetSize(), s_UtilsIEWindowMap.GetSize(), s_NewIEWindowMap.GetSize());
	}
}

void CIEHostWindow::OnSize(UINT nType, int cx, int cy)
{
	CDialog::OnSize(nType, cx, cy);

	if (m_ie.GetSafeHwnd())
	{
		m_ie.MoveWindow(0, 0, cx, cy);
	}
}

LRESULT CIEHostWindow::OnUserMessage(WPARAM wParam, LPARAM lParam)
{
	switch(wParam)
	{
	case WPARAM_RUN_ASYNC_CALL:
		OnRunAsyncCall();
		break;
	case WPARAM_ABP_FILTER_LOADED:
		OnABPFilterLoaded();
		break;
	case WPARAM_ABP_LOAD_FAILURE:
		OnABPLoadFailure();
		break;
	default:
		TRACE(_T("Unexpected user message sent: %d\n"), (int)wParam);
		break;
	}
	return 0;
}

BEGIN_EVENTSINK_MAP(CIEHostWindow, CDialog)
	ON_EVENT(CIEHostWindow, IDC_IE_CONTROL, DISPID_COMMANDSTATECHANGE, CIEHostWindow::OnCommandStateChange, VTS_I4 VTS_BOOL)
	ON_EVENT(CIEHostWindow, IDC_IE_CONTROL, DISPID_STATUSTEXTCHANGE  , CIEHostWindow::OnStatusTextChange, VTS_BSTR)
	ON_EVENT(CIEHostWindow, IDC_IE_CONTROL, DISPID_TITLECHANGE       , CIEHostWindow::OnTitleChange, VTS_BSTR)
	ON_EVENT(CIEHostWindow, IDC_IE_CONTROL, DISPID_PROGRESSCHANGE    , CIEHostWindow::OnProgressChange, VTS_I4 VTS_I4)
	ON_EVENT(CIEHostWindow, IDC_IE_CONTROL, DISPID_BEFORENAVIGATE2   , CIEHostWindow::OnBeforeNavigate2, VTS_DISPATCH VTS_PVARIANT VTS_PVARIANT VTS_PVARIANT VTS_PVARIANT VTS_PVARIANT VTS_PBOOL)
	ON_EVENT(CIEHostWindow, IDC_IE_CONTROL, DISPID_DOCUMENTCOMPLETE  , CIEHostWindow::OnDocumentComplete, VTS_DISPATCH VTS_PVARIANT)
	ON_EVENT(CIEHostWindow, IDC_IE_CONTROL, DISPID_NEWWINDOW3        , CIEHostWindow::OnNewWindow3Ie, VTS_PDISPATCH VTS_PBOOL VTS_UI4 VTS_BSTR VTS_BSTR)
	ON_EVENT(CIEHostWindow, IDC_IE_CONTROL, DISPID_SETSECURELOCKICON , CIEHostWindow::OnSetSecureLockIcon, VTS_I4)
	ON_EVENT(CIEHostWindow, IDC_IE_CONTROL, DISPID_DOWNLOADBEGIN     , CIEHostWindow::OnDownloadBegin, VTS_NONE)
	ON_EVENT(CIEHostWindow, IDC_IE_CONTROL, DISPID_DOWNLOADCOMPLETE  , CIEHostWindow::OnDownloadComplete, VTS_NONE)
END_EVENTSINK_MAP()


void CIEHostWindow::OnCommandStateChange(long Command, BOOL Enable)
{
	switch (Command)
	{
	case CSC_NAVIGATEBACK:
		m_bCanBack =  Enable;
		break;
	case CSC_NAVIGATEFORWARD:
		m_bCanForward = Enable;
		break;
	}
}

// Pack some data into a SAFEARRAY of BYTEs
HRESULT FillSafeArray(_variant_t &vDest, LPCSTR szSrc)
{
	HRESULT hr;
	LPSAFEARRAY psa;
	ULONG cElems = (ULONG)strlen(szSrc);
	LPSTR pPostData;

	psa = SafeArrayCreateVector(VT_UI1, 0, cElems);
	if (!psa)
	{
		return E_OUTOFMEMORY;
	}

	hr = SafeArrayAccessData(psa, (LPVOID*)&pPostData);
	memcpy(pPostData, szSrc, cElems);
	hr = SafeArrayUnaccessData(psa);

	vDest.vt = VT_ARRAY | VT_UI1;
	vDest.parray = psa;
	return NOERROR;
}

void CIEHostWindow::Navigate(const CString& strURL, const CString& strPost, const CString& strHeaders)
{
	m_csNavigateParams.Lock();
	if (m_pNavigateParams == NULL)
	{
		m_pNavigateParams = new NavigateParams();
	}
	if (m_pNavigateParams == NULL)
	{
		m_csNavigateParams.Unlock();
		return;
	}

	m_pNavigateParams->strURL = strURL;
	m_pNavigateParams->strPost = strPost;
	m_pNavigateParams->strHeaders = strHeaders;
	m_csNavigateParams.Unlock();

	OnNavigate();
}

void CIEHostWindow::Refresh()
{
	RunAsync([=] { OnRefresh(); });
}

void CIEHostWindow::Stop()
{
	RunAsync([=] { OnStop(); });
}

void CIEHostWindow::Back()
{
	RunAsync([=] { OnBack(); });
}

void CIEHostWindow::Forward()
{
	RunAsync([=] { OnForward(); });
}

void CIEHostWindow::Focus()
{
	if (m_ie.GetSafeHwnd())
	{
		m_ie.SetFocus();
	}
}

void CIEHostWindow::Copy()
{
	ExecOleCmd(OLECMDID_COPY);
}

void CIEHostWindow::Cut()
{
	ExecOleCmd(OLECMDID_CUT);
}

void CIEHostWindow::Paste()
{
	ExecOleCmd(OLECMDID_PASTE);
}

void CIEHostWindow::SelectAll()
{
	ExecOleCmd(OLECMDID_SELECTALL);
}

void CIEHostWindow::Undo()
{
	ExecOleCmd(OLECMDID_UNDO);
}

void CIEHostWindow::Redo()
{
	ExecOleCmd(OLECMDID_REDO);
}

void CIEHostWindow::Find()
{
	ExecOleCmd(OLECMDID_FIND);
}

// 我们要把消息发送到 MozillaContentWindow 的子窗口，但是这个窗口结构比较复杂，Firefox/SeaMonkey各不相同，
// Firefox 如果开启了 OOPP 也会增加一级，所以这里专门写一个查找的函数
HWND GetMozillaContentWindow(HWND hwndIECtrl)
{
	//这里来个土办法，用一个循环往上找，直到找到 MozillaContentWindow 为止
	HWND hwnd = ::GetParent(hwndIECtrl);
	for ( int i = 0; i < 5; i++ )
	{
		hwnd = ::GetParent( hwnd );
		TCHAR szClassName[MAX_PATH];
		if ( GetClassName(::GetParent(hwnd), szClassName, ARRAYSIZE(szClassName)) > 0 )
		{
			if ( _tcscmp(szClassName, _T("MozillaContentWindowClass")) == 0 )
			{
				return hwnd;
			}
		}
	}

	return NULL;
}

// Firefox 4.0 开始采用了新的窗口结构
// 对于插件，是放在 GeckoPluginWindow 窗口里，往上有一个 MozillaWindowClass，再往上是顶层的
// MozillaWindowClass，我们的消息要发到顶层，所以再写一个查找的函数
HWND GetTopMozillaWindowClassWindow(HWND hwndIECtrl)
{
	HWND hwnd = ::GetParent(hwndIECtrl);
	for ( int i = 0; i < 5; i++ )
	{
		HWND hwndParent = ::GetParent( hwnd );
		if ( NULL == hwndParent ) break;
		hwnd = hwndParent;
	}

	TCHAR szClassName[MAX_PATH];
	if ( GetClassName(hwnd, szClassName, ARRAYSIZE(szClassName)) > 0 )
	{
		if ( _tcscmp(szClassName, _T("MozillaWindowClass")) == 0 )
		{
			return hwnd;
		}
	}

	return NULL;
}

void CIEHostWindow::HandOverFocus()
{
	HWND hwndMessageTarget = GetMozillaContentWindow(m_hWnd);
	if (!hwndMessageTarget)
	{
		hwndMessageTarget = GetTopMozillaWindowClassWindow(m_hWnd);
	}

	// Change the focus to the parent window of html document to kill its focus. 
	if (m_ie.GetSafeHwnd())
	{
		CComQIPtr<IDispatch> pDisp;
		pDisp.Attach(m_ie.get_Document());
		if(pDisp) 
		{
			CComQIPtr<IHTMLDocument2> htmlDoc = pDisp;
			if(htmlDoc) 
			{
				CComPtr<IHTMLWindow2> window;
				if(SUCCEEDED(htmlDoc->get_parentWindow(&window)) && window) 
				{
					window->focus();
				}
			}
		}
	}

	if ( hwndMessageTarget != NULL )
	{
		::SetFocus(hwndMessageTarget);
	}
}

void CIEHostWindow::Zoom(double level)
{
	if (level <= 0.01)
		return;

	int nZoomLevel = (int)(level * 100 + 0.5);

	CComVariant vZoomLevel(nZoomLevel);

	// >= IE7
	try
	{
		if (m_ie.GetSafeHwnd())
		{
			m_ie.ExecWB(OLECMDID_OPTICAL_ZOOM, OLECMDEXECOPT_DONTPROMPTUSER, &vZoomLevel, NULL);
		}
		return;
	}
	catch (...)
	{
		TRACE(_T("CIEHostWindow::Zoom failed!\n"));
	}
}

void CIEHostWindow::DisplaySecurityInfo()
{
	RunAsync([=] { OnDisplaySecurityInfo(); });
}

void CIEHostWindow::SaveAs()
{
	RunAsyncOleCmd(OLECMDID_SAVEAS);
}

void CIEHostWindow::Print()
{
	RunAsyncOleCmd(OLECMDID_PRINT);
}

void CIEHostWindow::PrintPreview()
{
	RunAsyncOleCmd(OLECMDID_PRINTPREVIEW);
}

void CIEHostWindow::PrintSetup()
{
	RunAsyncOleCmd(OLECMDID_PAGESETUP);
}

void CIEHostWindow::ViewPageSource()
{
	if (m_ie.GetSafeHwnd())
	{
		CComQIPtr<IDispatch> pDisp;
		pDisp.Attach(m_ie.get_Document());
		if (!pDisp)
		{
			return;
		}
		CComQIPtr<IOleCommandTarget> pCmd = pDisp;
		if(pCmd)
		{
			CComVariant varinput = _T("");
			CComVariant varoutput;
			pCmd->Exec(&CGID_MSHTML, IDM_VIEWSOURCE, OLECMDEXECOPT_DODEFAULT, &varinput, &varoutput);
		}
	}
}

void CIEHostWindow::SendKey(WORD key)
{
	SendMessageToDescendants(WM_KEYDOWN, (WPARAM)key, 0x00000001);
	SendMessageToDescendants(WM_KEYUP, (WPARAM)key, 0xC0000001);
}

void CIEHostWindow::ScrollPage(bool up)
{
	SendKey(up ? VK_PRIOR : VK_NEXT);
}

void CIEHostWindow::ScrollLine(bool up)
{
	SendKey(up ? VK_UP : VK_DOWN);
}

void CIEHostWindow::ScrollWhole(bool up)
{
	SendKey(up ? VK_HOME : VK_END);
}

void CIEHostWindow::ScrollHorizontal(bool left)
{
	SendKey(left ? VK_LEFT : VK_RIGHT);
}

BOOL CALLBACK CIEHostWindow::GetInternetExplorerServerCallback(HWND hWnd, LPARAM lParam)
{
	CString strClassName;
	GetClassName(hWnd, strClassName.GetBuffer(MAX_PATH), MAX_PATH);
	strClassName.ReleaseBuffer(); 
	if (strClassName == _T("Internet Explorer_Server"))
	{
		*(HWND*)lParam = hWnd;
		return FALSE;
	}
	return TRUE;
}

HWND CIEHostWindow::GetInternetExplorerServer() const
{
	HWND parent = this->m_hWnd;
	HWND hWnd = NULL;
	EnumChildWindows(parent, GetInternetExplorerServerCallback, (LPARAM)&hWnd);
	return hWnd;
}

void CIEHostWindow::ScrollWheelLine(bool up)
{
	POINT ptCursorPos;
	GetCursorPos(&ptCursorPos);

	HWND hWnd = GetInternetExplorerServer();
	if (hWnd)
	{
		TRACE(_T("Found Internet Explorer_Server, scrolling...\n"));
		::SendMessage(hWnd, WM_MOUSEWHEEL,
			MAKEWPARAM(0, up ? WHEEL_DELTA : -WHEEL_DELTA), MAKELPARAM(ptCursorPos.x, ptCursorPos.y));
	}
	else
	{
		TRACE(_T("Internet Explorer_Server not found, scroll canceled.\n"));
	}
}

void CIEHostWindow::RemoveNewWindow(ULONG_PTR ulId)
{
	s_csNewIEWindowMap.Lock();
	CIEHostWindow* pIEHostWindow = s_NewIEWindowMap.Lookup(ulId);
	s_NewIEWindowMap.Remove(ulId);
	s_csNewIEWindowMap.Unlock();

	if (pIEHostWindow)
	{
		pIEHostWindow->DestroyWindow();
		delete pIEHostWindow;
	}
}

CString CIEHostWindow::GetURL()
{
	CString url;
	try
	{
		if (m_ie.GetSafeHwnd())
		{
			url = m_ie.get_LocationURL();
		}
	}
	catch(...)
	{
		TRACE(_T("CIEHostWindow::GetURL failed!\n"));
	}
	return url;
}

CString CIEHostWindow::GetTitle()
{
	if (m_strTitle.GetLength()) return m_strTitle;

	CString title;
	try
	{
		if (m_ie.GetSafeHwnd())
		{
			title = m_ie.get_LocationName();
		}
	}
	catch(...)
	{
		TRACE(_T("CIEHostWindow::GetTitle failed!\n"));
	}
	return title;
}

CString CIEHostWindow::GetFaviconURL()
{
	CString host, url, favurl;
	favurl = _T("");
	try
	{
		if (m_ie.GetSafeHwnd())
		{
			url = m_ie.get_LocationURL();
			// use page specified favicon, if exists
			// here we query favicon url directly from content before it is cached
			// and use the cached value thereafter
			CString contentFaviconURL;
			if (m_strFaviconURL == _T("NONE"))
				contentFaviconURL = GetFaviconURLFromContent();
			else
				contentFaviconURL = m_strFaviconURL;
			if (contentFaviconURL != _T(""))
			{
				return GetURLRelative(url, contentFaviconURL);
			}
			URLTokenizer tokens(url.GetString());
			if (tokens.getAuthority().length())
			{
				CString protocol = CString(tokens.protocol.c_str()).MakeLower();
				if (protocol != _T("http") && protocol != _T("https")) {
					// force http/https protocols -- others are not supported for purpose of fetching favicons
					protocol = _T("http");
					tokens.protocol = protocol.GetString();
				}
				favurl = tokens.getRelativeURL(_T("/favicon.ico")).c_str();
			}
		}
	}
	catch(...)
	{
		TRACE(_T("CIEHostWindow::GetFaviconURL failed!\n"));
	}

	return favurl;
}

BOOL CIEHostWindow::IsOleCmdEnabled(OLECMDID cmdID)
{
	try
	{
		if (m_ie.GetSafeHwnd())
		{
			long result = m_ie.QueryStatusWB(cmdID);
			return  (result & OLECMDF_ENABLED) != 0; 
		}
	}
	catch(...)
	{
		TRACE(_T("CIEHostWindow::IsOleCmdEnabled id=%d failed!\n"), cmdID);
	}
	return false;
}

void CIEHostWindow::ExecOleCmd(OLECMDID cmdID)
{
	try
	{
		if(m_ie.GetSafeHwnd() && 
			(m_ie.QueryStatusWB(cmdID) & OLECMDF_ENABLED))
		{
			m_ie.ExecWB(cmdID, 0, NULL, NULL);
		}
	}
	catch(...)
	{
		TRACE(_T("CIEHostWindow::ExecOleCmd id=%d failed!\n"), cmdID);
	}
}

void CIEHostWindow::RunAsyncOleCmd(OLECMDID cmdID)
{
	RunAsync([=] { ExecOleCmd(cmdID); });
}

/** @TODO 将strPost中的Content-Type和Content-Length信息移动到strHeaders中，而不是直接去除*/
void CIEHostWindow::OnNavigate()
{
	m_csNavigateParams.Lock();
	if (m_pNavigateParams == NULL)
	{
		m_csNavigateParams.Unlock();
		return;
	}

	CString strURL = m_pNavigateParams->strURL;
	CString strHeaders = m_pNavigateParams->strHeaders;
	CString strPost = m_pNavigateParams->strPost;
	SAFE_DELETE(m_pNavigateParams);
	m_csNavigateParams.Unlock();

	if (m_ie.GetSafeHwnd())
	{
		try
		{
			_variant_t vFlags(0l);
			_variant_t vTarget(_T(""));
			_variant_t vPost;
			_variant_t vHeader(strHeaders + _T("Cache-control: private\r\n")); 
			if (!strPost.IsEmpty()) 
			{
				// Header中应该添加上strPost中的Content-Type信息
				LPWSTR szContentType = NULL;
				size_t nCTLen;
				if (HTTP::ExtractFieldValue(strPost.GetString(), L"Content-Type:", &szContentType, &nCTLen))
				{
					vHeader = CString(vHeader) + _T("Content-Type: ") + szContentType + _T("\r\n");
					HTTP::FreeFieldValue(szContentType);
				}

				// 去除postContent-Type和Content-Length这样的header信息
				int pos = strPost.Find(_T("\r\n\r\n"));

				CString strTrimed = strPost.Right(strPost.GetLength() - pos - 4);
				int size = WideCharToMultiByte(CP_ACP, 0, strTrimed, -1, 0, 0, 0, 0);
				char* szPostData = new char[size + 1];
				WideCharToMultiByte(CP_ACP, 0, strTrimed, -1, szPostData, size, 0, 0);
				FillSafeArray(vPost, szPostData);
				delete [] szPostData;
			}
			m_ie.Navigate(strURL, &vFlags, &vTarget, &vPost, &vHeader);
		}
		catch(...)
		{
			TRACE(_T("CIEHostWindow::Navigate URL=%s failed!\n"), strURL);
		}
	}
}

void CIEHostWindow::OnRefresh()
{
	if (m_ie.GetSafeHwnd())
	{
		try
		{
			m_ie.Refresh();
		}
		catch(...)
		{
			TRACE(_T("CIEHostWindow::Refresh failed!\n"));
		}
	}
}

void CIEHostWindow::OnStop()
{
	if (m_ie.GetSafeHwnd())
	{
		try
		{
			m_ie.Stop();
		}
		catch(...)
		{
			TRACE(_T("CIEHostWindow::Stop failed!\n"));
		}
	}
}

void CIEHostWindow::OnBack()
{
	if (m_ie.GetSafeHwnd() && m_bCanBack)
	{
		try
		{
			m_ie.GoBack();
		}
		catch(...)
		{
			TRACE(_T("CIEHostWindow::Back failed!\n"));
		}
	}
}

void CIEHostWindow::OnForward()
{
	if (m_ie.GetSafeHwnd() && m_bCanForward)
	{
		try
		{
			m_ie.GoForward();
		}
		catch(...)
		{
			TRACE(_T("CIEHostWindow::Forward failed!\n"));
		}
	}
}

void CIEHostWindow::OnDisplaySecurityInfo()
{
	const DWORD SHDVID_SSLSTATUS = 33;

	if (m_ie.GetSafeHwnd())
	{
		CComQIPtr<IDispatch> pDisp;
		pDisp.Attach(m_ie.get_Document());
		if (!pDisp)
		{
			return;
		}
		CComQIPtr<IServiceProvider> pSP = pDisp;
		if (!pSP) return;

		CComQIPtr<IWebBrowser2> pWB2;
		if (FAILED(pSP->QueryService(IID_IWebBrowserApp, &pWB2)) || pWB2 == NULL)
			return;

		CComQIPtr<IOleCommandTarget> pCmd = pWB2;
		if(!pCmd) return;

		CComVariant varinput;
		varinput.vt = VT_EMPTY;
		CComVariant varoutput;
		pCmd->Exec(&CGID_ShellDocView, SHDVID_SSLSTATUS, 0, &varinput, &varoutput);
	}
}

void CIEHostWindow::OnABPFilterLoaded()
{
	if (m_pPlugin)
	{
		m_pPlugin->OnABPFilterLoaded(
			AdBlockPlus::getNumberOfActiveFilters(), AdBlockPlus::getLoadTicks());
	}
}

void CIEHostWindow::OnABPLoadFailure()
{
	if (m_pPlugin)
	{
		m_pPlugin->OnABPLoadFailure();
	}
}

void CIEHostWindow::OnTitleChanged(const CString& title)
{
	m_strTitle = title;

	if (m_pPlugin)
	{
		m_pPlugin->OnIETitleChanged(title);
	}
}

void CIEHostWindow::OnIEProgressChanged(INT32 iProgress)
{
	if (m_pPlugin)
	{
		CString strDetail;
		strDetail.Format(_T("%d"), iProgress);
		m_pPlugin->FireEvent(_T("IEProgressChanged"), strDetail);
	}
}

void CIEHostWindow::OnStatusChanged(const CString& message)
{
	if (m_strStatusText != message)
	{
		m_strStatusText = message;
		RunAsync([=]
		{
			if (m_pPlugin)
			{
				m_pPlugin->SetStatus(m_strStatusText);
			}
		});
	}
}

void CIEHostWindow::OnCloseIETab()
{
	if (m_pPlugin)
	{
		m_pPlugin->CloseIETab();
	}
}

void CIEHostWindow::OnStatusTextChange(LPCTSTR Text)
{
	OnStatusChanged(Text);
}

void CIEHostWindow::OnTitleChange(LPCTSTR Text)
{
	OnTitleChanged(Text);
}

void CIEHostWindow::OnProgressChange(long Progress, long ProgressMax)
{
	if (m_bUtils)
		return;

	if (Progress == -1) 
		Progress = ProgressMax;
	if (ProgressMax > 0) 
		m_iProgress = (100 * Progress) / ProgressMax; 
	else 
		m_iProgress = -1;
	OnIEProgressChanged(m_iProgress);
	// 按Firefox的设置缩放页面
	if (m_pPlugin)
	{
		double level = m_pPlugin->GetZoomLevel();
		if (fabs(level - 1.0) > 0.01) 
		{
			Zoom(level);
		}
	}
}

static inline BOOL UrlCanHandle(LPCTSTR szUrl)
{
	// 可能性1: 类似 C:\Documents and Settings\<username>\My Documents\Filename.mht 这样的文件名
	TCHAR c = _totupper(szUrl[0]);
	if ( (c >= _T('A')) && (c <= _T('Z')) && (szUrl[1]==_T(':')) && (szUrl[2]==_T('\\')) )
	{
		return TRUE;
	}

	// 可能性2: \\fileserver\folder 这样的 UNC 路径
	if ( PathIsUNC(szUrl) )
	{
		return TRUE;
	}

	// 可能性3: http://... https://... file://...
	URL_COMPONENTS uc;
	ZeroMemory( &uc, sizeof(uc) );
	uc.dwStructSize = sizeof(uc);
	if ( ! InternetCrackUrl( szUrl, 0, 0, &uc ) ) return FALSE;

	switch ( uc.nScheme )
	{
	case INTERNET_SCHEME_HTTP:
	case INTERNET_SCHEME_HTTPS:
	case INTERNET_SCHEME_FILE:
		return TRUE;
	default:
		{
			// 可能性4: about:blank
			return ( _tcsncmp(szUrl, _T("about:"), 6) == 0 );
		}
	}
}

void CIEHostWindow::SetLoadingURL(const CString& url)
{
	m_csLoadingUrl.Lock();
	bool bUrlChanged = (url != m_strLoadingUrl);
	m_strLoadingUrl = url;
	m_csLoadingUrl.Unlock();

	if (bUrlChanged)
		RunAsync([=] { OnURLChanged(url); });
}

void CIEHostWindow::SetMainPageDone()
{
	m_bMainPageDone = true;
}

CString CIEHostWindow::GetLoadingURL()
{
	m_csLoadingUrl.Lock();
	CString result = m_strLoadingUrl;
	m_csLoadingUrl.Unlock();
	return result;
}

void CIEHostWindow::OnURLChanged(const CString& url)
{
	// Fire navigate event so that the extension will have a chance to switch back
	// before the first "progress changed" event arrives
	if (m_pPlugin)
	{
		m_pPlugin->OnURLChanged(url);
	}
}

bool CIEHostWindow::IsTopLevelContainer(CComQIPtr<IWebBrowser2> spBrowser)
{
	if (spBrowser)
	{
		VARIANT_BOOL vbIsTopLevelContainer;
		if (SUCCEEDED(spBrowser->get_RegisterAsBrowser(&vbIsTopLevelContainer)))
		{
			return ( VARIANT_TRUE == vbIsTopLevelContainer );
		}
	}
	return false;
}

void CIEHostWindow::OnBeforeNavigate2(LPDISPATCH pDisp, VARIANT* URL, VARIANT* Flags, VARIANT* TargetFrameName, VARIANT* PostData, VARIANT* Headers, BOOL* Cancel)
{
	if (!URL) return;

	COLE2T szUrl(URL->bstrVal);

	// Zoom according to Firefox setting
	if (!m_bUtils && m_pPlugin)
	{
		double level = m_pPlugin->GetZoomLevel();
		if (fabs(level - 1.0) > 0.01) 
		{
			Zoom(level);
		}
	}

	// Filter non-http protocols
	if (!UrlCanHandle(szUrl)) return;

	// Ignore if it's in an iframe
	if (!IsTopLevelContainer(pDisp))
		return;

	// Reset refresh detection status
	m_bIsRefresh = false;
	m_nObjCounter = 0;
	m_bMainPageDone = false;

	// Set currently loading URL
	SetLoadingURL(CString(szUrl));
	// Clear cached title
	m_strTitle = _T("");
}

void CIEHostWindow::OnDocumentComplete(LPDISPATCH pDisp, VARIANT* URL)
{
	if (m_bUtils)
	{
		/**
		 * IE doesn't provide API to get the userAgent.
		 * We have to fetch it from the document it has loaded.
		 */
		if (!s_bUserAgentProccessed)
		{
			// For IE8 and lower, navigator.userAgent is the user-agent sent to servers
			CString strUserAgent = GetDocumentUserAgent();
			if (strUserAgent.GetLength())
			{
				ReceiveUserAgent(strUserAgent);
				if (OS::GetIEVersion() >= 9)
				{
					// For IE9 and higher, navigator.userAgent is defined by the document mode, thus we can't figure out
					// the "real" user agent this way.
					// Here we use a local loopback server to retrieve the "real" user-agent sent by IE engine
					HttpMonitor::UserAgentListener* uaListener = new HttpMonitor::UserAgentListener([] (MainThreadFunc func) {
						CIEHostWindow* pWindow = GetAnyUtilsWindow();
						if (pWindow)
						{
							pWindow->RunAsync(func);
						}
					}, 2013, 59794);
					uaListener->registerURLCallback([] (const CString& url) {
						CIEHostWindow* pWindow = GetAnyUtilsWindow();
						if (pWindow)
						{
							pWindow->Navigate(url, _T(""), _T(""));
						}
					});
					uaListener->registerUserAgentCallback([=] (const CString& userAgent) {
						CIEHostWindow* pWindow = GetAnyUtilsWindow();
						if (pWindow)
						{
							pWindow->ReceiveUserAgent(userAgent);
						}
						delete uaListener;
					});
				}
				s_bUserAgentProccessed = true;
			}
		}

		return;
	}

	m_iProgress = -1;
	OnIEProgressChanged(m_iProgress);

	if (IsTopLevelContainer(pDisp))
	{
		// Zoom according to Firefox setting
		if (m_pPlugin)
		{
			double level = m_pPlugin->GetZoomLevel();
			if (fabs(level - 1.0) > 0.01) 
			{
				Zoom(level);
			}
		}

		// Cache Favicon URL
		m_strFaviconURL = GetFaviconURLFromContent();

		// Setup refresh detection
		m_bIsRefresh = true;
		m_nObjCounter = 0;
		m_bMainPageDone = false;
	}

	/** Reset Find Bar state */
	if (m_bFBInProgress)
		FBResetFindRange();

	/** Set element hiding styles */
	ProcessElemHideStyles();

	if (m_pPlugin)
	{
		m_pPlugin->OnDocumentComplete();
	}
}

void CIEHostWindow::OnDownloadBegin()
{
	if (!m_bIsRefresh)
		return;

	m_nObjCounter++;
}

void CIEHostWindow::OnDownloadComplete()
{
	/**
	 * Refresh() detection code. Note that there are currently no reliable means to do this.
	 * Main trick is to detect DownloadComplete events after DocumentComplete is fired and 
	 * at least one request to the main page URL.
	 */
	if (!m_bIsRefresh)
		return;

	m_nObjCounter--;
	if (m_nObjCounter <= 0 && m_bMainPageDone)
	{
		TRACE(_T("[Refresh] OnDownloadComplete: ObjCounter = 0, MainPageDone = 1, Refresh detected!\n"));
		m_nObjCounter = 0;
		m_bMainPageDone = false;
		// Re-apply element hiding styles on refresh
		// However, since we check before adding the styles, the impact should not be severe.
		ProcessElemHideStyles();
		// Should reset find range, too
		if (m_bFBInProgress)
			FBResetFindRange();
	}
	else
	{
		TRACE(_T("[Refresh] OnDownloadComplete: ObjCounter = %d, MainPageDone = %d\n"), m_nObjCounter, m_bMainPageDone);
	}
}

void CIEHostWindow::ReceiveUserAgent(const CString& userAgent)
{
	if (userAgent.GetLength() && s_strIEUserAgent != userAgent && m_pPlugin)
	{
		s_strIEUserAgent = userAgent;
		m_pPlugin->OnIEUserAgentReceived(userAgent);
	}
}

const CString CIEHostWindow::s_strSecureLockInfos[] =
{
	_T("Unsecure"),
	_T("Mixed"),
	_T("SecureUnknownBits"),
	_T("Secure40Bit"),
	_T("Secure56Bit"),
	_T("SecureFortezza"),
	_T("Secure128Bit") 
};

void CIEHostWindow::OnSetSecureLockIcon(int state)
{
	//secureLockIconUnsecure = 0
	//secureLockIconMixed = 1
	//secureLockIconSecureUnknownBits = 2
	//secureLockIconSecure40Bit = 3
	//secureLockIconSecure56Bit = 4
	//secureLockIconSecureFortezza = 5
	//secureLockIconSecure128Bit = 6

	if ((unsigned int)state > 6) state = 0;
	CString description = s_strSecureLockInfos[state];

	this->m_strSecureLockInfo = description;
	if (m_pPlugin)
		m_pPlugin->OnSetSecureLockIcon(description);
}

CString CIEHostWindow::GetFaviconURLFromContent()
{

	CString favurl = _T("");
	if (!m_ie.GetSafeHwnd())
		return favurl;

	CComQIPtr<IDispatch> pDisp;
	pDisp.Attach(m_ie.get_Document());
	if (!pDisp)
	{
		return favurl;
	}
	CComQIPtr<IHTMLDocument2> pDoc = pDisp;
	if (!pDoc)
	{
		return favurl;
	}
	CComQIPtr<IHTMLElementCollection> elems;
	pDoc->get_all(&elems);
	if (!elems)
	{
		return favurl;
	}
	long length;
	if (FAILED(elems->get_length(&length)))
	{
		return favurl;
	}
	/** iterate over elements in the document */
	for (int i = 0; i < length; i++)
	{
		CComVariant index = i;
		CComQIPtr<IDispatch> pElemDisp;
		elems->item(index, index, &pElemDisp);
		if (!pElemDisp)
		{
			continue;
		}
		CComQIPtr<IHTMLElement> pElem = pElemDisp;
		if (!pElem)
		{
			continue;
		}

		CComBSTR bstrTagName;
		if (FAILED(pElem->get_tagName(&bstrTagName)))
		{
			continue;
		}

		CString strTagName = bstrTagName;
		strTagName.MakeLower();
		// to speed up, only parse elements before the body element
		if (strTagName == _T("body"))
		{
			break;
		}
		if (strTagName != _T("link"))
		{
			continue;
		}

		CComBSTR bstrAttributeName;

		CComVariant vRel;
		bstrAttributeName = _T("rel");
		if (FAILED(pElem->getAttribute(bstrAttributeName, 2, &vRel)))
		{
			continue;
		}
		CString rel(vRel);
		rel.MakeLower();
		if (rel == _T("shortcut icon") || rel == _T("icon"))
		{
			CComVariant vHref;
			bstrAttributeName = _T("href");
			if (SUCCEEDED(pElem->getAttribute(bstrAttributeName, 2, &vHref)))
			{
				favurl = vHref;
				break; // Assume only one favicon link
			}
		}
	}
	return favurl;
}

// 从IE控件的HTML文档中获取UserAgent
CString CIEHostWindow::GetDocumentUserAgent()
{
	CString strUserAgent(_T(""));
	if (!m_ie.GetSafeHwnd())
		return strUserAgent;

	CComQIPtr<IDispatch> pDisp;
	pDisp.Attach(m_ie.get_Document());
	CComQIPtr<IHTMLDocument2> pDoc = pDisp;
	if (!pDoc)
	{
		return strUserAgent;
	}
	CComQIPtr<IHTMLWindow2> pWindow;
	if (FAILED(pDoc->get_parentWindow(&pWindow)) || pWindow == NULL)
	{
		return strUserAgent;
	}
	CComQIPtr<IOmNavigator> pNavigator;
	if (FAILED(pWindow->get_clientInformation(&pNavigator)) || pNavigator == NULL) 
	{
		return strUserAgent;
	}
	CComBSTR bstrUserAgent;
	if (SUCCEEDED(pNavigator->get_userAgent(&bstrUserAgent))) 
	{
		strUserAgent = bstrUserAgent;
	}
	return strUserAgent;
}

// Obtain user-selected text
CString CIEHostWindow::GetSelectionText()
{
	CString strFail = _T("");
	if (!m_ie.GetSafeHwnd())
		return strFail;

	CComQIPtr<IDispatch> pDisp;
	pDisp.Attach(m_ie.get_Document());
	CComQIPtr<IHTMLDocument2> pDoc = pDisp;
	if (!pDoc) return strFail;

	return GetSelectionTextFromDoc(pDoc);
}

CString CIEHostWindow::GetSelectionTextFromDoc(const CComPtr<IHTMLDocument2>& pDoc)
{
	CString strFail = _T("");

	CComPtr<IHTMLSelectionObject> pSO;
	if (SUCCEEDED(pDoc->get_selection(&pSO)) && pSO)
	{
		CComPtr<IDispatch> pDisp2;
		if (SUCCEEDED(pSO->createRange(&pDisp2)) && pDisp2)
		{
			CComQIPtr<IHTMLTxtRange> pTxtRange = pDisp2;
			if (pTxtRange)
			{
				CComBSTR bstrSelectionText;
				if (SUCCEEDED(pTxtRange->get_text(&bstrSelectionText)))
				{
					CString text = CString(bstrSelectionText);
					if (text != strFail) return text;
				}
			}
		}
	}

	CComPtr<IHTMLFramesCollection2> pFrames;
	long length;
	if (SUCCEEDED(pDoc->get_frames(&pFrames)) && pFrames && SUCCEEDED(pFrames->get_length(&length)))
	{
		for (long i = 0; i < length; i++)
		{
			CComVariant varindex = i;
			CComVariant vDisp;
			if (SUCCEEDED(pFrames->item(&varindex, &vDisp)))
			{
				CComPtr<IDispatch> pDisp = vDisp.pdispVal;
				CComQIPtr<IHTMLWindow2> pWindow;
				CComPtr<IHTMLDocument2> pSubDoc;
				if ((pWindow = pDisp) && SUCCEEDED(pWindow->get_document(&pSubDoc)) && pSubDoc)
				{
					CString text = GetSelectionTextFromDoc(pSubDoc);
					if (text != strFail) return text;
				}
			}
		}
	}

	return strFail;
}

CString CIEHostWindow::GetSecureLockInfo()
{
	return m_strSecureLockInfo;
}

CString CIEHostWindow::GetStatusText()
{
	return m_strStatusText;
}

BOOL CIEHostWindow::ShouldShowStatusOurselves()
{
	if (m_pPlugin)
		return (BOOL)(m_pPlugin->ShouldShowStatusOurselves());
	return false;
}

BOOL CIEHostWindow::ShouldPreventStatusFlash()
{
	if (m_pPlugin)
		return (BOOL)(m_pPlugin->ShouldPreventStatusFlash());
	return false;
}

BOOL CIEHostWindow::DestroyWindow()
{
	UninitIE();

	return CDialog::DestroyWindow();
}

BOOL CIEHostWindow::Create(UINT nIDTemplate,CWnd* pParentWnd)
{
	return CDialog::Create(nIDTemplate, pParentWnd);
}

void CIEHostWindow::SetPlugin(Plugin::CPlugin* pPlugin)
{
	m_pPlugin = pPlugin;
}

/** 
*  这里之所有要使用NewWindow3而不使用NewWindow2，是因为NewWindow3提供了bstrUrlContext参数，
* 该参数用来设置新打开链接的referrer,一些网站通过检查referrer来防止盗链
*/
void CIEHostWindow::OnNewWindow3Ie(LPDISPATCH* ppDisp, BOOL* Cancel, unsigned long dwFlags, LPCTSTR bstrUrlContext, LPCTSTR bstrUrl)
{
	if (m_pPlugin)
	{
		s_csNewIEWindowMap.Lock();

		CIEHostWindow* pIEHostWindow = new CIEHostWindow();
		if (pIEHostWindow && pIEHostWindow->Create(CIEHostWindow::IDD))
		{
			ULONG_PTR ulId = reinterpret_cast<ULONG_PTR>(pIEHostWindow);
			s_NewIEWindowMap.Add(ulId, pIEHostWindow);
			*ppDisp = pIEHostWindow->m_ie.get_Application();

			bool bShift = 0 != (GetKeyState(VK_SHIFT) & 0x8000);
			bool bCtrl = (GetKeyState(VK_CONTROL) & 0x8000) || BrowserHook::WindowMessageHook::IsMiddleButtonClicked();
			if (dwFlags & NWMF_FORCEWINDOW)
			{
				// ignore current key states, always open in new window
				bShift = true;
				bCtrl = false;
			}
			else if (dwFlags & NWMF_FORCETAB)
			{
				bCtrl = true;
			}
			m_pPlugin->IENewTab(ulId, bstrUrl, bShift, bCtrl);
		}
		else
		{
			if (pIEHostWindow)
			{
				delete pIEHostWindow;
			}
			*Cancel = TRUE;
		}
		s_csNewIEWindowMap.Unlock();
	}
}

void CIEHostWindow::ProcessElemHideStyles()
{
	if (!AdBlockPlus::isEnabled()) return;

	// Don't apply elemhide styles for IE6 -- they break pages badly
	if (OS::GetIEVersion() <= 6)
		return;

	if (m_ie.GetSafeHwnd())
	{
		CComQIPtr<IDispatch> pDisp;
		pDisp.Attach(m_ie.get_Document());
		CComQIPtr<IHTMLDocument2> pDoc = pDisp;
		if (!pDoc) return;

		ProcessElemHideStylesForDoc(pDoc);
	}
}

void DumpInnerHTML(const CComPtr<IHTMLDocument2>& pDoc)
{
	// first retrieve the head node
	CComQIPtr<IHTMLDocument3> pDoc3 = pDoc;
	if (!pDoc3) return;

	CComPtr<IHTMLElementCollection> pcolHead;
	if (FAILED(pDoc3->getElementsByTagName(_T("head"), &pcolHead)) || !pcolHead)
		return;

	long length;
	if (FAILED(pcolHead->get_length(&length)) || length < 1)
		return; // no head = =|

	CComPtr<IDispatch> pDisp;
	CComVariant varindex = 0;
	if (FAILED(pcolHead->item(varindex, varindex, &pDisp)) || !pDisp)
		return;

	CComQIPtr<IHTMLElement> pHeadElement = pDisp;
	if (!pHeadElement) return;

	CComBSTR bstrInnerHTML;
	if (FAILED(pHeadElement->get_innerHTML(&bstrInnerHTML)) || !bstrInnerHTML)
		return;

	wstring html(bstrInnerHTML);
	html.c_str();
}

void CIEHostWindow::ProcessElemHideStylesForDoc(const CComPtr<IHTMLDocument2>& pDoc)
{
	if (!IfAlreadyHaveElemHideStyles(pDoc))
	{
		CComBSTR bstrURL;
		// while -- break, essentially a break-able 'if'
		while (SUCCEEDED(pDoc->get_URL(&bstrURL)) && bstrURL)
		{
			std::wstring strURL = CString(bstrURL).GetString();
			URLTokenizer tokensURL(strURL);

			std::wstring strProtocol = toLowerCase(tokensURL.protocol);
			// Do not handle protocols other than http/https
			if (strProtocol != L"http" && strProtocol != L"https") break;

			std::vector<std::wstring> vStyles;
			if (AdBlockPlus::getElemHideStyles(strURL, vStyles))
			{
				ApplyElemHideStylesForDoc(pDoc, vStyles);
				ApplyElemHideStylesForDoc(pDoc, AdBlockPlus::getGlobalElemHideStyles());
			}
			break;
		}
		//DumpInnerHTML(pDoc);
	}

	CComPtr<IHTMLFramesCollection2> pFrames;
	long length;
	if (SUCCEEDED(pDoc->get_frames(&pFrames)) && pFrames && SUCCEEDED(pFrames->get_length(&length)))
	{
		for (long i = 0; i < length; i++)
		{
			CComVariant varindex = i;
			CComVariant vDisp;
			if (SUCCEEDED(pFrames->item(&varindex, &vDisp)))
			{
				CComPtr<IDispatch> pDisp = vDisp.pdispVal;
				CComQIPtr<IHTMLWindow2> pWindow;
				CComPtr<IHTMLDocument2> pSubDoc;
				if ((pWindow = pDisp) && SUCCEEDED(pWindow->get_document(&pSubDoc)) && pSubDoc)
				{
					ProcessElemHideStylesForDoc(pSubDoc);
				}
			}
		}
	}
}

bool CIEHostWindow::IfAlreadyHaveElemHideStyles(const CComPtr<IHTMLDocument2>& pDoc)
{
	CComQIPtr<IHTMLDocument3> pDoc3 = pDoc;
	if (!pDoc3) return false;

	// IE6 can't use getElementsByClassName interface, have to iterate and filter
	CComPtr<IHTMLElementCollection> pcolStyles;
	if (FAILED(pDoc3->getElementsByTagName(_T("style"), &pcolStyles)) || !pcolStyles)
		return false;

	long length;
	if (FAILED(pcolStyles->get_length(&length)))
		return false;

	for (long i = 0; i < length; i++)
	{
		CComVariant varindex = i;
		CComPtr<IDispatch> pDisp;
		if (FAILED(pcolStyles->item(varindex, varindex, &pDisp)) || !pDisp)
			continue;

		CComQIPtr<IHTMLElement> pElem = pDisp;
		if (!pElem) continue;

		CComVariant varStrClassName;
		if (FAILED(pElem->getAttribute(_T("class"), 0, &varStrClassName)))
			continue;

		if (varStrClassName.vt != VT_BSTR || CComBSTR(varStrClassName.bstrVal) != s_strElemHideClass)
			continue;

		TRACE(_T("[ElemHide] Stylesheet already exists, will not add.\n"));
		return true;
	}
	return false;
}

void CIEHostWindow::ApplyElemHideStylesForDoc(const CComPtr<IHTMLDocument2>& pDoc, const vector<wstring>& vStyles)
{
	if (!vStyles.size()) return;

	// first retrieve the head node
	CComQIPtr<IHTMLDocument3> pDoc3 = pDoc;
	if (!pDoc3) return;

	CComPtr<IHTMLElementCollection> pcolHead;
	if (FAILED(pDoc3->getElementsByTagName(_T("head"), &pcolHead)) || !pcolHead)
		return;

	long length;
	if (FAILED(pcolHead->get_length(&length)) || length < 1)
		return; // no head = =|

	CComPtr<IDispatch> pDisp;
	CComVariant varindex = 0;
	if (FAILED(pcolHead->item(varindex, varindex, &pDisp)) || !pDisp)
		return;

	CComQIPtr<IHTMLDOMNode> pHeadNode = pDisp;
	if (!pHeadNode) return;

	// add our stylesheets
	for (size_t i = 0; i < vStyles.size(); i++)
	{
		const wstring& style = vStyles[i];

		CComPtr<IHTMLStyleSheet> pStyleSheet;
		if (FAILED(pDoc->createStyleSheet(_T(""), -1, &pStyleSheet)) || !pStyleSheet)
			continue;

		if (FAILED(pStyleSheet->put_cssText(CString(style.c_str()).AllocSysString())))
			continue;

		CComPtr<IHTMLElement> pElem;
		if (FAILED(pStyleSheet->get_owningElement(&pElem)) || !pElem)
			continue;

		CComVariant varStrType = _T("text/css");
		if (FAILED(pElem->setAttribute(_T("type"), varStrType)))
			continue;

		CComVariant varStrClass = s_strElemHideClass;
		if (FAILED(pElem->setAttribute(_T("class"), varStrClass)))
			continue;

		TRACE(_T("[ElemHide] Stylesheet added. Length: %d\n"), style.size());
	}
}

void CIEHostWindow::FBFindText(const CString& text)
{
	FBSetFindText(text);
	if (m_bFBInProgress)
	{
		if (!FBCheckDocument()) return;
		FBRestartFind();
	}
}

void CIEHostWindow::FBEndFindText()
{
	//FBCancelHighlight();
	FBResetFindStatus();
	m_bFBInProgress = false;
	m_vFBDocs.clear();
	m_lFBCurrentDoc = 0;
	m_strFBText = _T("");
}

void CIEHostWindow::FBSetFindText(const CString& text)
{
	if (m_strFBText == text) return;

	m_strFBText = text;

	if (!m_bFBInProgress)
	{
		m_bFBInProgress = text.GetLength() != 0;
		if (m_bFBInProgress)
		{
			FBResetFindRange();
		}
	}
	if (m_bFBInProgress && !FBCheckDocument()) return;
	if (m_bFBInProgress && m_bFBHighlight)
		FBHighlightAll();
	else FBCancelHighlight();
}

void CIEHostWindow::FBRestartFind()
{
	FBResetFindStatus();
	m_lFBLastFindLength = 0;
	FBFindAgainInternal(false);
}

void CIEHostWindow::FBResetFindStatus()
{
	m_bFBFound = false;
	m_bFBCrossHead = false;
	m_bFBCrossTail = false;
}

void CIEHostWindow::FBResetFindStatusGood()
{
	m_bFBFound = true;
	m_bFBCrossHead = false;
	m_bFBCrossTail = false;
}

bool CIEHostWindow::FBResetFindRange()
{
	if (!FBObtainFindRange())
	{
		FBEndFindText();
		return false;
	}

	m_bFBTxtRangeChanged = false;
	m_lFBLastFindLength = 0;
	FBResetFindStatusGood();

	return true;
}

CIEHostWindow::FBDocFindStatus& CIEHostWindow::FBGetCurrentDocStatus()
{
	return m_vFBDocs[m_lFBCurrentDoc];
}

bool CIEHostWindow::FBObtainFindRange()
{
	m_vFBDocs.clear();
	m_lFBCurrentDoc = 0;

	if (m_ie.GetSafeHwnd())
	{
		CComQIPtr<IDispatch> pDisp;
		pDisp.Attach(m_ie.get_Document());
		CComQIPtr<IHTMLDocument2> pDoc = pDisp;
		if (!pDoc) return false;

		FBObtainFindRangeRecursive(pDoc);
	}
	return m_vFBDocs.size() != 0;
}

void CIEHostWindow::FBObtainFindRangeRecursive(const CComPtr<IHTMLDocument2>& pDoc)
{
	CComPtr<IHTMLElement> pBodyElem;
	if (SUCCEEDED(pDoc->get_body(&pBodyElem)) && pBodyElem)
	{
		CComQIPtr<IHTMLBodyElement> pBody = pBodyElem;
		if (pBody)
		{
			CComPtr<IHTMLTxtRange> pTxtRange, pOrgRange;
			if (SUCCEEDED(pBody->createTextRange(&pTxtRange)) && pTxtRange
				&& SUCCEEDED(pTxtRange->duplicate(&pOrgRange)) && pOrgRange)
			{
				m_vFBDocs.push_back(FBDocFindStatus(pDoc, pTxtRange, pOrgRange));
			}
		}
	}

	CComPtr<IHTMLFramesCollection2> pFrames;
	long length;
	if (SUCCEEDED(pDoc->get_frames(&pFrames)) && pFrames && SUCCEEDED(pFrames->get_length(&length)))
	{
		for (long i = 0; i < length; i++)
		{
			CComVariant varindex = i;
			CComVariant vDisp;
			if (SUCCEEDED(pFrames->item(&varindex, &vDisp)))
			{
				CComPtr<IDispatch> pDisp = vDisp.pdispVal;
				CComQIPtr<IHTMLWindow2> pWindow;
				CComPtr<IHTMLDocument2> pSubDoc;
				if ((pWindow = pDisp) && SUCCEEDED(pWindow->get_document(&pSubDoc)) && pSubDoc)
				{
					FBObtainFindRangeRecursive(pSubDoc);
				}
			}
		}
	}
}

void CIEHostWindow::FBMatchDocSelection()
{

	CComQIPtr<IServiceProvider> pSP = FBGetCurrentDocStatus().doc;
	CComQIPtr<IMarkupContainer> pMC = FBGetCurrentDocStatus().doc;
	CComQIPtr<IMarkupServices> pMS = FBGetCurrentDocStatus().doc;
	if (pSP && pMC && pMS)
	{
		CComPtr<IMarkupPointer> pMPStart, pMPEnd;
		pMS->CreateMarkupPointer(&pMPStart);
		pMS->CreateMarkupPointer(&pMPEnd);
		CComPtr<IHTMLEditServices> pES;
		if (pMPStart && pMPEnd && SUCCEEDED(pSP->QueryService(SID_SHTMLEditServices, &pES)) && pES)
		{
			pMS->MovePointersToRange(FBGetCurrentDocStatus().txtRange, pMPStart, pMPEnd);
			pES->SelectRange(pMPStart, pMPEnd, SELECTION_TYPE_None);
		}
	}
}

bool CIEHostWindow::FBCheckDocument()
{
	for (long lCurrentDoc = 0; lCurrentDoc < static_cast<long>(m_vFBDocs.size()); lCurrentDoc++)
	{
		FBDocFindStatus& dfs = m_vFBDocs[lCurrentDoc];
		CComPtr<IHTMLTxtRange> pTmpTxtRange;
		if (dfs.txtRange == NULL || FAILED(dfs.txtRange->duplicate(&pTmpTxtRange)) || pTmpTxtRange == NULL)
		{
			TRACE("[FindBar] FBCheckDocument failed: cannot duplicate text range.\n");
			return FBResetFindRange();
		}
		CComPtr<IHTMLElement> pBodyElem;
		CComQIPtr<IHTMLBodyElement> pBody;
		if (FAILED(dfs.doc->get_body(&pBodyElem)) || pBodyElem == NULL || NULL == (pBody = pBodyElem))
		{
			TRACE("[FindBar] FBCheckDocument failed: cannot get body element.\n");
			return FBResetFindRange();
		}
		CComPtr<IHTMLTxtRange> pTxtRange;
		if (FAILED(pBody->createTextRange(&pTxtRange)) || pTxtRange == NULL)
		{
			TRACE("[FindBar] FBCheckDocument failed: cannot get body text range.\n");
			return FBResetFindRange();
		}
		if (!FBRangesEqual(pTxtRange, dfs.originalRange))
		{
			TRACE("[FindBar] FBCheckDocument failed: text range of the body changed.\n");
			return FBResetFindRange();
		}
	}
	return true;
}

void CIEHostWindow::FBFindAgain()
{
	if (!m_bFBInProgress) return;
	if (!FBCheckDocument()) return;
	FBResetFindStatus();
	FBFindAgainInternal(false);
}

void CIEHostWindow::FBFindAgainInternal(bool backwards, bool norecur, bool noselect)
{
	long tmp;
	FBDocFindStatus& dfs = FBGetCurrentDocStatus();

	CComQIPtr<IDisplayServices> pDS = dfs.doc;
	CComQIPtr<IMarkupServices> pMS = dfs.doc;
	if (!pDS || !pMS) return;

	if (m_strFBText.GetLength() == 0)
	{
		// should clear selection
		dfs.txtRange->collapse(backwards ? VARIANT_FALSE : VARIANT_TRUE);
		FBMatchDocSelection();
		return;
	}

	dfs.txtRange->setEndPoint(CComBSTR(backwards ? "StartToStart" : "EndToEnd"), dfs.originalRange);
	if (m_lFBLastFindLength)
	{
		if (backwards)
			dfs.txtRange->moveEnd(CComBSTR("character"), -1, &tmp);
		else
			dfs.txtRange->moveStart(CComBSTR("character"), 1, &tmp);
		m_lFBLastFindLength = 0;
	}

	CComBSTR bstr_Text = m_strFBText;
	VARIANT_BOOL bFound = VARIANT_FALSE;
	
	CComPtr<IHTMLTxtRange> pTmpTxtRange;
	dfs.txtRange->duplicate(&pTmpTxtRange);
	if (!pTmpTxtRange)
	{
		FBResetFindRange();
		return;
	}

	long length = m_strFBText.GetLength();

	while (dfs.txtRange->findText(bstr_Text, backwards ? -0x7FFFFFFF : 0x7FFFFFFF, (m_bFBCase ? 4 : 0), &bFound), bFound)
	{
		if (!FBCheckRangeVisible(dfs.txtRange) || !FBCheckRangeHighlightable(pDS, pMS, dfs.txtRange) || (!noselect && FAILED(dfs.txtRange->select())))
		{
			dfs.txtRange->setEndPoint(CComBSTR(backwards? "StartToStart" : "EndToEnd"), dfs.originalRange);
			if (backwards)
				dfs.txtRange->moveEnd(CComBSTR("character"), -1, &tmp);
			else
				dfs.txtRange->moveStart(CComBSTR("character"), 1, &tmp);
			continue;
		}

		m_bFBFound = true;

		m_lFBLastFindLength = length;
		m_bFBTxtRangeChanged = true;

		break;
	}
	if (!m_bFBFound)
	{
		dfs.txtRange = pTmpTxtRange;
		if (!norecur)
		{
			bool findSelfAgain = m_bFBTxtRangeChanged;
			m_bFBTxtRangeChanged = false;

			CComPtr<IHTMLTxtRange> pPrevTxtRange;
			dfs.txtRange->duplicate(&pPrevTxtRange);
			if (!pPrevTxtRange)
			{
				FBResetFindRange();
				return;
			}

			dfs.txtRange->setEndPoint(CComBSTR("StartToStart"), dfs.originalRange);
			dfs.txtRange->setEndPoint(CComBSTR("EndToEnd"), dfs.originalRange);

			long lOriginalIndex = m_lFBCurrentDoc;
			do 
			{
				if (backwards)
				{
					m_lFBCurrentDoc--; 
					if (m_lFBCurrentDoc < 0)
					{
						m_lFBCurrentDoc = static_cast<long>(m_vFBDocs.size()) - 1;
						m_bFBCrossHead = true;
					}
				} else
				{
					m_lFBCurrentDoc++;
					if (m_lFBCurrentDoc ==  static_cast<long>(m_vFBDocs.size()))
					{
						m_lFBCurrentDoc = 0;
						m_bFBCrossTail = true;
					}
				}
				if (m_lFBCurrentDoc != lOriginalIndex || findSelfAgain)
					FBFindAgainInternal(backwards, true, noselect);
			} while (!m_bFBFound && m_lFBCurrentDoc != lOriginalIndex);

			if (!m_bFBFound)
			{
				dfs.txtRange = pPrevTxtRange;
				m_bFBTxtRangeChanged = true;
			}
		}
		if (!m_bFBFound && m_bFBTxtRangeChanged)
		{
			dfs.txtRange->collapse(backwards ? VARIANT_FALSE : VARIANT_TRUE);
			FBMatchDocSelection();
		}
	}
}

void CIEHostWindow::FBFindPrevious()
{
	if (!m_bFBInProgress) return;
	if (!FBCheckDocument()) return;
	FBResetFindStatus();
	//FBFindAgainInternal(true);

	// workaround for IE backwards find bug
	// calls FindAgainInternal() repeatedly until range merges
	long lOriginalIndex, lLastIndex;
	CComPtr<IHTMLTxtRange> pOriginalRange, pLastRange;
	bool bLastCrossTail;

	// do a restart find in case last forwards find is successful
	m_lFBLastFindLength = 0;
	FBFindAgainInternal(false, false, true);
	if (m_bFBFound)
	{
		lOriginalIndex = m_lFBCurrentDoc;
		FBGetCurrentDocStatus().txtRange->duplicate(&pOriginalRange);
		if (!pOriginalRange)
		{
			FBResetFindRange();
			return;
		}

		// since backwards find always finds a correct match (although it might not be the closest one)
		// we start from there, and it might be potentially faster, avoiding many visibility tests
		long lLastFindLength = m_lFBLastFindLength;
		m_bFBFound = false;
		FBFindAgainInternal(true, false, true);
		if (m_bFBFound && (lOriginalIndex != m_lFBCurrentDoc || !FBRangesEqual(pOriginalRange, FBGetCurrentDocStatus().txtRange)))
		{
			if (!m_bFBCrossHead)
			{
				m_bFBCrossTail = true;
			}
			m_bFBCrossHead = false;
		} else
		{
			// not found, restore original range
			m_bFBCrossHead = false;
			m_lFBCurrentDoc = lOriginalIndex;
			FBGetCurrentDocStatus().txtRange = NULL;
			pOriginalRange->duplicate(&FBGetCurrentDocStatus().txtRange);
			if (!FBGetCurrentDocStatus().txtRange)
			{
				FBResetFindRange();
				return;
			}
			m_lFBLastFindLength = lLastFindLength;
		}
		do
		{
			lLastIndex = m_lFBCurrentDoc;
			pLastRange = NULL;
			FBGetCurrentDocStatus().txtRange->duplicate(&pLastRange);
			if (!pLastRange)
			{
				FBResetFindRange();
				return;
			}
			bLastCrossTail = m_bFBCrossTail;
			m_bFBFound = false;
			FBFindAgainInternal(false, false, true);
		} while (lOriginalIndex != m_lFBCurrentDoc || !FBRangesEqual(pOriginalRange, FBGetCurrentDocStatus().txtRange));
		// the result is pLastRange
		pLastRange->select();

		// setting the appropriate find status
		m_bFBCrossTail = false;
		if (!bLastCrossTail) // if not cross tail, then backwards find must cross head
			m_bFBCrossHead = true;

		// setting the appropriate find range
		if (lLastIndex == m_lFBCurrentDoc)
		{
			// same doc, just restore the txtRange
			FBGetCurrentDocStatus().txtRange = NULL;
			pLastRange->duplicate(&FBGetCurrentDocStatus().txtRange);
		} else
		{
			// different docs, restore current doc to maximum range
			FBGetCurrentDocStatus().txtRange = NULL;
			FBGetCurrentDocStatus().originalRange->duplicate(&FBGetCurrentDocStatus().txtRange);
			// restore last doc's find range
			m_vFBDocs[lLastIndex].txtRange = NULL;
			pLastRange->duplicate(&m_vFBDocs[lLastIndex].txtRange);
			// restore doc pointer
			m_lFBCurrentDoc = lLastIndex;
		}
	} else // not found
	{
		// setting the appropriate find status
		m_bFBCrossTail = false;
		m_bFBCrossHead = true;
		return;
	}
}

void CIEHostWindow::FBToggleHighlight(bool bHighlight)
{
	if (m_bFBHighlight == bHighlight) return;
	m_bFBHighlight = bHighlight;

	FBResetFindStatusGood();

	if (m_bFBInProgress && !FBCheckDocument()) return;
	if (m_bFBInProgress && bHighlight)
	{
		FBHighlightAll();
	}
	if (!bHighlight)
	{
		FBCancelHighlight();
	}
}

void CIEHostWindow::FBToggleCase(bool bCase)
{
	if (m_bFBCase == bCase) return;
	m_bFBCase = bCase;

	FBResetFindStatusGood();

	if (m_bFBInProgress)
	{
		if (!FBCheckDocument()) return;
		if (m_bFBHighlight)
			FBHighlightAll();
	}
}

void CIEHostWindow::FBHighlightAll()
{
	FBResetFindStatus();

	if (m_vFBHighlightSegments.size())
		FBCancelHighlight();

	if (m_strFBText.GetLength() == 0) return;

	long lOriginalIndex = m_lFBCurrentDoc;
	for (m_lFBCurrentDoc = 0; m_lFBCurrentDoc <  static_cast<long>(m_vFBDocs.size()); m_lFBCurrentDoc++)
	{
		FBDocFindStatus& dfs = FBGetCurrentDocStatus();
		long tmp;

		CComPtr<IHTMLTxtRange> pPrevTxtRange;
		dfs.txtRange->duplicate(&pPrevTxtRange);
		if (!pPrevTxtRange)
		{
			FBResetFindRange();
			return;
		}

		dfs.txtRange->setEndPoint(CComBSTR("StartToStart"), dfs.originalRange);
		dfs.txtRange->setEndPoint(CComBSTR("EndToEnd"), dfs.originalRange);

		CComQIPtr<IHighlightRenderingServices> pHRS = dfs.doc;
		CComQIPtr<IDisplayServices> pDS = dfs.doc;
		CComQIPtr<IMarkupServices> pMS = dfs.doc;
		CComQIPtr<IHTMLDocument4> pDoc4 = dfs.doc;
		if (pHRS && pDS && pMS && pDoc4)
		{
			CComBSTR bstr_Text = m_strFBText;
			VARIANT_BOOL bFound;
			long length = m_strFBText.GetLength();
			CComPtr<IHTMLRenderStyle> pRenderStyle;
			if (SUCCEEDED(pDoc4->createRenderStyle(NULL, &pRenderStyle)) && pRenderStyle)
			{
				pRenderStyle->put_defaultTextSelection(CComBSTR("false"));
				pRenderStyle->put_textBackgroundColor(CComVariant("fuchsia"));
				pRenderStyle->put_textColor(CComVariant("white"));

				while (dfs.txtRange->findText(bstr_Text, 0, (m_bFBCase ? 4 : 0), &bFound), bFound)
				{
					CComPtr<IDisplayPointer> pDStart, pDEnd;
					CComPtr<IMarkupPointer> pMStart, pMEnd;
					pDS->CreateDisplayPointer(&pDStart);
					pDS->CreateDisplayPointer(&pDEnd);
					pMS->CreateMarkupPointer(&pMStart);
					pMS->CreateMarkupPointer(&pMEnd);
					if (pDStart && pDEnd && pMStart && pMEnd)
					{
						if (SUCCEEDED(pMS->MovePointersToRange(dfs.txtRange, pMStart, pMEnd)))
						{
							HRESULT hr1 = pDStart->MoveToMarkupPointer(pMStart, NULL);
							HRESULT hr2 = pDEnd->MoveToMarkupPointer(pMEnd, NULL);
							if (SUCCEEDED(hr1) && SUCCEEDED(hr2))
							{
								CComPtr<IHighlightSegment> pHSegment;
								pHRS->AddSegment(pDStart, pDEnd, pRenderStyle, &pHSegment);
								if (pHSegment)
								{
									m_vFBHighlightSegments.push_back(std::make_pair(pHRS, pHSegment));
								}
							}
						}
					}
					dfs.txtRange->setEndPoint(CComBSTR("EndToEnd"), dfs.originalRange);
					dfs.txtRange->moveStart(CComBSTR("character"), 1, &tmp);
				}
			}
		}
		dfs.txtRange = pPrevTxtRange;
	}
	m_lFBCurrentDoc = lOriginalIndex;
	m_bFBFound = (m_vFBHighlightSegments.size() != 0);
}

void CIEHostWindow::FBCancelHighlight()
{
	if (!m_vFBHighlightSegments.size()) return;

	for (std::vector<std::pair<CComPtr<IHighlightRenderingServices>, CComPtr<IHighlightSegment> > >::iterator iter = m_vFBHighlightSegments.begin();
		iter != m_vFBHighlightSegments.end(); ++iter)
	{
		iter->first->RemoveSegment(iter->second);
	}

	m_vFBHighlightSegments.clear();
}

CString CIEHostWindow::FBGetLastFindStatus()
{
	if (m_bFBFound)
	{
		if (m_bFBCrossHead)
		{
			return _T("crosshead");
		}
		if (m_bFBCrossTail)
		{
			return _T("crosstail");
		}
		return _T("found");
	}
	return _T("notfound");
}

bool CIEHostWindow::FBCheckRangeVisible(const CComPtr<IHTMLTxtRange>& pRange)
{
	CComPtr<IHTMLElement> pElement;
	pRange->parentElement(&pElement);
	if(pElement)
	{
		while (true)
		{
			CComPtr<IHTMLElement> pParentElement = NULL;
			if (S_OK != pElement->get_parentElement(&pParentElement) || NULL == pParentElement)
				break;

			CComPtr<IHTMLCurrentStyle> pHtmlStyle = NULL;
			CComQIPtr<IHTMLElement2, &IID_IHTMLElement2> pIHtmlElement2(pElement);
			pIHtmlElement2->get_currentStyle(&pHtmlStyle);
			CComBSTR bszDisplay, bszVisible;
			if( pHtmlStyle != NULL )
			{
				pHtmlStyle->get_display(&bszDisplay);
				pHtmlStyle->get_visibility(&bszVisible);
			}

			if (0 == StrCmpI( _T("none") , bszDisplay) || 0 == StrCmpI(_T("hidden") , bszVisible) || 0 == StrCmpI(_T("collapse") , bszVisible))
			{
				return false;
			}

			pElement = pParentElement;
		}
	}
	return true;
}

bool CIEHostWindow::FBCheckRangeHighlightable(const CComPtr<IDisplayServices>& pDS, const CComPtr<IMarkupServices>& pMS, const CComPtr<IHTMLTxtRange>& pRange)
{
	CComPtr<IDisplayPointer> pDStart, pDEnd;
	CComPtr<IMarkupPointer> pMStart, pMEnd;
	pDS->CreateDisplayPointer(&pDStart);
	pDS->CreateDisplayPointer(&pDEnd);
	pMS->CreateMarkupPointer(&pMStart);
	pMS->CreateMarkupPointer(&pMEnd);
	if (pDStart && pDEnd && pMStart && pMEnd)
	{
		if (SUCCEEDED(pMS->MovePointersToRange(pRange, pMStart, pMEnd)))
		{
			HRESULT hr1 = pDStart->MoveToMarkupPointer(pMStart, NULL);
			HRESULT hr2 = pDEnd->MoveToMarkupPointer(pMEnd, NULL);
			if (SUCCEEDED(hr1) && SUCCEEDED(hr2))
			{
				return true;
			}
		}
	}
	return false;
}

bool CIEHostWindow::FBRangesEqual(const CComPtr<IHTMLTxtRange>& pRange1, const CComPtr<IHTMLTxtRange>& pRange2)
{
	long lret;
	HRESULT hr;
	hr = pRange1->compareEndPoints(CComBSTR("StartToStart"), pRange2, &lret);
	if (SUCCEEDED(hr))
	{
		if (lret) return false;
		hr = pRange1->compareEndPoints(CComBSTR("EndToEnd"), pRange2, &lret);
		if (SUCCEEDED(hr))
		{
			return lret == 0;
		}
	}
	// the comparison magically fails = =||
	return false;
}

void CIEHostWindow::OnRunAsyncCall()
{
	m_csFuncs.Lock();
	if (!m_qFuncs.empty())
	{
		// Calling the function may pop up modal dialogs, which may interfere
		//   with the execution flow, causing subsequent async calls to run
		//   the wrong function instead.
		// Should fetch the function first, then pop_front, and finally call the
		//   function.
		MainThreadFunc func = std::move(m_qFuncs.front());
		m_qFuncs.pop_front();
		m_csFuncs.Unlock();

		func();
	}
	else
	{
		m_csFuncs.Unlock();
	}
}
