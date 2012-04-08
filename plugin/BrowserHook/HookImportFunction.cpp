#include "StdAfx.h"
#include "HookImportFunction.h"
#include <tlhelp32.h>

namespace BrowserHook
{

#define MakePtr(cast, ptr, AddValue) (cast)((size_t)(ptr)+(size_t)(AddValue))

	static PIMAGE_IMPORT_DESCRIPTOR GetNamedImportDescriptor(HMODULE hModule, LPCSTR szImportModule)
	{
		PIMAGE_DOS_HEADER pDOSHeader;
		PIMAGE_NT_HEADERS pNTHeader;
		PIMAGE_IMPORT_DESCRIPTOR pImportDesc;

		if ((szImportModule == NULL) || (hModule == NULL))
			return NULL;
		pDOSHeader = (PIMAGE_DOS_HEADER) hModule;
		if (IsBadReadPtr(pDOSHeader, sizeof(IMAGE_DOS_HEADER)) || (pDOSHeader->e_magic != IMAGE_DOS_SIGNATURE)) 
		{
			return NULL;
		}
		pNTHeader = MakePtr(PIMAGE_NT_HEADERS, pDOSHeader, pDOSHeader->e_lfanew);
		if (IsBadReadPtr(pNTHeader, sizeof(IMAGE_NT_HEADERS)) || (pNTHeader->Signature != IMAGE_NT_SIGNATURE))
			return NULL;
		if (pNTHeader->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT].VirtualAddress == 0)
			return NULL;
		pImportDesc = MakePtr(PIMAGE_IMPORT_DESCRIPTOR, pDOSHeader, pNTHeader->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT].VirtualAddress);
		while (pImportDesc->Name) 
		{
			PSTR szCurrMod = MakePtr(PSTR, pDOSHeader, pImportDesc->Name);
			if (_stricmp(szCurrMod, szImportModule) == 0)
				break;
			pImportDesc++;
		}
		if (pImportDesc->Name == (DWORD)0)
			return NULL;
		return pImportDesc;
	}

	BOOL HookImportFunction(HMODULE hModule, LPCSTR szImportModule, LPCSTR szFunc, PROC pHookFunc, PROC* ppOrigFunc)
	{
		PIMAGE_IMPORT_DESCRIPTOR pImportDesc = GetNamedImportDescriptor(hModule, szImportModule);

		if (pImportDesc == NULL)
		{
			return FALSE; // The requested module was not imported.
		}

		// Get the original thunk information for this DLL.  I cannot use
		//  the thunk information stored in the pImportDesc->FirstThunk
		//  because the that is the array that the loader has already
		//  bashed to fix up all the imports.  This pointer gives us acess
		//  to the function names.
		PIMAGE_THUNK_DATA pOrigThunk = MakePtr(PIMAGE_THUNK_DATA, hModule, pImportDesc->OriginalFirstThunk);
		if (!pOrigThunk)
		{
			return FALSE;
		}

		// Get the array pointed to by the pImportDesc->FirstThunk.  This is
		//  where I will do the actual bash.
		PIMAGE_THUNK_DATA pRealThunk = MakePtr(PIMAGE_THUNK_DATA, hModule, pImportDesc->FirstThunk);

		BOOL bHooked = FALSE;
		// Loop through and look for the one that matches the name.
		while (pOrigThunk->u1.Function) 
		{
			// Only look at those that are imported by name, not ordinal.
			if (IMAGE_ORDINAL_FLAG != (pOrigThunk->u1.Ordinal & IMAGE_ORDINAL_FLAG)) 
			{
				// Look get the name of this imported function.
				PIMAGE_IMPORT_BY_NAME pByName = MakePtr(PIMAGE_IMPORT_BY_NAME, hModule, pOrigThunk->u1.AddressOfData);
				// See if the particular function name is in the import list.  
				if (IsBadReadPtr(pByName, sizeof(IMAGE_IMPORT_BY_NAME)) ||
					_strcmpi(szFunc, (char*)pByName->Name) != 0) 
				{
					pOrigThunk++;
					pRealThunk++;
					continue;
				}
				// I found it.  Now I need to change the protection to
				//  writable before I do the blast.  Note that I am now
				//  blasting into the real thunk area!
				MEMORY_BASIC_INFORMATION mbi_thunk;
				VirtualQuery(pRealThunk, &mbi_thunk, sizeof(MEMORY_BASIC_INFORMATION));
				VERIFY(VirtualProtect(mbi_thunk.BaseAddress, mbi_thunk.RegionSize, PAGE_READWRITE, &mbi_thunk.Protect));

				// Save the original address if requested.
				if (ppOrigFunc)
					*ppOrigFunc = (PROC)pRealThunk->u1.Function;

				// Do the actual hook.
				pRealThunk->u1.Function = (DWORD)pHookFunc;

				// Change the protection back to what it was before I blasted.
				DWORD dwOldProtect;
				VERIFY(VirtualProtect(mbi_thunk.BaseAddress, mbi_thunk.RegionSize, mbi_thunk.Protect, &dwOldProtect));

				return TRUE;
			}
			// Increment both tables.
			pOrigThunk++;
			pRealThunk++;
		}
		return FALSE;
	}

}