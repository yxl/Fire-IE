#pragma once
namespace BrowserHook
{
	/**
	* 这个类用于处理DEP问题。在Win7系统中，如果CPU支持DEP保持，在默认
	* 操作系统设置下，加载旧版Alt编译的ActiveX会导致Firefox崩溃。
	*/
	class AtlDepHook
	{
	public:
		static AtlDepHook s_instance;
		void Install(void);
		void Uninstall(void);
	private:
		AtlDepHook(void){};
		~AtlDepHook(void){};
	};
}

