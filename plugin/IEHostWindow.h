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

#include "resource.h"
#include "IECtrl.h"
#include <vector>

namespace Plugin
{
	class CPlugin;
}

namespace UserMessage
{
	// User defined window message
	static const UINT WM_USER_MESSAGE =  WM_USER + 200;

	//
	// Sub-types of the user defined window message
	//

	static const WPARAM WPARAM_SET_FIREFOX_COOKIE = 0;
	struct SetFirefoxCookieParams
	{
		CString strURL;
		CString strCookie;
	};

	static const WPARAM WPARAM_NAVIGATE = 1;
	struct NavigateParams
	{
		CString strURL;
		CString strPost;
		CString strHeaders;
	};

	static const WPARAM WPARAM_REFRESH = 2;
	static const WPARAM WPARAM_STOP = 3;
	static const WPARAM WPARAM_BACK = 4;
	static const WPARAM WPARAM_FORWARD = 5;
	static const WPARAM WPARAM_EXEC_OLE_CMD = 6;
	static const WPARAM WPARAM_DISPLAY_SECURITY_INFO = 7;
	static const WPARAM WPARAM_UTILS_PLUGIN_INIT = 8;
	static const WPARAM WPARAM_CONTENT_PLUGIN_INIT = 9;

}

// Firefox 4.0 开始采用了新的窗口结构
// 对于插件，是放在 GeckoPluginWindow 窗口里，往上有一个 MozillaWindowClass，再往上是顶层的
// MozillaWindowClass，我们的消息要发到顶层，所以再写一个查找的函数
HWND GetTopMozillaWindowClassWindow(HWND hwndIECtrl);

// CIEHostWindow dialog

class CIEHostWindow : public CDialog
{
	DECLARE_DYNAMIC(CIEHostWindow)
	DECLARE_EVENTSINK_MAP()
	DECLARE_MESSAGE_MAP()

public:
	static CIEHostWindow* CreateNewIEHostWindow(CWnd* pParentWnd, DWORD dwId, bool isUtils);

	/** Get CIEHostWindow object by its window handle */
	static CIEHostWindow* GetInstance(HWND hwnd);

	/** Get CIEHostWindow object by its embeded Internet Explorer_Server window handle*/
	static CIEHostWindow* FromInternetExplorerServer(HWND hwndIEServer);

	static void AddUtilsIEWindow(CIEHostWindow *pWnd);

	static void SetFirefoxCookie(CString strURL, CString strCookie);

	static HWND GetAnyUtilsHWND();
	static CIEHostWindow* GetAnyUtilsWindow();
	static Plugin::CPlugin* GetAnyUtilsPlugin();
	/** 
	 * Get the UserAgent of the IE control.
	 * As the IE control provides no explicit interface for querying the UserAgent, we have to parse it from the HTML document.
	 * @return The IE control's UserAgent. It will be ready when the page completes loading for the first time. Before that, empty string will be returned.
	 */
	static CString GetIEUserAgentString() {return s_strIEUserAgent;}

	/* Get the embedded Internet Explorer_server window */
	HWND GetInternetExplorerServer() const;
		
public:
	
	virtual ~CIEHostWindow();

	virtual BOOL CreateControlSite(COleControlContainer* pContainer, 
		COleControlSite** ppSite, UINT nID, REFCLSID clsid);

	// Dialog Data
	enum { IDD = IDD_IE_HOST_WINDOW };

	// Overrides
	virtual BOOL OnInitDialog();
	virtual BOOL DestroyWindow();
	virtual BOOL Create(UINT nIDTemplate,CWnd* pParentWnd = NULL);

	void SetPlugin(Plugin::CPlugin* pPlugin);

protected:
	CIEHostWindow(Plugin::CPlugin* pPlugin = NULL, CWnd* pParent = NULL);   // standard constructor

	/** Map used to search the CIEHostWindow object by its window handle  */
	static CSimpleMap<HWND, CIEHostWindow *> s_IEWindowMap;
	
	/** Ensure the operations on s_IEWindowMap are thread safe. */
	static CCriticalSection s_csIEWindowMap;

	/** Map used to search the CIEHostWindow object by its ID */
	static CSimpleMap<DWORD, CIEHostWindow *> s_NewIEWindowMap;

	/** Ensure the operations on s_NewIEWindowMap are thread safe. */
	static CCriticalSection s_csNewIEWindowMap;

	/** Plugins used to do utilities like transferring cookies to Firfox */
	static CSimpleMap<HWND, CIEHostWindow *> s_UtilsIEWindowMap;

	/** Ensure the operations on s_UtilsIEWindowMap are thread safe. */
	static CCriticalSection s_csUtilsIEWindowMap;

	/** IE controls' UserAgent */
	static CString s_strIEUserAgent;

	static const CString s_strSecureLockInfos[];

	void InitIE();
	void UninitIE();

	// Get IE control's UserAgent from the HTML document
	CString GetDocumentUserAgent();

	// 检测浏览器命令是否可用
	BOOL IsOleCmdEnabled(OLECMDID cmdID);

	// 执行浏览器命令
	void ExecOleCmd(OLECMDID cmdID);
	// delay ole cmd execution to next message loop
	void PostOleCmd(OLECMDID cmdID);

	// 自定义窗口消息响应函数
	void OnSetFirefoxCookie(const CString& strURL, const CString& strCookie);
	void OnNavigate();
	void OnRefresh();
	void OnStop();
	void OnBack();
	void OnForward();
	void OnDisplaySecurityInfo();

	virtual void DoDataExchange(CDataExchange* pDX);    // DDX/DDV support

	afx_msg void OnSize(UINT nType, int cx, int cy);
	afx_msg LRESULT OnUserMessage(WPARAM wParam, LPARAM lParam);
	void OnCommandStateChange(long Command, BOOL Enable);
	void OnStatusTextChange(LPCTSTR Text);
	void OnTitleChange(LPCTSTR Text);
	void OnProgressChange(long Progress, long ProgressMax);
	void OnBeforeNavigate2(LPDISPATCH pDisp, VARIANT* URL, VARIANT* Flags, VARIANT* TargetFrameName, VARIANT* PostData, VARIANT* Headers, BOOL* Cancel);
	void OnDocumentComplete(LPDISPATCH pDisp, VARIANT* URL);
	void OnNewWindow3Ie(LPDISPATCH* ppDisp, BOOL* Cancel, unsigned long dwFlags, LPCTSTR bstrUrlContext, LPCTSTR bstrUrl);

	void SendKey(WORD vkey);
	CString GetSelectionTextFromDoc(const CComPtr<IHTMLDocument2>& pDoc);
	void FBRestartFind();
	bool FBObtainFindRange();
	void FBObtainFindRangeRecursive(const CComPtr<IHTMLDocument2>& pDoc);
	struct FBDocFindStatus;
	FBDocFindStatus& FBGetCurrentDocStatus();
	bool FBResetFindRange();
	void FBResetFindStatus();
	void FBResetFindStatusGood();
	void FBFindAgainInternal(bool backwards, bool norecur = false, bool noselect = false);
	void FBHighlightAll();
	void FBCancelHighlight();
	void FBMatchDocSelection();
	bool FBCheckDocument();
	static bool FBCheckRangeVisible(const CComPtr<IHTMLTxtRange>& pRange);
	static bool FBRangesEqual(const CComPtr<IHTMLTxtRange>& pRange1, const CComPtr<IHTMLTxtRange>& pRange2);
	static bool FBCheckRangeHighlightable(const CComPtr<IDisplayServices> pDS, const CComPtr<IMarkupServices> pMS, const CComPtr<IHTMLTxtRange>& pRange);

	static BOOL CALLBACK GetInternetExplorerServerCallback(HWND hWnd, LPARAM lParam);
public:
	CIECtrl m_ie;

	// plugin methods
	void Navigate(const CString& strURL, const CString& strPost, const CString& strHeaders);
	void Refresh();
	void Stop();
	void Back();
	void Forward();
	void Focus();
	void Copy();
	void Cut();
	void Paste();
	void SelectAll();
	void Undo();
	void Redo();
	void Find();
	void HandOverFocus();
	void Zoom(double level);
	void DisplaySecurityInfo();
	void SaveAs();
	void Print();
	void PrintPreview();
	void PrintSetup();
	void ViewPageSource();
	void ScrollPage(bool up);
	void ScrollLine(bool up);
	void ScrollWhole(bool up);
	void ScrollHorizontal(bool left);
	void ScrollWheelLine(bool up);

	// FindBar methods
	void FBFindText(const CString& text);
	void FBEndFindText();
	void FBSetFindText(const CString& text);
	void FBFindAgain();
	void FBFindPrevious();
	void FBToggleHighlight(bool bHighlight);
	void FBToggleCase(bool bCase);
	CString FBGetLastFindStatus();

	// read only plugin properties
	CString GetURL();
	CString GetTitle();
	CString GetFaviconURL();
	CString GetFaviconURLFromContent();
	BOOL GetCanBack() {return m_bCanBack;}
	BOOL GetCanForward() {return m_bCanForward;}
	BOOL GetCanStop() {return IsOleCmdEnabled(OLECMDID_STOP);}
	BOOL GetCanRefresh() {return IsOleCmdEnabled(OLECMDID_REFRESH);}
	BOOL GetCanCopy(){return IsOleCmdEnabled(OLECMDID_COPY);}
	BOOL GetCanCut(){return IsOleCmdEnabled(OLECMDID_CUT);}
	BOOL GetCanPaste(){return IsOleCmdEnabled(OLECMDID_PASTE);}
	BOOL GetCanSelectAll(){return IsOleCmdEnabled(OLECMDID_SELECTALL);}
	BOOL GetCanUndo(){return IsOleCmdEnabled(OLECMDID_UNDO);}
	BOOL GetCanRedo(){return IsOleCmdEnabled(OLECMDID_REDO);}
	INT32 GetProgress() {return m_iProgress;}
	CString GetSelectionText();
	CString GetSecureLockInfo();
	CString GetStatusText();
	BOOL ShouldShowStatusOurselves();
	BOOL ShouldPreventStatusFlash();

	// plugin events
	void OnTitleChanged(const CString& title);
	void OnIEProgressChanged(INT32 iProgress);
	void OnStatusChanged(const CString& message);
	void OnCloseIETab();
	void OnSetSecureLockIcon(int state);
	void OnUtilsPluginInit();
	void OnContentPluginInit();

	// miscellaneous
	bool IsUtils() const { return m_bUtils; }

protected:
	BOOL m_bCanBack;
	BOOL m_bCanForward;
	INT32 m_iProgress;

	/** 缓存最近的 Favicon URL */
	CString m_strFaviconURL;

	// Cache recent status text
	CString m_strStatusText;

	// Find Bar states
	bool m_bFBInProgress;
	bool m_bFBHighlight;
	bool m_bFBCase;
	bool m_bFBTxtRangeChanged;
	CString m_strFBText;

	// Find status struct for findbar methods
	struct FBDocFindStatus
	{
		CComPtr<IHTMLDocument2> doc;
		CComPtr<IHTMLTxtRange> txtRange, originalRange;

		FBDocFindStatus(const CComPtr<IHTMLDocument2>& doc, const CComPtr<IHTMLTxtRange>& txtRange, const CComPtr<IHTMLTxtRange>& originalRange)
		{
			this->doc = doc;
			this->txtRange = txtRange;
			this->originalRange = originalRange;
		}
	};

	std::vector<FBDocFindStatus> m_vFBDocs;
	long m_lFBCurrentDoc;

	long m_lFBLastFindLength;
	// store the rendering service as well as the highlight segment, in case we process multiple documents (i.e. iframes)
	std::vector<std::pair<CComPtr<IHighlightRenderingServices>, CComPtr<IHighlightSegment> > > m_vFBHighlightSegments;
	bool m_bFBFound;
	bool m_bFBCrossHead;
	bool m_bFBCrossTail;

	// secure lock infomation
	CString m_strSecureLockInfo;
	
	Plugin::CPlugin* m_pPlugin;

	UserMessage::NavigateParams* m_pNavigateParams;
	/** Ensure the operations on m_pNavigateParams are thread safe. */
	CCriticalSection m_csNavigateParams;

	/** Indicates whether the associated plugin is a utils plugin */
	bool m_bUtils;
};
