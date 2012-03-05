#pragma once
namespace Cookie
{
	class CookieManager
	{
	public:
		static CookieManager s_instance;
	private:
		CookieManager(void){}
		~CookieManager(void){}
	};
}
