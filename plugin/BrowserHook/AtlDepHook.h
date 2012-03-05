/*
This file is part of Fire-IE.

Fire-IE is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Fire-IE is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with Fire-IE.  If not, see <http://www.gnu.org/licenses/>.
*/
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
		AtlDepHook(void){}
		~AtlDepHook(void){}
	};
}

