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

// File.h : file reading utilities
//

namespace Utils {
	// file reading utilities
	class File {
	public:
		static bool readFile(CFile& file, std::wstring& content);

		static bool readUTF8OrANSI(CFile& file, std::wstring& content);
		static bool readANSI(CFile& file, std::wstring& content);
		static bool readUTF8(CFile& file, std::wstring& content, bool skipBOM = true);
		static bool readUnicode(CFile& file, std::wstring& content);
		static bool readUnicodeBigEndian(CFile& file, std::wstring& content);

		static const ULONGLONG FILE_SIZE_LIMIT;
	};
} // namespace Utils
