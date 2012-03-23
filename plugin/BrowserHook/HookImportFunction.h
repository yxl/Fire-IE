#pragma once

#include <windows.h>

namespace BrowserHook
{

	BOOL HookImportFunction(HMODULE hModule, LPCSTR szImportModule, LPCSTR szFunc, PROC pHookFunc, PROC* ppOrigFunc);

}