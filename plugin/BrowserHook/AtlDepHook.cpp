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
#include "AtlDepHook.h"
#include <tlhelp32.h>

#define DEFINE_FUNCTION_INFO(module, func) {module, #func, (PROC)func##_hook}

#if defined _M_X64
// Should be capitilized!
#define DLL_NAME "NPFIREIE64.DLL"
#define DLL_NAME_WIDE L"NPFIREIE64.DLL"
#elif defined _M_IX86
// Should be capitilized!
#define DLL_NAME "NPFIREIE32.DLL"
#define DLL_NAME_WIDE L"NPFIREIE32.DLL"
#endif

// WindowProc thunks 
#pragma pack(push,1)
struct _WndProcThunk
{
	DWORD   m_mov;          // mov dword ptr [esp+0x4], pThis (esp+0x4 is hWnd)
	DWORD   m_this;         //
	BYTE    m_jmp;          // jmp WndProc
	DWORD   m_relproc;      // relative jmp
};
#pragma pack(pop)

namespace BrowserHook
{
	BOOL FixThunk(LONG dwLong);

	LONG WINAPI SetWindowLongA_hook(HWND hWnd, int nIndex, LONG dwNewLong) 
	{
		TRACE("[fireie] SetWindowLongA_hook\n");

		if (!FixThunk(dwNewLong))
		{
			TRACE("[fireie] FixThunk failed!\n");
		}

		return SetWindowLongA(hWnd, nIndex, dwNewLong);
	}

	LONG WINAPI SetWindowLongW_hook(HWND hWnd, int nIndex, LONG dwNewLong) 
	{
		TRACE("[fireie] SetWindowLongA_hook\n");

		if (!FixThunk(dwNewLong))
		{
			TRACE("[fireie] FixThunk failed!\n");
		}

		return SetWindowLongW(hWnd, nIndex, dwNewLong);
	}

	HRESULT WINAPI CoCreateInstance_hook(REFCLSID rclsid, LPUNKNOWN pUnkOuter, DWORD dwClsContext, REFIID riid, LPVOID* ppv)
	{
		TRACE(_T("[AtlDepHook] CoCreateInstance_hook\n"));
		HRESULT hret =  ::CoCreateInstance(rclsid, pUnkOuter, dwClsContext, riid, ppv);
		AtlDepHook::s_instance.Install();
		return hret;
	}


	struct FunctionInfo
	{
		LPCSTR  szFunctionModule;
		LPCSTR  szFunctionName;
		PROC    pHookFunction;
	};

	FunctionInfo s_Functions[] = 
	{
		DEFINE_FUNCTION_INFO("user32.dll", SetWindowLongA),
		DEFINE_FUNCTION_INFO("user32.dll", SetWindowLongW),
		DEFINE_FUNCTION_INFO("ole32.dll", CoCreateInstance),
	};


	const size_t s_FunctionsCount = sizeof(s_Functions)/sizeof(FunctionInfo);

	BOOL CheckThunk(_WndProcThunk* pThunk)
	{
		if (pThunk->m_mov != 0x042444C7)
		{
			return FALSE;
		}
		if (pThunk->m_jmp != 0xE9)
		{
			return FALSE;
		}
		return TRUE;
	}

	BOOL FixThunk(LONG dwLong)
	{
		_WndProcThunk* pThunk = (_WndProcThunk*)dwLong;

		MEMORY_BASIC_INFORMATION mbi;
		DWORD dwOldProtect;

		if (IsBadReadPtr(pThunk, sizeof(_WndProcThunk)) || !CheckThunk(pThunk))
		{
			return TRUE;
		}

		if (VirtualQuery((LPCVOID)pThunk, &mbi, sizeof(MEMORY_BASIC_INFORMATION)) == 0)
		{
			return FALSE;
		}
		// The memory is already PAGE_EXECUTE_READWRITE, so don't need fixing
		if (mbi.AllocationProtect == PAGE_EXECUTE_READWRITE)
		{
			return TRUE;
		}

		return VirtualProtect((LPVOID)pThunk, sizeof(_WndProcThunk), PAGE_EXECUTE_READWRITE, &dwOldProtect);
	}

	BOOL ShouldHookModule( LPCSTR szModuleName)
	{
		// The words in the list should be capitilized!
		static LPCSTR aIgnoreList[] = 
		{
			DLL_NAME,   // Our own module
			"NTDLL", 
			"GDI32", // GDI Client
			"GDIPLUS", // GDI+
			"MSIMG32", // GDIEXT Client
			"WSOCK32", // Windows Socket
			"WS2_32", // Windows Socket
			"MSWSOCK", // Windows Socket
			"WSHTCPIP", // Winsock2 Helper
			"WININET", // Win32 Internet Lib
			"SETUPAPI", // Window Installation API
			"IPHLPAPI", // IP Helper API
			"DNSAPI", // DNS Client API
			"RASADHLP", // Remote Access AutoDial Helper
			"UXTHEME", // Microsoft UxTheme Lib
			"WINNSI", // Network Store Information RPC interface
			"FECLIENT", // Windows NT File Encryption Client Interface
			"APPHELP",  // Application Compatibility Helper
			"SQLITE", // SQLite Database Lib
			"KSFMON", // KSafe Monitor
			"KWSUI", // Kingsoft Webshield Module
			"KDUMP", // Kingsoft Antivirus Dump Collect Lib
			"TORTOISE", // Tortoise Veriosn Control Client
			"UPEDITOR", // China UnionPay ActiveX Control
		};

		// Converts to upper case string
		char szUpperCaseName[MAX_PATH];
		strcpy_s(szUpperCaseName, szModuleName);
		_strupr_s(szUpperCaseName);

		// Ignore list length
		int n = sizeof(aIgnoreList) / sizeof(LPCSTR);

		for (int i=0; i<n; i++)
		{
			if (strstr(szUpperCaseName, aIgnoreList[i]) != NULL)
				return FALSE;
		}

		return TRUE;
	}

	AtlDepHook AtlDepHook::s_instance;

	void AtlDepHook::Install(void)
	{
		USES_CONVERSION;

		HANDLE hSnapshot;
		MODULEENTRY32 me = {sizeof(MODULEENTRY32)};

		hSnapshot = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE,0);

		BOOL bOk = Module32First(hSnapshot,&me);
		while (bOk) 
		{
			if (ShouldHookModule(T2A(me.szModule)))
			{
				if (!m_hookMgr.IsModuleHooked(me.hModule))
				{
					TRACE(_T("[AtlDepHook] New module is hooked! %s\n"), me.szModule);
				}
				InstallHooksForNewModule(me.hModule);
			}
			bOk = Module32Next(hSnapshot,&me);
		}
	}

	void AtlDepHook::Uninstall(void)
	{
		m_hookMgr.ClearAllHooks();
	}

	void AtlDepHook::InstallHooksForNewModule(HMODULE hModule)
	{
		if (m_hookMgr.IsModuleHooked(hModule))
		{
			return;
		}

		for(int i = 0; i < s_FunctionsCount; ++i)
		{
			FunctionInfo& info = s_Functions[i];
			m_hookMgr.InstallHookForOneModule(hModule, info.szFunctionModule, info.szFunctionName, info.pHookFunction);
		}
	}
}
