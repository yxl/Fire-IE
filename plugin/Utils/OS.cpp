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

}
