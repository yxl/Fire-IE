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
#include "IEHostWindow.h"
#include "plugin.h"

// CIEHostWindow类变量初始化

CSimpleMap<HWND, CIEHostWindow *> CIEHostWindow::s_IEWindowMap;
CCriticalSection CIEHostWindow::s_csIEWindowMap; 
CSimpleMap<DWORD, CIEHostWindow *> CIEHostWindow::s_NewIEWindowMap;
CCriticalSection CIEHostWindow::s_csNewIEWindowMap;
CSimpleMap<HWND, CIEHostWindow *> CIEHostWindow::s_CookieIEWindowMap;
CCriticalSection CIEHostWindow::s_csCookieIEWindowMap;
CString CIEHostWindow::s_strIEUserAgent = _T("");

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
	, m_pFBDoc(NULL)
	, m_pFBTxtRange(NULL)
{
	FBResetFindStatus();
}

CIEHostWindow::~CIEHostWindow()
{
}

/** 根据 CIEHostWindow 的 HWND 寻找对应的 CIEHostWindow 对象 */
CIEHostWindow* CIEHostWindow::GetInstance(HWND hwnd)
{
	CIEHostWindow *pInstance = NULL;
	s_csIEWindowMap.Lock();
	pInstance = s_IEWindowMap.Lookup(hwnd);
	s_csIEWindowMap.Unlock();
	return pInstance;
}

/** 根据Internet Explorer_Server找到对应的 CIEHostWindow 对象*/
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

CIEHostWindow* CIEHostWindow::CreateNewIEHostWindow(DWORD dwId)
{
	CIEHostWindow *pIEHostWindow = NULL;

	if (dwId != 0)
	{
		// 如果提供了ID参数，说明IEHostWindow窗口已创建，不需要再新建。
		s_csNewIEWindowMap.Lock();
		pIEHostWindow = CIEHostWindow::s_NewIEWindowMap.Lookup(dwId);
		if (pIEHostWindow)
		{
			CIEHostWindow::s_NewIEWindowMap.Remove(dwId);
		}
		s_csNewIEWindowMap.Unlock();
	}
	else 
	{
		s_csNewIEWindowMap.Lock();
		pIEHostWindow = new CIEHostWindow();
		if (pIEHostWindow == NULL || !pIEHostWindow->Create(CIEHostWindow::IDD))
		{
			if (pIEHostWindow)
			{
				delete pIEHostWindow;
			}
			pIEHostWindow = NULL;
		}
		s_csNewIEWindowMap.Unlock();
	}
	return pIEHostWindow;
}

void CIEHostWindow::AddCookieIEWindow(CIEHostWindow *pWnd)
{
	s_csCookieIEWindowMap.Lock();
	s_CookieIEWindowMap.Add(pWnd->GetSafeHwnd(), pWnd);
	s_csCookieIEWindowMap.Unlock();
}

void CIEHostWindow::SetFirefoxCookie(CString strURL, CString strCookie)
{
	using namespace UserMessage;
	HWND hwnd = NULL;
	s_csCookieIEWindowMap.Lock();
	if (s_CookieIEWindowMap.GetSize() > 0)
	{
		hwnd = s_CookieIEWindowMap.GetValueAt(0)->GetSafeHwnd();
	}
	s_csCookieIEWindowMap.Unlock();
	if (hwnd)
	{
		LParamSetFirefoxCookie param = {strURL, strCookie};
		::SendMessage(hwnd, WM_USER_MESSAGE, WPARAM_SET_FIREFOX_COOKIE, reinterpret_cast<LPARAM>(&param));
	}
}

CString CIEHostWindow::GetFirefoxUserAgent()
{
	CString strUserAgent;
	CIEHostWindow *pIEHostWindow = NULL;
	s_csCookieIEWindowMap.Lock();
	if (s_CookieIEWindowMap.GetSize() > 0)
	{
		pIEHostWindow = s_CookieIEWindowMap.GetValueAt(0);
	}

	if (pIEHostWindow && pIEHostWindow->m_pPlugin)
	{
		strUserAgent = pIEHostWindow->m_pPlugin->GetFirefoxUserAgent();
	}
	s_csCookieIEWindowMap.Unlock();
	return strUserAgent;
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
	ON_MESSAGE(UserMessage::WM_USER_MESSAGE, OnUserMessage)
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
	m_ie.put_Silent(TRUE);

	s_csIEWindowMap.Lock();
	s_IEWindowMap.Remove(GetSafeHwnd());
	s_csIEWindowMap.Unlock();

	s_csCookieIEWindowMap.Lock();
	s_CookieIEWindowMap.Remove(GetSafeHwnd());
	s_csCookieIEWindowMap.Unlock();
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
	using namespace UserMessage;
	switch(wParam)
	{
	case WPARAM_SET_FIREFOX_COOKIE:
		{
			LParamSetFirefoxCookie* pData = reinterpret_cast<LParamSetFirefoxCookie*>(lParam);
			OnSetFirefoxCookie(pData->strURL, pData->strCookie);
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

CString GetHostName(const CString& strHeaders)
{
	const CString HOST_HEADER(_T("Host:"));
	int start = strHeaders.Find(HOST_HEADER);
	if (start != -1) 
	{
		start += HOST_HEADER.GetLength();
		int stop = strHeaders.Find(_T("\r\n"), start);
		if (stop != -1)
		{
			int count = stop - start + 1;
			CString strHost = strHeaders.Mid(start, count).Trim();
			return strHost;
		}
	}
	return _T("");
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

void FetchCookie(const CString& strUrl, const CString& strHeaders)
{
	const CString COOKIE_HEADER(_T("Cookie:"));
	int start = strHeaders.Find(COOKIE_HEADER);
	if (start != -1) 
	{
		start += COOKIE_HEADER.GetLength();
		int stop = strHeaders.Find(_T("\r\n"), start);
		if (stop != -1)
		{
			int count = stop - start + 1;
			CString strCookie = strHeaders.Mid(start, count);
			CString strHost = GetHostName(strHeaders);
			if (strHost.IsEmpty()) 
			{
				strHost = GetHostFromUrl(strUrl);
			}
			InternetSetCookie(strHost, NULL, strCookie + _T(";Sat,01-Jan-2020 00:00:00 GMT"));
		}
	} 
}

void CIEHostWindow::Navigate(const CString& strURL)
{
	m_strLoadingUrl = strURL;
	if (m_ie.GetSafeHwnd())
	{
		try
		{
			m_ie.Navigate(strURL, NULL, NULL, NULL, NULL);
		}
		catch(...)
		{
			TRACE(_T("CIEHostWindow::Navigate URL=%s failed!\n"), strURL);
		}
	}
}

void CIEHostWindow::Refresh()
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

void CIEHostWindow::Stop()
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

void CIEHostWindow::Back()
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

void CIEHostWindow::Forward()
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
		m_ie.ExecWB(OLECMDID_OPTICAL_ZOOM, OLECMDEXECOPT_DONTPROMPTUSER, &vZoomLevel, NULL);
		return;
	}
	catch (...)
	{
		TRACE(_T("CIEHostWindow::Zoom failed!\n"));
	}

	// IE6
	try
	{
		// IE6 只支持文字缩放, 最小为0, 最大为4, 默认为2
		int nLegecyZoomLevel = (int)((level - 0.8) * 10 + 0.5);
		nLegecyZoomLevel = max(nLegecyZoomLevel, 0);
		nLegecyZoomLevel = min(nLegecyZoomLevel, 4);

		vZoomLevel.intVal = nLegecyZoomLevel;
		m_ie.ExecWB(OLECMDID_ZOOM, OLECMDEXECOPT_DONTPROMPTUSER, &vZoomLevel, NULL );
	}
	catch(...)
	{
		TRACE(_T("CIEHostWindow::Zoom failed!\n"));
	}
}

void CIEHostWindow::DisplaySecurityInfo()
{

}

void CIEHostWindow::SaveAs()
{
	ExecOleCmd(OLECMDID_SAVEAS);
}

void CIEHostWindow::Print()
{
	ExecOleCmd(OLECMDID_PRINT);
}

void CIEHostWindow::PrintPreview()
{
	ExecOleCmd(OLECMDID_PRINTPREVIEW);
}

void CIEHostWindow::PrintSetup()
{
	ExecOleCmd(OLECMDID_PAGESETUP);
}

void CIEHostWindow::ViewPageSource()
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
		TRACE(_T("CIEHostWindow::GetURL failed!\n"));
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

void CIEHostWindow::OnSetFirefoxCookie(const CString& strURL, const CString& strCookie)
{
	if (m_pPlugin)
	{
		m_pPlugin->SetFirefoxCookie(strURL, strCookie);
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
}


void CIEHostWindow::OnBeforeNavigate2(LPDISPATCH pDisp, VARIANT* URL, VARIANT* Flags, VARIANT* TargetFrameName, VARIANT* PostData, VARIANT* Headers, BOOL* Cancel)
{
	COLE2T szURL(URL->bstrVal);
	m_strLoadingUrl = szURL;
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
	if (s_strIEUserAgent.IsEmpty())
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

CString CIEHostWindow::GetFaviconURLFromContent()
{
	CString favurl = _T("");
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

BOOL CIEHostWindow::DestroyWindow()
{
	UninitIE();

	return CDialog::DestroyWindow();
}

BOOL CIEHostWindow::Create(UINT nIDTemplate,CWnd* pParentWnd)
{
	return CDialog::Create(nIDTemplate,pParentWnd);
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
		FBRestartFind();
}

void CIEHostWindow::FBEndFindText()
{
	//FBCancelHighlight();
	FBResetFindStatus();
	m_bFBInProgress = false;
	m_pFBDoc = NULL;
	m_pFBTxtRange = NULL;
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
	if (m_bFBInProgress && m_bFBHighlight)
		FBHighlightAll();
	else FBCancelHighlight();
}

void CIEHostWindow::FBRestartFind()
{
	FBResetFindStatus();
	m_lFBLastFindLength = 0;
	FBFindAgainInternal();
}

void CIEHostWindow::FBResetFindStatus()
{
	m_bFBFound = false;
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
	FBResetFindStatus();

	return true;
}

bool CIEHostWindow::FBObtainFindRange()
{
	m_pFBTxtRange = NULL;
	m_pFBDoc = NULL;

	CComQIPtr<IDispatch> pDisp;
	pDisp.Attach(m_ie.get_Document());
	CComQIPtr<IHTMLDocument2> pDoc = pDisp;
	if (!pDoc) return false;

	CComPtr<IHTMLElement> pBodyElem;
	if (FAILED(pDoc->get_body(&pBodyElem)))
		return false;

	CComQIPtr<IHTMLBodyElement> pBody = pBodyElem;
	if (!pBody) return false;

	if (FAILED(pBody->createTextRange(&m_pFBTxtRange)))
		return false;

	m_pFBDoc = pDoc;
	return true;
}

void CIEHostWindow::FBMatchDocSelection()
{
	CComQIPtr<IServiceProvider> pSP = m_pFBDoc;
	CComQIPtr<IMarkupContainer> pMC = m_pFBDoc;
	CComQIPtr<IMarkupServices> pMS = m_pFBDoc;
	if (pSP && pMC && pMS)
	{
		CComPtr<IMarkupPointer> pMPStart, pMPEnd;
		pMS->CreateMarkupPointer(&pMPStart);
		pMS->CreateMarkupPointer(&pMPEnd);
		CComPtr<IHTMLEditServices> pES;
		if (pMPStart && pMPEnd && SUCCEEDED(pSP->QueryService(SID_SHTMLEditServices, &pES)))
		{
			pMS->MovePointersToRange(m_pFBTxtRange, pMPStart, pMPEnd);
			pES->SelectRange(pMPStart, pMPEnd, SELECTION_TYPE_None);
		}
	}
}

void CIEHostWindow::FBFindAgain()
{
	if (!m_bFBInProgress) return;
	FBResetFindStatus();
	FBFindAgainInternal();
}

void CIEHostWindow::FBFindAgainInternal()
{
	long tmp;
	if (m_lFBLastFindLength)
	{
		m_pFBTxtRange->moveStart(CComBSTR("character"), m_lFBLastFindLength, &tmp);
		m_lFBLastFindLength = 0;
	}
	m_pFBTxtRange->moveEnd(CComBSTR("textedit"), 1, &tmp);

	if (m_strFBText.GetLength() == 0)
	{
		// should clear selection
		m_pFBTxtRange->collapse(VARIANT_TRUE);
		FBMatchDocSelection();
		return;
	}

	CComBSTR bstr_Text = m_strFBText;
	VARIANT_BOOL bFound;
	if (m_pFBTxtRange->findText(bstr_Text, 0, (m_bFBCase ? 4 : 0), &bFound), bFound)
	{
		m_bFBFound = true;
		m_pFBTxtRange->select();

		m_lFBLastFindLength = m_strFBText.GetLength();
		m_bFBTxtRangeChanged = true;
	} else {
		if (m_bFBTxtRangeChanged)
		{
			m_bFBCrossTail = true;

			m_bFBTxtRangeChanged = false;
			CComPtr<IHTMLTxtRange> pPrevTxtRange;
			m_pFBTxtRange->duplicate(&pPrevTxtRange);
			m_pFBTxtRange->moveStart(CComBSTR("textedit"), -1, &tmp);
			m_pFBTxtRange->moveEnd(CComBSTR("textedit"), 1, &tmp);
			FBFindAgainInternal();
			if (!m_lFBLastFindLength)
			{
				m_pFBTxtRange = pPrevTxtRange;
				m_bFBTxtRangeChanged = true;
			}
		}
		if (!m_lFBLastFindLength && m_bFBTxtRangeChanged)
		{
			m_pFBTxtRange->collapse(VARIANT_TRUE);
			FBMatchDocSelection();
		}
	}
}

void CIEHostWindow::FBFindPrevious()
{
	if (!m_bFBInProgress) return;
	FBResetFindStatus();
	FBFindPreviousInternal();
}

void CIEHostWindow::FBFindPreviousInternal()
{
	long tmp;
	if (m_lFBLastFindLength)
	{
		m_pFBTxtRange->moveEnd(CComBSTR("character"), -m_lFBLastFindLength, &tmp);
		m_lFBLastFindLength = 0;
	}
	m_pFBTxtRange->moveStart(CComBSTR("textedit"), -1, &tmp);

	if (m_strFBText.GetLength() == 0)
	{
		// should clear selection
		m_pFBTxtRange->collapse(VARIANT_FALSE);
		FBMatchDocSelection();
		return;
	}

	CComBSTR bstr_Text = m_strFBText;
	VARIANT_BOOL bFound;
	if (m_pFBTxtRange->findText(bstr_Text, -0x7F000000, (m_bFBCase ? 4 : 0), &bFound), bFound)
	{
		m_bFBFound = true;
		m_pFBTxtRange->select();

		m_lFBLastFindLength = m_strFBText.GetLength();
		m_bFBTxtRangeChanged = true;
	} else {
		if (m_bFBTxtRangeChanged)
		{
			m_bFBCrossHead = true;

			m_bFBTxtRangeChanged = false;
			CComPtr<IHTMLTxtRange> pPrevTxtRange;
			m_pFBTxtRange->duplicate(&pPrevTxtRange);
			m_pFBTxtRange->moveStart(CComBSTR("textedit"), -1, &tmp);
			m_pFBTxtRange->moveEnd(CComBSTR("textedit"), 1, &tmp);
			FBFindPreviousInternal();
			if (!m_lFBLastFindLength)
			{
				m_pFBTxtRange = pPrevTxtRange;
				m_bFBTxtRangeChanged = true;
			}
		}
		if (!m_lFBLastFindLength)
		{
			m_pFBTxtRange->collapse(VARIANT_FALSE);
			FBMatchDocSelection();
		}
	}
}

void CIEHostWindow::FBToggleHighlight(bool bHighlight)
{
	if (m_bFBHighlight == bHighlight) return;
	m_bFBHighlight = bHighlight;

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

	if (m_bFBInProgress)
	{
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

	long tmp;

	CComPtr<IHTMLTxtRange> pPrevTxtRange;
	m_pFBTxtRange->duplicate(&pPrevTxtRange);
	m_pFBTxtRange->moveStart(CComBSTR("textedit"), -1, &tmp);
	m_pFBTxtRange->moveEnd(CComBSTR("textedit"), 1, &tmp);

	CComQIPtr<IHighlightRenderingServices> pHRS = m_pFBDoc;
	CComQIPtr<IDisplayServices> pDS = m_pFBDoc;
	CComQIPtr<IMarkupServices> pMS = m_pFBDoc;
	CComQIPtr<IHTMLDocument4> pDoc4 = m_pFBDoc;
	if (pHRS && pDS && pMS && pDoc4)
	{
		CComBSTR bstr_Text = m_strFBText;
		VARIANT_BOOL bFound;
		long length = m_strFBText.GetLength();
		CComPtr<IHTMLRenderStyle> pRenderStyle;
		if (SUCCEEDED(pDoc4->createRenderStyle(NULL, &pRenderStyle)))
		{
			pRenderStyle->put_defaultTextSelection(CComBSTR("false"));
			pRenderStyle->put_textBackgroundColor(CComVariant("fuchsia"));
			pRenderStyle->put_textColor(CComVariant("white"));

			while (m_pFBTxtRange->findText(bstr_Text, 0, (m_bFBCase ? 4 : 0), &bFound), bFound)
			{
				CComPtr<IDisplayPointer> pDStart, pDEnd;
				CComPtr<IMarkupPointer> pMStart, pMEnd;
				pDS->CreateDisplayPointer(&pDStart);
				pDS->CreateDisplayPointer(&pDEnd);
				pMS->CreateMarkupPointer(&pMStart);
				pMS->CreateMarkupPointer(&pMEnd);
				if (pDStart && pDEnd && pMStart && pMEnd)
				{
					if (SUCCEEDED(pMS->MovePointersToRange(m_pFBTxtRange, pMStart, pMEnd)))
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
				m_pFBTxtRange->moveStart(CComBSTR("character"), length, &tmp);
				m_pFBTxtRange->moveEnd(CComBSTR("textedit"), 1, &tmp);
			}
			m_bFBFound = (m_vFBHighlightSegments.size() != 0);
		}
	}
	m_pFBTxtRange = pPrevTxtRange;
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
