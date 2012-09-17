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
#include <mshtml.h>
#include <exdispid.h>
#include <comutil.h>
#include "IEControlSite.h"
#include "PluginApp.h"
#include "HttpMonitorApp.h"
#include "IEHostWindow.h"
#include "plugin.h"

using namespace UserMessage;

// Initilizes the static member variables of CIEHostWindow

CSimpleMap<HWND, CIEHostWindow *> CIEHostWindow::s_IEWindowMap;
CCriticalSection CIEHostWindow::s_csIEWindowMap; 
CSimpleMap<DWORD, CIEHostWindow *> CIEHostWindow::s_NewIEWindowMap;
CCriticalSection CIEHostWindow::s_csNewIEWindowMap;
CSimpleMap<HWND, CIEHostWindow *> CIEHostWindow::s_UtilsIEWindowMap;
CCriticalSection CIEHostWindow::s_csUtilsIEWindowMap;
CString CIEHostWindow::s_strIEUserAgent = _T("");

// CIEHostWindow dialog

IMPLEMENT_DYNAMIC(CIEHostWindow, CDialog)

typedef PassthroughAPP::CMetaFactory<PassthroughAPP::CComClassFactoryProtocol, HttpMonitor::HttpMonitorAPP> MetaFactory;

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
{
	FBResetFindStatus();
}

CIEHostWindow::~CIEHostWindow()
{
	SAFE_DELETE(m_pNavigateParams);
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
	CIEHostWindow* pInstance = reinterpret_cast<CIEHostWindow* >(::GetWindowLongPtrA(hwnd, GWLP_USERDATA));
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
		CIEHostWindow* pInstance = reinterpret_cast<CIEHostWindow* >(::GetWindowLongPtrA(hwnd, GWLP_USERDATA));
		return pInstance;
	}
	return NULL;
}

CIEHostWindow* CIEHostWindow::CreateNewIEHostWindow(CWnd* pParentWnd, DWORD dwId, bool isUtils)
{
	CIEHostWindow *pIEHostWindow = NULL;

	if (dwId != 0)
	{
		// The CIEHostWindow has been created that we needn't recreate it.
		s_csNewIEWindowMap.Lock();
		pIEHostWindow = CIEHostWindow::s_NewIEWindowMap.Lookup(dwId);
		if (pIEHostWindow)
		{
			pIEHostWindow->m_bUtils = isUtils;
			CIEHostWindow::s_NewIEWindowMap.Remove(dwId);
		}
		s_csNewIEWindowMap.Unlock();
	}
	else 
	{
		s_csNewIEWindowMap.Lock();
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
		s_csNewIEWindowMap.Unlock();
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
		pWindow = reinterpret_cast<CIEHostWindow* >(::GetWindowLongPtrA(hwnd, GWLP_USERDATA));
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

void CIEHostWindow::SetFirefoxCookie(CString strURL, CString strCookie)
{
	HWND hwnd = GetAnyUtilsHWND();
	if (hwnd)
	{
		SetFirefoxCookieParams params = {strURL, strCookie};
		::SendMessage(hwnd, WM_USER_MESSAGE, WPARAM_SET_FIREFOX_COOKIE, reinterpret_cast<LPARAM>(&params));
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
	::SetWindowLongPtr(GetSafeHwnd(), GWLP_USERDATA, reinterpret_cast<LONG>(this)); 

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

	CComPtr<IInternetSession> spSession;
	if (SUCCEEDED(CoInternetGetSession(0, &spSession, 0)) && spSession)
	{
		MetaFactory::CreateInstance(CLSID_HttpProtocol, &m_spCFHTTP);
		spSession->RegisterNameSpace(m_spCFHTTP, CLSID_NULL, L"http", 0, 0, 0);

		MetaFactory::CreateInstance(CLSID_HttpSProtocol, &m_spCFHTTPS);
		spSession->RegisterNameSpace(m_spCFHTTPS, CLSID_NULL, L"https", 0, 0, 0);
	}
}


void CIEHostWindow::UninitIE()
{
	CComPtr<IInternetSession> spSession;
	if (SUCCEEDED(CoInternetGetSession(0, &spSession, 0)) && spSession)
	{
		spSession->UnregisterNameSpace(m_spCFHTTP, L"http");
		m_spCFHTTP.Release();
		spSession->UnregisterNameSpace(m_spCFHTTPS, L"https");
		m_spCFHTTPS.Release();
	}

	/**
	*  屏蔽页面关闭时IE控件的脚本错误提示
	*  虽然在CIEControlSite::XOleCommandTarget::Exec已经屏蔽了IE控件脚本错误提示，
	*  但IE Ctrl关闭时，在某些站点(如map.baidu.com)仍会显示脚本错误提示; 这里用put_Silent
	*  强制关闭所有弹窗提示。
	*  注意：不能在页面加载时调用put_Silent，否则会同时屏蔽插件安装的提示。
	*/
	m_ie.put_Silent(TRUE);

	s_csIEWindowMap.Lock();
	s_IEWindowMap.Remove(GetSafeHwnd());
	s_csIEWindowMap.Unlock();

	s_csUtilsIEWindowMap.Lock();
	s_UtilsIEWindowMap.Remove(GetSafeHwnd());
	s_csUtilsIEWindowMap.Unlock();
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
	case WPARAM_SET_FIREFOX_COOKIE:
		{
			SetFirefoxCookieParams* pData = reinterpret_cast<SetFirefoxCookieParams*>(lParam);
			OnSetFirefoxCookie(pData->strURL, pData->strCookie);
		}
		break;
	case WPARAM_UTILS_PLUGIN_INIT:
		{
			OnUtilsPluginInit();
		}
		break;
	case WPARAM_CONTENT_PLUGIN_INIT:
		{
			OnContentPluginInit();
		}
		break;
	case WPARAM_NAVIGATE:
		{
			OnNavigate();
		}
		break;
	case WPARAM_REFRESH:
		{
			OnRefresh();
		}
		break;
	case WPARAM_STOP:
		{
			OnStop();
		}
		break;
	case WPARAM_BACK:
		{
			OnBack();
		}
		break;
	case WPARAM_FORWARD:
		{
			OnForward();
		}
		break;
	case WPARAM_EXEC_OLE_CMD:
		{
			OLECMDID id = (OLECMDID)lParam;
			ExecOleCmd(id);
		}
		break;
	case WPARAM_DISPLAY_SECURITY_INFO:
		{
			OnDisplaySecurityInfo();
		}
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

CString GetHostFromUrl(const CString& strUrl)
{
	CString strHost(strUrl);
	int pos = strUrl.Find(_T("://"));
	if (pos != -1)
	{
		strHost.Delete(0, pos+3);

	}
	pos = strHost.Find(_T("/"));
	if (pos != -1)
	{
		strHost = strHost.Left(pos);
	}
	return strHost;
}

CString GetProtocolFromUrl(const CString& strUrl)
{
	int pos = strUrl.Find(_T("://"));
	if (pos != -1)
	{
		return strUrl.Left(pos);
	}
	return _T("http"); // Assume http
}

CString GetPathFromUrl(const CString& strUrl)
{
	CString strPath(strUrl);
	int pos = strUrl.Find(_T("://"));
	if (pos != -1)
	{
		strPath.Delete(0, pos+3);

	}
	pos = strPath.Find(_T('/'));
	if (pos != -1)
	{
		strPath = strPath.Mid(pos);
		pos = strPath.Find(_T('?'));
		if (pos != -1)
		{
			strPath = strPath.Left(pos);
		}
		pos = strPath.ReverseFind(_T('/'));
		// pos can't be -1 here
		strPath = strPath.Left(pos + 1);
	}
	else
	{
		strPath = _T("/");
	}
	return strPath;
}

CString GetURLRelative(const CString& baseURL, const CString relativeURL)
{
	if (relativeURL.Find(_T("://")) != -1)
	{
		// complete url, return immediately
		// test url: https://addons.mozilla.org/zh-CN/firefox/
		return relativeURL;
	}

	CString protocol = GetProtocolFromUrl(baseURL);
	if (relativeURL.GetLength() >= 2 && relativeURL.Left(2) == _T("//"))
	{
		// same protocol semi-complete url, return immediately
		// test url: http://www.windowsazure.com/zh-cn/
		return protocol + _T(":") + relativeURL;
	}

	CString host = GetHostFromUrl(baseURL);
	if (relativeURL.GetLength() && relativeURL[0] == _T('/'))
	{
		// root url
		// test url: https://mail.qq.com/cgi-bin/loginpage?
		return protocol + _T("://") + host + relativeURL;
	}
	else
	{
		CString path = GetPathFromUrl(baseURL);
		// relative url
		// test url: http://www.update.microsoft.com/windowsupdate/v6/thanks.aspx?ln=zh-cn&&thankspage=5
		return protocol + _T("://") + host + path + relativeURL;
	}
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

	//PostMessage(WM_USER_MESSAGE, WPARAM_NAVIGATE, 0);
	OnNavigate();
}

void CIEHostWindow::Refresh()
{
	PostMessage(WM_USER_MESSAGE, WPARAM_REFRESH, 0);
}

void CIEHostWindow::Stop()
{
	PostMessage(WM_USER_MESSAGE, WPARAM_STOP, 0);
}

void CIEHostWindow::Back()
{
	PostMessage(WM_USER_MESSAGE, WPARAM_BACK, 0);
}

void CIEHostWindow::Forward()
{
	PostMessage(WM_USER_MESSAGE, WPARAM_FORWARD, 0);
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
	PostMessage(WM_USER_MESSAGE, WPARAM_DISPLAY_SECURITY_INFO);
}

void CIEHostWindow::SaveAs()
{
	PostOleCmd(OLECMDID_SAVEAS);
}

void CIEHostWindow::Print()
{
	PostOleCmd(OLECMDID_PRINT);
}

void CIEHostWindow::PrintPreview()
{
	PostOleCmd(OLECMDID_PRINTPREVIEW);
}

void CIEHostWindow::PrintSetup()
{
	PostOleCmd(OLECMDID_PAGESETUP);
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
			host = GetHostFromUrl(url);
			if (host != _T(""))
			{
				CString protocol = GetProtocolFromUrl(url);
				if (protocol.MakeLower() != _T("http") && protocol.MakeLower() != _T("https")) {
					// force http/https protocols -- others are not supported for purpose of fetching favicons
					protocol = _T("http");
				}
				favurl = protocol + _T("://") + host + _T("/favicon.ico");
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

void CIEHostWindow::PostOleCmd(OLECMDID cmdID)
{
	PostMessage(WM_USER_MESSAGE, WPARAM_EXEC_OLE_CMD, (LPARAM)cmdID);
}

void CIEHostWindow::OnSetFirefoxCookie(const CString& strURL, const CString& strCookie)
{
	if (m_pPlugin)
	{
		m_pPlugin->SetFirefoxCookie(strURL, strCookie);
	}
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
				// 去除postContent-Type和Content-Length这样的header信息
				int pos = strPost.Find(_T("\r\n\r\n"));

				CString strTrimed = strPost.Right(strPost.GetLength() - pos - 4);
				int size = WideCharToMultiByte(CP_ACP, 0, strTrimed, -1, 0, 0, 0, 0);
				char* szPostData = new char[size + 1];
				WideCharToMultiByte(CP_ACP, 0, strTrimed, -1, szPostData, size, 0, 0);
				FillSafeArray(vPost, szPostData);
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

void CIEHostWindow::OnUtilsPluginInit()
{
	if (m_pPlugin)
	{
		m_pPlugin->OnUtilsPluginInit();
	}
}

void CIEHostWindow::OnContentPluginInit()
{
	if (m_pPlugin)
	{
		m_pPlugin->OnContentPluginInit();
	}
}

void CIEHostWindow::OnTitleChanged(const CString& title)
{
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
	m_strStatusText = message;

	if (m_pPlugin)
	{
		m_pPlugin->SetStatus(message);
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


void CIEHostWindow::OnBeforeNavigate2(LPDISPATCH pDisp, VARIANT* URL, VARIANT* Flags, VARIANT* TargetFrameName, VARIANT* PostData, VARIANT* Headers, BOOL* Cancel)
{
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


void CIEHostWindow::OnDocumentComplete(LPDISPATCH pDisp, VARIANT* URL)
{
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

	/**
	* 由于IE控件没有提供直接获取UserAgent的接口，需要从IE控件加载的HTML
	* 文档中获取UserAgent。
	*/
	if (s_strIEUserAgent.IsEmpty() && m_bUtils)
	{
		s_strIEUserAgent = GetDocumentUserAgent();
		if (!s_strIEUserAgent.IsEmpty() && m_pPlugin)
		{
			m_pPlugin->OnIEUserAgentReceived(s_strIEUserAgent);
		}
	}

	/** 缓存 Favicon URL */
	m_strFaviconURL = GetFaviconURLFromContent();

	/** Reset Find Bar state */
	if (m_bFBInProgress)
		FBResetFindRange();

	if (m_pPlugin)
	{
		m_pPlugin->OnDocumentComplete();
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
			DWORD id = reinterpret_cast<DWORD>(pIEHostWindow);
			s_NewIEWindowMap.Add(id, pIEHostWindow);
			*ppDisp = pIEHostWindow->m_ie.get_Application();
			m_pPlugin->IENewTab(id, bstrUrl);
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
	if (SUCCEEDED(pDoc->get_frames(&pFrames)) && SUCCEEDED(pFrames->get_length(&length)))
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
				if ((pWindow = pDisp) && SUCCEEDED(pWindow->get_document(&pSubDoc)))
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

bool CIEHostWindow::FBCheckRangeHighlightable(const CComPtr<IDisplayServices> pDS, const CComPtr<IMarkupServices> pMS, const CComPtr<IHTMLTxtRange>& pRange)
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
