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
#include "stdafx.h"
#include "ScriptablePluginObjectBase.h"

namespace Plugin 
{
	void ScriptablePluginObjectBase::Invalidate()
	{
	}

	bool ScriptablePluginObjectBase::HasMethod(NPIdentifier name)
	{
		return false;
	}

	bool ScriptablePluginObjectBase::Invoke(NPIdentifier name, const NPVariant *args,
		uint32_t argCount, NPVariant *result)
	{
		return false;
	}

	bool ScriptablePluginObjectBase::InvokeDefault(const NPVariant *args,
		uint32_t argCount, NPVariant *result)
	{
		return false;
	}

	bool ScriptablePluginObjectBase::HasProperty(NPIdentifier name)
	{
		return false;
	}

	bool ScriptablePluginObjectBase::GetProperty(NPIdentifier name, NPVariant *result)
	{
		return false;
	}

	bool ScriptablePluginObjectBase::SetProperty(NPIdentifier name,
		const NPVariant *value)
	{
		return false;
	}

	bool ScriptablePluginObjectBase::RemoveProperty(NPIdentifier name)
	{
		return false;
	}

	bool ScriptablePluginObjectBase::Enumerate(NPIdentifier **identifier,
		uint32_t *count)
	{
		return false;
	}

	bool ScriptablePluginObjectBase::Construct(const NPVariant *args, uint32_t argCount,
		NPVariant *result)
	{
		return false;
	}

	// static
	void ScriptablePluginObjectBase::_Deallocate(NPObject *npobj)
	{
		// Call the virtual destructor.
		delete (ScriptablePluginObjectBase *)npobj;
	}

	// static
	void ScriptablePluginObjectBase::_Invalidate(NPObject *npobj)
	{
		((ScriptablePluginObjectBase *)npobj)->Invalidate();
	}

	// static
	bool ScriptablePluginObjectBase::_HasMethod(NPObject *npobj, NPIdentifier name)
	{
		return ((ScriptablePluginObjectBase *)npobj)->HasMethod(name);
	}

	// static
	bool ScriptablePluginObjectBase::_Invoke(NPObject *npobj, NPIdentifier name,
		const NPVariant *args, uint32_t argCount,
		NPVariant *result)
	{
		return ((ScriptablePluginObjectBase *)npobj)->Invoke(name, args, argCount,
			result);
	}

	// static
	bool ScriptablePluginObjectBase::_InvokeDefault(NPObject *npobj,
		const NPVariant *args,
		uint32_t argCount,
		NPVariant *result)
	{
		return ((ScriptablePluginObjectBase *)npobj)->InvokeDefault(args, argCount,
			result);
	}

	// static
	bool ScriptablePluginObjectBase::_HasProperty(NPObject * npobj, NPIdentifier name)
	{
		return ((ScriptablePluginObjectBase *)npobj)->HasProperty(name);
	}

	// static
	bool ScriptablePluginObjectBase::_GetProperty(NPObject *npobj, NPIdentifier name,
		NPVariant *result)
	{
		return ((ScriptablePluginObjectBase *)npobj)->GetProperty(name, result);
	}

	// static
	bool ScriptablePluginObjectBase::_SetProperty(NPObject *npobj, NPIdentifier name,
		const NPVariant *value)
	{
		return ((ScriptablePluginObjectBase *)npobj)->SetProperty(name, value);
	}

	// static
	bool ScriptablePluginObjectBase::_RemoveProperty(NPObject *npobj, NPIdentifier name)
	{
		return ((ScriptablePluginObjectBase *)npobj)->RemoveProperty(name);
	}

	// static
	bool ScriptablePluginObjectBase::_Enumerate(NPObject *npobj,
		NPIdentifier **identifier,
		uint32_t *count)
	{
		return ((ScriptablePluginObjectBase *)npobj)->Enumerate(identifier, count);
	}

	// static
	bool ScriptablePluginObjectBase::_Construct(NPObject *npobj, const NPVariant *args,
		uint32_t argCount, NPVariant *result)
	{
		return ((ScriptablePluginObjectBase *)npobj)->Construct(args, argCount,
			result);
	}
}

char* CStringToNPStringCharacters(const CString &str)
{
	CStringW wstr = CT2W(str);
	int nUTF8 = WideCharToMultiByte(CP_UTF8, 0, wstr, wstr.GetLength() + 1, NULL, 0, NULL, NULL);
	if (nUTF8 == 0)
		return NULL;
	char* utf8str = (char *)NPN_MemAlloc(nUTF8);
	WideCharToMultiByte(CP_UTF8, 0, wstr, wstr.GetLength() + 1, utf8str, nUTF8, NULL, NULL);
	return utf8str;
}

CString NPStringCharactersToCString(const NPUTF8* npstrchars)
{
	NPString npstr = { npstrchars, (uint32_t)strlen(npstrchars) };
	return NPStringToCString(npstr);
}

CString NPStringToCString(NPString npstr)
{
	int nWide = MultiByteToWideChar(CP_UTF8, 0, npstr.UTF8Characters, npstr.UTF8Length + 1, NULL, 0);
	if (nWide == 0)
		return CString();
	CStringW wstr;
	MultiByteToWideChar(CP_UTF8, 0, npstr.UTF8Characters, npstr.UTF8Length + 1, wstr.GetBuffer(nWide), nWide);
	wstr.ReleaseBuffer();
	return CString(CW2T(wstr));
}

CString NPIdentifierToCString(NPIdentifier npid)
{
	NPUTF8* putf8IdName = NPN_UTF8FromIdentifier(npid);
	NPString npstrIdName = { putf8IdName, (uint32_t)strlen(putf8IdName) };
	CString idName = NPStringToCString(npstrIdName);
	NPN_MemFree(putf8IdName);
	return idName;
}

unordered_map<wstring, wstring> NPObjectToUnorderedMap(NPP npp, NPObject* npobj)
{
	unordered_map<wstring, wstring> result;

	NPIdentifier* pIdentifiers = NULL;
	uint32_t nIdentifiers = 0;
	if (NPN_Enumerate(npp, npobj, &pIdentifiers, &nIdentifiers)) {
		for (uint32_t i = 0; i < nIdentifiers; i++) {
			NPIdentifier npid = pIdentifiers[i];
			CString idName = NPIdentifierToCString(npid);
			NPVariant npvValue;
			if (NPN_GetProperty(npp, npobj, npid, &npvValue)) {
				if (NPVARIANT_IS_STRING(npvValue)) {
					result[idName.GetString()] = NPStringToCString(NPVARIANT_TO_STRING(npvValue)).GetString();
				}
				NPN_ReleaseVariantValue(&npvValue);
			}
		}
		NPN_MemFree(pIdentifiers);
	}

	return result;
}
