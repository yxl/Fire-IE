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
			NOT_SUPPORTED  // Windows 2000������
		};

		/**
		 * ��ȡ����ϵͳ�汾
		 */
		static Version GetVersion();

		/**
		 * ��ȡIE���汾��
		 */
		static int GetIEVersion();
	private:
		static Version s_version;
		static int s_ieversion;

		static int GetIEVersionFromRegistry();
	};

}
