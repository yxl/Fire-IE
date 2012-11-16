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
		static const CString s_astrCLSID[];
		static const int s_cntCLSID;

		static void doFixForCLSID(const CString& clsid);
		static void setValueForSubkey(const CString& subkey);
	public:
		static void doFix();
	};

} // namespace Plugin
