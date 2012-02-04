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
	USES_CONVERSION;
	char* utf8str = NULL;
	int cnt = str.GetLength() + 1;
	TCHAR* tstr = new TCHAR[cnt];
	_tcsncpy_s(tstr, cnt, str, cnt);
	if (tstr != NULL)
	{
		LPWSTR wstr = T2W(tstr);

		// converts to utf8 string
		int nUTF8 = WideCharToMultiByte(CP_UTF8, 0, wstr, cnt, NULL, 0, NULL, NULL);
		if (nUTF8 > 0)
		{
			utf8str = (char *)NPN_MemAlloc(nUTF8);
			WideCharToMultiByte(CP_UTF8, 0, wstr, cnt, utf8str, nUTF8, NULL, NULL);
		}
		delete[] tstr;
	}
	return utf8str;
}

CString NPStringToCString(NPString npstr)
{
	USES_CONVERSION;
	CString str;
	int nWide =  MultiByteToWideChar(CP_UTF8, 0, npstr.UTF8Characters, npstr.UTF8Length + 1, NULL, 0);
	if (nWide == 0)
		return str;
	WCHAR* wstr = new WCHAR[nWide];
	if (wstr)
	{
		MultiByteToWideChar(CP_UTF8, 0, npstr.UTF8Characters, npstr.UTF8Length + 1, wstr, nWide);
		str = W2T(wstr);
		delete[] wstr;
	}
	return str;
}
