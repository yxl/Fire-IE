#include "StdAfx.h"
#include "HookImportFunction.h"
#include <tlhelp32.h>

namespace BrowserHook
{

#define MakePtr(cast, ptr, AddValue) (cast)((size_t)(ptr)+(size_t)(AddValue))

	BOOL HookImportFunction(HMODULE hModule, LPCSTR szImportModule, LPCSTR szFunc, PROC pHookFunc, PROC* ppOrigFunc)
	{
		// Get the address of the module's import section
		ULONG ulSize;

		// An exception was triggered by Explorer (when browsing the content of
		// a folder) into imagehlp.dll. It looks like one module was unloaded...
		// Maybe some threading problem: the list of modules from Toolhelp might
		// not be accurate if FreeLibrary is called during the enumeration.
		PIMAGE_IMPORT_DESCRIPTOR pImportDesc = NULL;

		__try 
		{
			pImportDesc = (PIMAGE_IMPORT_DESCRIPTOR) ImageDirectoryEntryToData(
				hModule, TRUE, IMAGE_DIRECTORY_ENTRY_IMPORT, &ulSize);
		}
		__finally
		{
		}

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
			}
			// Increment both tables.
			pOrigThunk++;
			pRealThunk++;
		}
		return FALSE;
	}

}