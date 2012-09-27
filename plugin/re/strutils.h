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

// strutils.h : wstring utilities
//

#include <string>

namespace re {
	class RegExp;
	struct RegExpMatch;

	namespace strutils {
		inline bool startsWith(const std::wstring& base, const std::wstring& str)
		{
			return base.length() >= str.length() && base.substr(0, str.length()) == str;
		}
		inline bool endsWith(const std::wstring& base, const std::wstring& str)
		{
			return base.length() >= str.length() && base.substr(base.length() - str.length()) == str;
		}
		inline bool startsWithChar(const std::wstring& base, wchar_t ch)
		{
			return base.length() && base.front() == ch;
		}
		inline bool endsWithChar(const std::wstring& base, wchar_t ch)
		{
			return base.length() && base.back() == ch;
		}

		std::wstring replace(const std::wstring& base, const RegExp& re, const std::wstring& str);
		std::vector<std::wstring> split(const std::wstring& base, const std::wstring& separator);
		RegExpMatch* match(const std::wstring& base, const RegExp& re);
		std::wstring toUpperCase(std::wstring str);
		std::wstring toLowerCase(std::wstring str);
	}
}
