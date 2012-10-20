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

// ElemHideMatcher.h : Matcher for element hiding filters
//

#include "TList.h"
#include <string>
#include <vector>
#include <unordered_map>
#include <unordered_set>

namespace abp {
	class ElemHideFilter;

	class ElemHideMatcher {
	public:
		ElemHideMatcher() { generated = false; m_nFilters = 0; }
		void add(ElemHideFilter* filter);
		void clear();
		void generateGeneralFilters();
		// generates list of CSS content for a particular domain (without general filters)
		std::vector<std::wstring> generateCSSContentForDomain(const std::wstring& domain);
		// get the general CSS content that applys to every page
		const std::vector<std::wstring>& getGeneralCSSContent() const { return generalCSSContent; }

		int getNumberOfFilters() const { return m_nFilters; }
	private:
		struct FilterSetInternal;
		std::vector<ElemHideFilter*> getFiltersForDomain(const std::wstring& domain);
		void getFilterSetForDomain(const std::wstring& domain, FilterSetInternal& filterSet) const;

		std::vector<std::wstring> generateCSSContent(const std::vector<ElemHideFilter*>& filters) const;
		std::wstring generateSingleCSSContent(const std::vector<ElemHideFilter*>& filters, size_t begin, size_t end) const;

		// worth implementing a cache
		std::unordered_map<std::wstring, std::vector<ElemHideFilter*> > resultCache;
		bool queryResultCache(const std::wstring& key, std::vector<ElemHideFilter*>& result) const;
		void putResultCache(const std::wstring& key, const std::vector<ElemHideFilter*>& result);

		// Keep track of number of filters
		int m_nFilters;
		// Filters grouped by active domain
		std::unordered_map<std::wstring, TList<ElemHideFilter*> > filtersByDomain;
		// Exception filters grouped by selector string
		std::unordered_map<std::wstring, TList<ElemHideFilter*> > exceptionFiltersBySelector;
		// Filters that will always match everywhere
		std::vector<ElemHideFilter*> generalFilters;
		// Converted into styles
		std::vector<std::wstring> generalCSSContent;
		bool generated;

		static const size_t maxCacheEntries;
		static const std::wstring hidingStyle;
		static const int selectorGrouping;
	};
} // namespace abp
