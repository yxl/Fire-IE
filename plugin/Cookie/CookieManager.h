#pragma once

namespace Cookie
{
	class CookieManager
	{
	public:
	    // Single instance of the CookieManager for use in the plugin.
		static CookieManager s_instance;
	private:
		CookieManager(void){}
		~CookieManager(void){}	
	};
}
