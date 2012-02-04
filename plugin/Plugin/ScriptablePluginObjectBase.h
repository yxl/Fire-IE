#pragma once

namespace Plugin
{
	// Helper class that can be used to map calls to the NPObject hooks
	// into virtual methods on instances of classes that derive from this
	// class.
	class ScriptablePluginObjectBase : public NPObject
	{
	public:
		ScriptablePluginObjectBase(NPP npp)
			: mNpp(npp)
		{
		}

		virtual ~ScriptablePluginObjectBase()
		{
		}

		// Virtual NPObject hooks called through this base class. Override
		// as you see fit.
		virtual void Invalidate();
		virtual bool HasMethod(NPIdentifier name);
		virtual bool Invoke(NPIdentifier name, const NPVariant *args,
			uint32_t argCount, NPVariant *result);
		virtual bool InvokeDefault(const NPVariant *args, uint32_t argCount,
			NPVariant *result);
		virtual bool HasProperty(NPIdentifier name);
		virtual bool GetProperty(NPIdentifier name, NPVariant *result);
		virtual bool SetProperty(NPIdentifier name, const NPVariant *value);
		virtual bool RemoveProperty(NPIdentifier name);
		virtual bool Enumerate(NPIdentifier **identifier, uint32_t *count);
		virtual bool Construct(const NPVariant *args, uint32_t argCount,
			NPVariant *result);

	public:
		static void _Deallocate(NPObject *npobj);
		static void _Invalidate(NPObject *npobj);
		static bool _HasMethod(NPObject *npobj, NPIdentifier name);
		static bool _Invoke(NPObject *npobj, NPIdentifier name,
			const NPVariant *args, uint32_t argCount,
			NPVariant *result);
		static bool _InvokeDefault(NPObject *npobj, const NPVariant *args,
			uint32_t argCount, NPVariant *result);
		static bool _HasProperty(NPObject * npobj, NPIdentifier name);
		static bool _GetProperty(NPObject *npobj, NPIdentifier name,
			NPVariant *result);
		static bool _SetProperty(NPObject *npobj, NPIdentifier name,
			const NPVariant *value);
		static bool _RemoveProperty(NPObject *npobj, NPIdentifier name);
		static bool _Enumerate(NPObject *npobj, NPIdentifier **identifier,
			uint32_t *count);
		static bool _Construct(NPObject *npobj, const NPVariant *args,
			uint32_t argCount, NPVariant *result);

	protected:
		NPP mNpp;
	};

	#define DECLARE_NPOBJECT_CLASS_WITH_BASE(_class, ctor)                        \
	static NPClass s##_class##_NPClass = {                                        \
	NP_CLASS_STRUCT_VERSION_CTOR,                                               \
	ctor,                                                                       \
	ScriptablePluginObjectBase::_Deallocate,                                    \
	ScriptablePluginObjectBase::_Invalidate,                                    \
	ScriptablePluginObjectBase::_HasMethod,                                     \
	ScriptablePluginObjectBase::_Invoke,                                        \
	ScriptablePluginObjectBase::_InvokeDefault,                                 \
	ScriptablePluginObjectBase::_HasProperty,                                   \
	ScriptablePluginObjectBase::_GetProperty,                                   \
	ScriptablePluginObjectBase::_SetProperty,                                   \
	ScriptablePluginObjectBase::_RemoveProperty,                                \
	ScriptablePluginObjectBase::_Enumerate,                                     \
	ScriptablePluginObjectBase::_Construct                                      \
	}

	#define GET_NPOBJECT_CLASS(_class) &s##_class##_NPClass
}

char* CStringToNPStringCharacters(const CString &str);
CString NPStringToCString(NPString npstr);
