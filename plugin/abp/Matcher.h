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

// Matcher.h : ABP filter matching engine
//

#include <string>
#include <unordered_map>
#include <vector>
#include "FilterContentType.h"
#include "TList.h"
#include "RAIILock.h"

namespace abp {
	class RegExpFilter;

	/**
	 * Blacklist/whitelist filter matching
	 */
	class Matcher {
	public:
		Matcher() { clear(); }

		void clear() { filterByKeyword.clear(); keywordByFilter.clear(); }
		void add(RegExpFilter* filter);
		void remove(RegExpFilter* filter);
		std::wstring findKeyword(RegExpFilter* filter) const;
		bool hasFilter(RegExpFilter* filter) const;
		std::wstring getKeywordForFilter(RegExpFilter* filter) const;

		RegExpFilter* checkEntryMatch(const std::wstring& keyword, const std::wstring& location,
			ContentType_T contentType, const std::wstring& docDomain, bool thirdParty) const;
		RegExpFilter* matchesAny(const std::wstring& location, ContentType_T contentType,
			const std::wstring& docDomain, bool thirdParty) const;
	private:
		typedef TList<RegExpFilter*> FList;
		std::unordered_map<std::wstring, FList> filterByKeyword;
		std::unordered_map<std::wstring, std::wstring> keywordByFilter;
	};


	/**
	 * Combines a matcher for blocking and exception rules, automatically sorts
	 * rules into two Matcher instances.
	 */
	class CombinedMatcher {
	public:
		CombinedMatcher() { cacheEntries = 0; }

		void clear();
		void add(RegExpFilter* filter);
		void remove(RegExpFilter* filter);
		std::wstring findKeyword(RegExpFilter* filter) const;
		bool hasFilter(RegExpFilter* filter) const;
		std::wstring getKeywordForFilter(RegExpFilter* filter) const;

		RegExpFilter* matchesAny(const std::wstring& location, ContentType_T contentType,
			const std::wstring& docDomain, bool thirdParty);
		RegExpFilter* matchesByKey(const std::wstring& location, const std::wstring& key,
			const std::wstring& docDomain) const;
	private:
		Matcher blacklist;
		Matcher whitelist;

		std::unordered_map<std::wstring, std::wstring> keys;
		// Result cache is worth implementing dispite the fact that it's not naturally thread-safe.
		// In most cases, result cache is accessed only twice for each URL, thus overhead should be minimal.
		// TODO: implement result cache with minimal locking overhead
		std::unordered_map<std::wstring, RegExpFilter*> resultCache;
		size_t cacheEntries;
		Mutex mtCache;
		bool queryResultCache(const std::wstring& key, RegExpFilter*& result) const;
		void putResultCache(const std::wstring& key, RegExpFilter* result);
		void clearResultCacheIfFull();

		RegExpFilter* checkCandidateInternal(const std::wstring& keyword, const std::wstring& location,
			ContentType_T contentType, const std::wstring& docDomain, bool thirdParty,
			RegExpFilter*& blacklistHit) const;
		RegExpFilter* matchesAnyInternal(const std::wstring& location, ContentType_T contentType,
			const std::wstring& docDomain, bool thirdParty) const;

		static const size_t maxCacheEntries;
	};

	extern CombinedMatcher filterMatcher;

} // namespace abp
