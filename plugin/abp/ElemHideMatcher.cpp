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

// ElemHideMatcher.cpp : Matcher for element hiding filters
//

#include "StdAfx.h"

#include "ElemHideMatcher.h"
#include "FilterClasses.h"
#include "StringUtils.h"

using namespace abp;
using namespace Utils;
using namespace Utils::String;

const size_t ElemHideMatcher::maxCacheEntries = 1000;
const wstring ElemHideMatcher::hidingStyle = L"{display:none!important;}";
// Due to IE's 4096 selectors limit per <style> or <link rel="stylesheet">
const int ElemHideMatcher::selectorGrouping = 4000;

namespace abp {
	// Hash function based on ElemHideFilter::selector
	class ElemHideSelectorHasher : public unary_function<ElemHideFilter*, size_t> {
	public:
		size_t operator()(ElemHideFilter* filter) const
		{
			return hasher(filter->getSelector());
		}
	private:
		static const hash<wstring> hasher;
	};

	const hash<wstring> ElemHideSelectorHasher::hasher;

	// Equality function based on ElemHideFilter::selector
	class ElemHideSelectorEqualTo : public binary_function<ElemHideFilter*, ElemHideFilter*, bool> {
	public:
		bool operator()(ElemHideFilter* filterLeft, ElemHideFilter* filterRight) const
		{
			return filterLeft == filterRight || filterLeft->getSelector() == filterRight->getSelector();
		}
	};

	struct ElemHideMatcher::FilterSetInternal {
		unordered_set<ElemHideFilter*, ElemHideSelectorHasher, ElemHideSelectorEqualTo> selectors;
	};
} // namespace abp

// Add an ElemHideFilter
void ElemHideMatcher::add(ElemHideFilter* filter)
{
	if (generated) return;

	if (filter->isException())
	{
		exceptionFiltersBySelector[filter->getSelector()].push_back(filter);
	}
	else
	{
		const map<wstring, bool>& domains = filter->getDomains();
		if (!domains.size())
			filtersByDomain[L""].push_back(filter);
		else
		{
			for (auto iter = domains.begin(); iter != domains.end(); ++iter)
			{
				if (iter->second)
					filtersByDomain[iter->first].push_back(filter);
			}
		}
	}
	m_nFilters++;
}

// Clear all filters
void ElemHideMatcher::clear()
{
	resultCache.clear();
	filtersByDomain.clear();
	exceptionFiltersBySelector.clear();
	generalFilters.clear();
	generalCSSContent.clear();
	generated = false;
	m_nFilters = 0;
}

// Usually called at the end of the insertion step to optimize matching speed
// Should not add any more filters after calling this and before calling clear()
void ElemHideMatcher::generateGeneralFilters()
{
	if (generated) return;

	auto iter = filtersByDomain.find(L"");
	if (iter != filtersByDomain.end())
	{
		TList<ElemHideFilter*>& filters = iter->second;
		vector<ElemHideFilter*> newFilters;
		for (unsigned int i = 0; i < filters.size(); i++)
		{
			ElemHideFilter* filter = filters[i];
			if (filter->getDomains().size() ||
				exceptionFiltersBySelector.find(filter->getSelector()) != exceptionFiltersBySelector.end())
			{
				// not active on all domains, keep in list
				newFilters.push_back(filter);
			}
			else
			{
				// put in general filters list
				generalFilters.push_back(filter);
			}
		}
		// replace original filters for "" domain
		filters = std::move(newFilters);
	}
	generalCSSContent = generateCSSContent(generalFilters);
	generated = true;
}

vector<wstring> ElemHideMatcher::generateCSSContent(const vector<ElemHideFilter*>& filters) const
{
	vector<wstring> result;
	// Due to IE's 4096 selectors limit per <style> or <link rel="stylesheet">
	// We have to group them into separate <style> blocks
	for (int i = 0; i < (int)filters.size(); i += selectorGrouping)
	{
		int end = i + selectorGrouping;
		if (end > (int)filters.size()) end = (int)filters.size();
		result.push_back(generateSingleCSSContent(filters, i, end));
	}
	return result;
}

wstring ElemHideMatcher::generateSingleCSSContent(const vector<ElemHideFilter*>& filters, size_t begin, size_t end) const
{
	wstring result;
	size_t length = 0;
	// calculate needed size for the string, avoiding reallocations
	for (size_t i = begin; i < end; i++)
	{
		length += filters[i]->getSelector().size() + hidingStyle.size();
	}
	// assemble the selectors and styles together
	result.reserve(length);
	for (size_t i = begin; i < end; i++)
	{
		result.append(filters[i]->getSelector()).append(hidingStyle);
	}
	return result;
}

vector<wstring> ElemHideMatcher::generateCSSContentForDomain(const wstring& domain)
{
	return generateCSSContent(getFiltersForDomain(domain));
}

// Retrieve all filters active on a particular domain
vector<ElemHideFilter*> ElemHideMatcher::getFiltersForDomain(const wstring& aDomain)
{
	wstring domain = toUpperCase(aDomain);
	vector<ElemHideFilter*> result;

	if (queryResultCache(domain, result))
		return result;

	FilterSetInternal filterSet;
	getFilterSetForDomain(domain, filterSet);

	result.assign(filterSet.selectors.begin(), filterSet.selectors.end());

	putResultCache(domain, result);
	return result;
}

void ElemHideMatcher::getFilterSetForDomain(const wstring& aDomain, FilterSetInternal& filterSet) const
{
	auto& selectors = filterSet.selectors;
	wstring domain = aDomain;
	while (true)
	{
		auto iter = filtersByDomain.find(domain);
		if (iter != filtersByDomain.end())
		{
			const TList<ElemHideFilter*>& filters = iter->second;
			for (unsigned int i = 0; i < filters.size(); i++)
			{
				ElemHideFilter* filter = filters[i];
				auto iterSelector = selectors.find(filter);
				if (iterSelector != selectors.end())
					continue; // already have same selector

				if (!filter->isActiveOnDomain(aDomain))
					continue; // not active

				auto iterExcept = exceptionFiltersBySelector.find(filter->getSelector());
				if (iterExcept != exceptionFiltersBySelector.end())
				{
					const TList<ElemHideFilter*>& exceptionFilters = iterExcept->second;
					bool bContinue = false;
					for (unsigned int i = 0; i < exceptionFilters.size(); i++)
					{
						if (exceptionFilters[i]->isActiveOnDomain(aDomain))
						{
							bContinue = true;
							break;
						}
					}
					if (bContinue) continue; // met an exception filter
				}

				// passes all tests, add to the result
				selectors.insert(filter);
			}
		}

		if (!domain.length()) break;

		size_t nextDot = domain.find(L'.');
		if (nextDot != wstring::npos)
			domain = domain.substr(nextDot + 1);
		else domain.clear();
	}
}

bool ElemHideMatcher::queryResultCache(const wstring& key, vector<ElemHideFilter*>& result) const
{
	auto iter = resultCache.find(key);
	if (iter != resultCache.end())
	{
		result = iter->second;
		return true;
	}
	return false;
}

void ElemHideMatcher::putResultCache(const wstring& key, const vector<ElemHideFilter*>& result)
{
	if (resultCache.size() >= maxCacheEntries)
		resultCache.clear(); // TODO: use LRU cache instead

	resultCache[key] = result;
}
