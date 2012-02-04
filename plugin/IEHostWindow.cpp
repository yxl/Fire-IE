// MainWindow.cpp : implementation file
//

#include "stdafx.h"
#include <mshtml.h>
#include <exdispid.h>
#include <comutil.h>
#include "IEControlSite.h"
#include "PluginApp.h"
#include "IEHostWindow.h"
#include "plugin.h"



CSimpleMap<HWND, CIEHostWindow *> CIEHostWindow::s_IEWindowMap;
CSimpleMap<DWORD, CIEHostWindow *> CIEHostWindow::s_NewIEWindowMap;
CCriticalSection CIEHostWindow::s_csIEWindowMap; 
CCriticalSection CIEHostWindow::s_csNewIEWindowMap; 

// CIEHostWindow dialog

IMPLEMENT_DYNAMIC(CIEHostWindow, CDialog)

CIEHostWindow::CIEHostWindow(Plugin::CPlugin* pPlugin /*=NULL*/, CWnd* pParent /*=NULL*/)
: CDialog(CIEHostWindow::IDD, pParent)
, m_pPlugin(pPlugin)
, m_bCanBack(FALSE)
, m_bCanForward(FALSE)
, m_iProgress(-1)
, SyncUserAgent(TRUE)
{

}

CIEHostWindow::~CIEHostWindow()
{
}

/** 根据 CIEHostWindow 的 HWND 寻找对应的 CIEHostWindow 对象 */
CIEHostWindow * CIEHostWindow::GetInstance(HWND hwnd)
{
	CIEHostWindow *pInstance = NULL;
	s_csIEWindowMap.Lock();
	pInstance = s_IEWindowMap.Lookup(hwnd);
	s_csIEWindowMap.Unlock();
	return pInstance;
}

/** 根据 URL 寻找对应的 CIEHostWindow 对象 */
CIEHostWindow * CIEHostWindow::GetInstance(const CString& URL)
{
	CIEHostWindow *pInstance = NULL;
	s_csIEWindowMap.Lock();
	for (int i=0; i<s_IEWindowMap.GetSize(); i++)
	{
		CIEHostWindow* p = s_IEWindowMap.GetValueAt(i);
		if (FuzzyUrlCompare( p->m_strLoadingUrl, URL))
		{
			pInstance = p;
			break;
		}
	}
	s_csIEWindowMap.Unlock();
	return pInstance;
}

BOOL CIEHostWindow::CreateControlSite(COleControlContainer* pContainer, 
									  COleControlSite** ppSite, UINT nID, REFCLSID clsid)
{
	ASSERT(ppSite != NULL);
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

	// TODO:  Add extra initialization here

	InitIE();

	return TRUE;  // return TRUE unless you set the focus to a control
	// EXCEPTION: OCX Property Pages should return FALSE
}

void CIEHostWindow::InitIE()
{
  SetProcessDEPPolicy(2);
	s_csIEWindowMap.Lock();
	s_IEWindowMap.Add(GetSafeHwnd(), this);
	s_csIEWindowMap.Unlock();

	// 启用IE控件的一些特性, 详细信息见MSDN的CoInternetSetFeatureEnabled Function
	INTERNETFEATURELIST features[] = {FEATURE_WEBOC_POPUPMANAGEMENT
		, FEATURE_WEBOC_POPUPMANAGEMENT		// 启用IE的弹出窗口管理
		, FEATURE_SECURITYBAND				// 下载和安装插件时提示
		, FEATURE_LOCALMACHINE_LOCKDOWN		// 使用IE的本地安全设置(Apply Local Machine Zone security settings to all local content.)
		, FEATURE_SAFE_BINDTOOBJECT			// ActiveX插件权限的设置, 具体功能不详，Coral IE Tab设置这个选项
		, FEATURE_TABBED_BROWSING			// 启用多标签浏览
	};			
	int n = sizeof(features) / sizeof(INTERNETFEATURELIST);
	for (int i=0; i<n; i++)
	{
		CoInternetSetFeatureEnabled(features[i], SET_FEATURE_ON_PROCESS, TRUE);
	}

	// 屏蔽脚本错误提示
	//m_ie.put_Silent(TRUE);
}


void CIEHostWindow::UninitIE()
{
	s_csIEWindowMap.Lock();
	s_IEWindowMap.Remove(GetSafeHwnd());
	s_csIEWindowMap.Unlock();
}


void CIEHostWindow::OnSize(UINT nType, int cx, int cy)
{
	CDialog::OnSize(nType, cx, cy);

	// TODO: Add your message handler code here
	if (m_ie.GetSafeHwnd())
	{
		m_ie.MoveWindow(0, 0, cx, cy);
	}
}

HRESULT CIEHostWindow::OnUserMessage(WPARAM wParam, LPARAM lParam)
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
	// TODO: Add your message handler code here
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
    UINT cElems = strlen(szSrc);
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

/** @TODO 将strPost中的Content-Type和Content-Length信息移动到strHeaders中，而不是直接去除*/
void CIEHostWindow::Navigate(const CString& strURL, const CString& strPost, const CString& strHeaders)
{
	m_strLoadingUrl = strURL;
	if (m_ie.GetSafeHwnd())
	{
		try
		{
      CString strHost = GetHostName(strHeaders);
      if (strHost.IsEmpty()) 
      {
        strHost = GetHostFromUrl(strURL);
      }

      FetchCookie(strURL, strHeaders);
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

void CIEHostWindow::Find()
{
	ExecOleCmd(OLECMDID_FIND);
}

// 我们要把消息发送到 MozillaContentWindow 的子窗口，但是这个窗口结构比较复杂，Firefox/SeaMonkey各不相同，
// Firefox 如果开启了 OOPP 也会增加一级，所以这里专门写一个查找的函数
HWND GetMozillaContentWindow(HWND hwndAtl)
{
	//这里来个土办法，用一个循环往上找，直到找到 MozillaContentWindow 为止
	HWND hwnd = ::GetParent(hwndAtl);
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
HWND GetTopMozillaWindowClassWindow(HWND hwndAtl)
{
	HWND hwnd = ::GetParent(hwndAtl);
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
    m_pPlugin->SetURLCookie(strURL, strCookie);
  }
}

void CIEHostWindow::OnTitleChanged(const CString& title)
{
  if (m_pPlugin)
  {
	  m_pPlugin->FireEvent(_T("TitleChanged"), title);
  }
}

void CIEHostWindow::OnProgressChanged(INT32 iProgress)
{
  if (m_pPlugin)
  {
	  CString strDetail;
	  strDetail.Format(_T("%d"), iProgress);
	  m_pPlugin->FireEvent(_T("ProgressChanged"), strDetail);
  }
}

void CIEHostWindow::OnStatusChanged(const CString& message)
{
  if (m_pPlugin)
  {
	  m_pPlugin->setStatus(message);
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
	// TODO: Add your message handler code here
	OnStatusChanged(Text);
}


void CIEHostWindow::OnTitleChange(LPCTSTR Text)
{
	// TODO: Add your message handler code here
	OnTitleChanged(Text);
}


void CIEHostWindow::OnProgressChange(long Progress, long ProgressMax)
{
	// TODO: Add your message handler code here
	if (Progress == -1) 
		Progress = ProgressMax;
	if (ProgressMax > 0) 
		m_iProgress = (100 * Progress) / ProgressMax; 
	else 
		m_iProgress = -1;
	OnProgressChanged(m_iProgress);
}


void CIEHostWindow::OnBeforeNavigate2(LPDISPATCH pDisp, VARIANT* URL, VARIANT* Flags, VARIANT* TargetFrameName, VARIANT* PostData, VARIANT* Headers, BOOL* Cancel)
{
	COLE2T szURL(URL->bstrVal);
	m_strLoadingUrl = szURL;
	// TODO: Add your message handler code here
}


void CIEHostWindow::OnDocumentComplete(LPDISPATCH pDisp, VARIANT* URL)
{
	// TODO: Add your message handler code here
	m_iProgress = -1;
	OnProgressChanged(m_iProgress);

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

BOOL CIEHostWindow::DestroyWindow()
{
	// TODO: Add your specialized code here and/or call the base class
	UninitIE();

	return CDialog::DestroyWindow();
}


/** 这里之所有要使用NewWindow3而不使用NewWindow2，是因为NewWindow3提供了bstrUrlContext参数，
* 该参数用来设置新打开链接的referrer,一些网站通过检查referrer来防止盗链
*/
void CIEHostWindow::OnNewWindow3Ie(LPDISPATCH* ppDisp, BOOL* Cancel, unsigned long dwFlags, LPCTSTR bstrUrlContext, LPCTSTR bstrUrl)
{
  if (m_pPlugin)
  {
    s_csNewIEWindowMap.Lock();

    CIEHostWindow* pIEHostWindow = new CIEHostWindow();
    if (pIEHostWindow->Create(CIEHostWindow::IDD))
    {
      DWORD id = GetTickCount();
      s_NewIEWindowMap.Add(id, pIEHostWindow);
      *ppDisp = pIEHostWindow->m_ie.get_Application();
      m_pPlugin->NewIETab(id);
    }
    else
    {
      delete pIEHostWindow;
      *Cancel = TRUE;
    }
    s_csNewIEWindowMap.Unlock();
  }
}


