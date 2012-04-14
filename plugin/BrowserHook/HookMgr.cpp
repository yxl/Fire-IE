#include "StdAfx.h"
#include "HookMgr.h"
#include "HookImportFunction.h"

#include <tlhelp32.h>

namespace BrowserHook
{

	HookMgr::HookMgr(void)
	{
		InitializeCriticalSection(&m_cs);
	}

	HookMgr::~HookMgr(void)
	{
	}

	void HookMgr::InstallHookForOneModule( HMODULE hModule, LPCSTR szImportModule, LPCSTR szFunc, PROC pHookFunc)
	{
		EnterCriticalSection(&m_cs);

		HookItem* pItem = NULL;
		pItem = new HookItem(hModule, szImportModule, szFunc, pHookFunc);
		if (pItem == NULL)
		{
			LeaveCriticalSection(&m_cs);
			return;
		}
		if (!HookImportFunction(hModule, szImportModule, szFunc, pHookFunc, &pItem->pOrigFunc))
		{
			delete pItem;
		}
		else 
		{
			ModuleMap::iterator iter;
			HookMap* pHookMapByOriginalFunc = NULL;
			iter = m_modulesByOriginalFunc.find(hModule);
			if (iter == m_modulesByOriginalFunc.end()) 
			{
				pHookMapByOriginalFunc = new HookMap();
				m_modulesByOriginalFunc.insert(pair<HMODULE, HookMap*>(hModule, pHookMapByOriginalFunc));
			}
			else
			{
				pHookMapByOriginalFunc = iter->second;
			}
			pHookMapByOriginalFunc->insert(pair<PROC, HookItem*>(pItem->pOrigFunc, pItem));

			HookMap* pHookMapByHookFunc = NULL;
			iter = m_modulesByHookFunc.find(hModule);
			if (iter == m_modulesByHookFunc.end()) 
			{
				pHookMapByHookFunc = new HookMap();
				m_modulesByHookFunc.insert(pair<HMODULE, HookMap*>(hModule, pHookMapByHookFunc));
			}
			else
			{
				pHookMapByHookFunc = iter->second;
			}
			pHookMapByHookFunc->insert(pair<PROC, HookItem*>(pItem->pHookFunc, pItem));
		}

		LeaveCriticalSection(&m_cs);
	}

	void HookMgr::ClearAllHooks()
	{
		EnterCriticalSection(&m_cs);
		//
		// Uninstall the existing modules' hooks
		//

		HANDLE hSnapshot;
		MODULEENTRY32 me = {sizeof(MODULEENTRY32)};

		hSnapshot = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE,0);

		BOOL bOk = Module32First(hSnapshot,&me);
		while (bOk) 
		{
			UnInstallAllHooksForOneModule(me.hModule);
			bOk = Module32Next(hSnapshot,&me);
		}

		//
		// Clear invalid modules' hooks
		//

		while (m_modulesByOriginalFunc.size() > 0)
		{
			HookMap* pHookMap = m_modulesByOriginalFunc.begin()->second;
			while (pHookMap->size() > 0)
			{
				HookItem* pItem = pHookMap->begin()->second;
				pHookMap->erase(pHookMap->begin());
				delete pItem;
			}
			m_modulesByOriginalFunc.erase(m_modulesByOriginalFunc.begin());
			delete pHookMap;
		}
		while (m_modulesByHookFunc.size() > 0)
		{
			HookMap* pHookMap = m_modulesByHookFunc.begin()->second;
			m_modulesByHookFunc.erase(m_modulesByHookFunc.begin());
			delete pHookMap;
		}
		LeaveCriticalSection(&m_cs);
	}

	void HookMgr::UnInstallAllHooksForOneModule(HMODULE hModule)
	{
		ModuleMap::iterator moduleIter = m_modulesByOriginalFunc.find(hModule);
		if (moduleIter == m_modulesByOriginalFunc.end())
			return;
		HookMap* pHookMap = moduleIter->second;
		while (pHookMap->size() > 0)
		{
			HookItem* pItem = pHookMap->begin()->second;
			HookImportFunction(pItem->hModule, pItem->szImportModule, pItem->szFunc, pItem->pOrigFunc, NULL);
			pHookMap->erase(pHookMap->begin());
			delete pItem;
		}
		m_modulesByOriginalFunc.erase(moduleIter);
		delete pHookMap;
	}

	HookItem* HookMgr::FindHook(HMODULE hModule, PROC pOrigFunc)
	{
		EnterCriticalSection(&m_cs);

		HookItem* pItem = NULL;

		ModuleMap::iterator moduleIter = m_modulesByOriginalFunc.find(hModule);
		if (moduleIter != m_modulesByOriginalFunc.end())
		{
			HookMap* pHookMap = moduleIter->second;
			HookMap::iterator iter = pHookMap->find(pOrigFunc);
			if (iter != pHookMap->end()) 
			{
				pItem = iter->second;
			}
		}

		LeaveCriticalSection(&m_cs);

		return pItem;
	}

	PROC HookMgr::FindOriginalFunc(HMODULE hModule, PROC pHook)
	{
		EnterCriticalSection(&m_cs);

		HookItem* pItem = NULL;

		ModuleMap::iterator moduleIter = m_modulesByHookFunc.find(hModule);
		if (moduleIter != m_modulesByHookFunc.end())
		{
			HookMap* pHookMap = moduleIter->second;
			HookMap::iterator iter = pHookMap->find(pHook);
			if (iter != pHookMap->end()) 
			{
				pItem = iter->second;
			}
		}

		PROC pOrigFunc = NULL;
		if (pItem) 
		{
			pOrigFunc = pItem->pOrigFunc;
		}
		LeaveCriticalSection(&m_cs);

		return pOrigFunc;
	}

	BOOL HookMgr::IsModuleHooked(HMODULE hModule)
	{
		EnterCriticalSection(&m_cs);
		ModuleMap::iterator iter = m_modulesByOriginalFunc.find(hModule);
		BOOL isHooked = iter != m_modulesByOriginalFunc.end();
		LeaveCriticalSection(&m_cs);
		return isHooked;
	}

}