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

	// performance monitoring
	static int getNumberOfFilters();
	static int getNumberOfActiveFilters();
	static unsigned int getLoadTicks() { return s_loadTicks; }

	static bool isEnabled() { return s_bEnabled; }
	static bool isLoading() { return s_bLoading; }
	static const std::wstring& getLoadedFile() { return s_strFilterFile; }

	// query routines
	// Should we load the resource?
	static bool shouldLoad(const std::wstring& location, ContentType_T contentType,
						   const std::wstring& docLocation, bool thirdParty);
	// Should we emit DNT header for the url?
	static bool shouldSendDNTHeader(const std::wstring& location);

	// Retrieve CSS style texts for element hiding filters (excluding general styles)
	static bool getElemHideStyles(const std::wstring& location, std::vector<std::wstring>& out);
	// Retrieve global CSS style texts for element hiding filters
	static const std::vector<std::wstring>& getGlobalElemHideStyles();
#ifdef MATCHER_PERF
	static void showPerfInfo() { regexpMatcher.showPerfInfo(); }
#endif
private:
	static bool s_bEnabled;
	static bool s_bLoading;

	static unsigned int s_loadStartTick;
	static unsigned int s_loadTicks;

	static std::wstring s_strFilterFile;
	static std::wstring s_strLoadingFile;

	static CombinedMatcher regexpMatcher;
	static ElemHideMatcher elemhideMatcher;

	static void clearFiltersInternal(bool reload = false);

	// asynchronous filter loading
	static unsigned int asyncLoader(void* ppathname);

	// should be called on main thread
	static void filterLoadedCallback(bool loaded);

	// used internally for synchronization
	static ReaderWriterMutex s_mutex;

	static const std::vector<std::wstring> vEmpty;
};

} // namespace abp
