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

// comfix.h : Work around browser hang issues related to QQ ActiveX controls
//

namespace Plugin
{
	class COMFix {
	private:
		static const TCHAR* s_astrCLSID[];
		static const int s_cntCLSID;

		static bool ifNeedFixForCLSID(const TCHAR* clsid);
		static void doFixForCLSID(const TCHAR* clsid);

		static bool queryValueForSubkey(const TCHAR* subkey);
		static void setValueForSubkey(const TCHAR* subkey);
	public:
		static bool ifNeedFix();
		static void doFix();
	};

} // namespace Plugin
