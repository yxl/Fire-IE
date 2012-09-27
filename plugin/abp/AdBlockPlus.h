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

// AdBlockPlus.h : necessary ABP control routines
//

#include <string>
#include "FilterContentType.h"
#include "Matcher.h"
#include "ElemHideMatcher.h"
#include "RAIILock.h"

class CFile;

namespace abp {

class AdBlockPlus {
public:
	// main control routines, should only be called from main thread
	static void loadFilterFile(const std::wstring& pathname);
	static void reloadFilterFile();
	static void clearFilters();
	static void enable();
	static void disable();
	static int getNumberOfFilters();

	static bool isEnabled() { return s_bEnabled; }

	// query routines
	// Should we load the resource?
	static bool shouldLoad(const std::wstring& location, ContentType_T contentType,
						   const std::wstring& docLocation, bool thirdParty);
	// Should we emit DNT header for the url?
	static bool isDNTEnabled(const std::wstring& location);

	// Retrieve CSS style texts for element hiding filters (excluding general styles)
	static bool getElemHideStyles(const std::wstring& location, std::vector<std::wstring>& out);
	// Retrieve global CSS style texts for element hiding filters
	static const std::vector<std::wstring>& getGlobalElemHideStyles();
private:
	static bool s_bEnabled;
	static std::wstring s_strFilterFile;

	static CombinedMatcher regexpMatcher;
	static ElemHideMatcher elemhideMatcher;

	static void clearFiltersInternal(bool reload = false);

	// asynchronous filter loading
	static unsigned int asyncLoader(void* ppathname);

	// file reading utilities
	static bool readFile(CFile& file, std::wstring& content);
	static bool readUTF8OrANSI(CFile& file, std::wstring& content);
	static bool readANSI(CFile& file, std::wstring& content);
	static bool readUTF8(CFile& file, std::wstring& content, bool skipBOM = true);
	static bool readUnicode(CFile& file, std::wstring& content);
	static bool readUnicodeBigEndian(CFile& file, std::wstring& content);

	static const ULONGLONG FILE_SIZE_LIMIT;

	// used internally for synchronization
	static ReaderWriterMutex s_mutex;

	static const std::vector<std::wstring> vEmpty;
};

} // namespace abp
