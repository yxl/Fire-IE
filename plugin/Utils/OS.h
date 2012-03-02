#pragma once

namespace Utils
{
	class OS
	{
	public:
		OS(void);
		~OS(void);

		enum Version
		{
			UNKNOWN,
			WINXP,
			WIN2003,
			VISTA,
			WIN7,
			NOT_SUPPORTED
		};

		static Version GetVersion();

	private:
		static Version s_version;
	};

}
