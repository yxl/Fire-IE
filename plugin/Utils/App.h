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

// App.h : App related information

namespace Utils
{
	class App {
	public:
		enum Application {
			UNKNOWN,
			FIREFOX,
			PALEMOON,
			WATERFOX,
			OOPP,
			UNRECOGNIZED_APP
		};

		static Application GetApplication();
		static CString GetProcessName();
		static uint32_t GetProcessId();
		static CString GetModulePath();
	private:
		static Application s_app;
		static CString s_strProcessName;
		static CString s_strModulePath;

		static HMODULE WINAPI ModuleFromAddress(PVOID pv);
		static HMODULE GetThisModule();
	};
} // namespace Utils
