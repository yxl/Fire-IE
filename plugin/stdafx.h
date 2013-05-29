// stdafx.h : include file for standard system include files,
// or project specific include files that are used frequently, but
// are changed infrequently

#pragma once

#ifndef VC_EXTRALEAN
#define VC_EXTRALEAN            // Exclude rarely-used stuff from Windows headers
#endif

#include "targetver.h"

#define _ATL_CSTRING_EXPLICIT_CONSTRUCTORS      // some CString constructors will be explicit
#define _AFX_NO_MFC_CONTROLS_IN_DIALOGS

#include <afxwin.h>         // MFC core and standard components
#include <afxext.h>         // MFC extensions
#include <comdef.h>

#ifndef _AFX_NO_OLE_SUPPORT
#include <afxole.h>         // MFC OLE classes
#include <afxodlgs.h>       // MFC OLE dialog classes
#include <afxdisp.h>        // MFC Automation classes
#endif // _AFX_NO_OLE_SUPPORT

#include <afxmt.h>

#include <atlbase.h>
#include <atlcom.h>
#include <atlctl.h>
#include <atlutil.h>

#include <mshtmcid.h>
#include <mshtmhst.h>
#include <mshtmdid.h>
#include <mshtml.h>
#include <exdispid.h>
#include <comutil.h>

#include <windows.h>
#include <windowsx.h>
#include <WinInet.h>
#pragma comment(lib, "Wininet.lib")
#include <urlmon.h>
#pragma comment(lib, "urlmon.lib")

#include "npapi.h"
#include "npfunctions.h"
#include "nptypes.h"
#include "ProtocolImpl.h"
#include "ProtocolCF.h"

#include <math.h>
#include <ctype.h>
#include <stdexcept>
#include <string>
#include <vector>
#include <map>
#include <unordered_map>
#include <set>
#include <unordered_set>
#include <deque>
#include <xhash>
#include <algorithm>

using namespace std;
