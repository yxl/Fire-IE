#include "StdAfx.h"
#include "OS.h"

namespace Utils
{

	OS::OS(void)
	{
	}


	OS::~OS(void)
	{
	}

	OS::Version OS::s_version = OS::UNKNOWN;
	int OS::s_ieversion = 0;

	OS::Version OS::GetVersion() 
	{
		if (s_version != UNKNOWN)
		{
			return s_version;
		}
		s_version = NOT_SUPPORTED;
		OSVERSIONINFOEX versionInfo;
		versionInfo.dwOSVersionInfoSize = sizeof versionInfo;
		GetVersionEx(reinterpret_cast<OSVERSIONINFO*>(&versionInfo));
		if (versionInfo.dwMajorVersion == 5) 
		{
			switch (versionInfo.dwMinorVersion) 
			{
			case 0:
				s_version = NOT_SUPPORTED; // Win2000
				break;
			case 1:
				s_version = WINXP;
				break;
			default:
				s_version = WIN2003;
				break;
			}
		} 
		else if (versionInfo.dwMajorVersion == 6) 
		{

			if (versionInfo.dwMinorVersion == 0) 
			{
				s_version = VISTA;
			} 
			else 
			{
				s_version = WIN7;
			}

		} 
		else if (versionInfo.dwMajorVersion > 6) 
		{
			s_version = WIN7;
		}
		return s_version;
	}

	int OS::GetIEVersion()
	{
		if (s_ieversion)
			return s_ieversion;

		return s_ieversion = GetIEVersionFromRegistry();
	}

	int OS::GetIEVersionFromRegistry()
	{
		int version = 6;

		HKEY hkey;
		if (ERROR_SUCCESS == RegOpenKeyEx(HKEY_LOCAL_MACHINE, _T("Software\\Microsoft\\Internet Explorer"), 0,
			KEY_QUERY_VALUE, &hkey))
		{
			const int BUFFER_LEN = 50;
			TCHAR cstrVersion[BUFFER_LEN] = {0};
			DWORD dwSize = sizeof(cstrVersion);

			if (ERROR_SUCCESS == RegQueryValueEx(hkey, _T("Version"), NULL, NULL, (LPBYTE)cstrVersion, &dwSize))
			{
				cstrVersion[BUFFER_LEN - 1] = _T('\0');
				version = _tstoi(cstrVersion);
				if (version >= 9 && ERROR_SUCCESS == RegQueryValueEx(hkey, _T("svcVersion"), NULL, NULL, (LPBYTE)cstrVersion, &dwSize))
				{
					// for IE 10, version equals to "9.10.*.*", which should be handled specially
					// by the way, f**k Microsoft for this u*ly change
					cstrVersion[BUFFER_LEN - 1] = _T('\0');
					version = _tstoi(cstrVersion);
				}
			}

			RegCloseKey(hkey);
		}
		return version;
	}
}
