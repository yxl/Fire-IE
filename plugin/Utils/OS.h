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
			NOT_SUPPORTED  // Windows 2000及以下
		};

		/**
		 * 获取操作系统版本
		 */
		static Version GetVersion();

		/**
		 * 获取IE主版本号
		 */
		static int GetIEVersion();
	private:
		static Version s_version;
		static int s_ieversion;
	};

}
