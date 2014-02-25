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

// Matcher.cpp : ABP filter matching engine implementation
//

#include "StdAfx.h"

#include "FilterClasses.h"
#include "Matcher.h"
#include "StringUtils.h"

using namespace abp;
using namespace re;
using namespace Utils;
using namespace Utils::String;

static const wstring strEmpty = L"";

/**
 * Adds a filter to the matcher
 */
void Matcher::add(RegExpFilter* filter)
{
	if (keywordByFilter.find(filter) != keywordByFilter.end())
		return;

	// Look for a suitable keyword
	wstring keyword = findKeyword(filter);
	FList& flist = filterByKeyword[keyword];
	flist.push_back(filter);

	keywordByFilter[filter] = keyword;
}

/**
 * Removes a filter from the matcher
 */
void Matcher::remove(RegExpFilter* filter)
{
	auto iter = keywordByFilter.find(filter);
	if (iter == keywordByFilter.end()) return;

	wstring keyword = iter->second;
	FList& flist = filterByKeyword[keyword];
	flist.remove(filter);
	if (flist.size() == 0)
		filterByKeyword.erase(keyword);

	keywordByFilter.erase(iter);
}

namespace abp { namespace funcStatic { namespace Matcher_findKeyword {
	// pre-compiled to speed up the process
	static const RegExp re1 = L"/[^a-z0-9%*][a-z0-9%]{3,}(?=[^a-z0-9%*])/g";

	static const wstring strDoNotTrack = L"donottrack";
	static const wstring strAtAt = L"@@";
} } } // namespace abp::funcStatic::Matcher_findKeyword

/**
 * Chooses a keyword to be associated with the filter
 */
wstring Matcher::findKeyword(RegExpFilter* filter) const
{
	using namespace funcStatic::Matcher_findKeyword;

	// For donottrack filters use "donottrack" as keyword if nothing else matches
	wstring defaultResult = (filter->getContentType() & DONOTTRACK) ? strDoNotTrack : strEmpty;

	wstring text = filter->getText();
	if (Filter::regexpRegExp.test(text))
		return defaultResult;

	// Remove options
	RegExpMatch match;
	if (Filter::optionsRegExp.exec(match, text))
	{
		text = match.input.substr(0, match.index);
	}

	// Remove whitelist marker
	if (startsWith(text, strAtAt))
		text = text.substr(2);

	if (!String::match(match, toLowerCase(text), re1))
		return defaultResult;

	const std::vector<wstring>& candidates = match.substrings;
	const unordered_map<wstring, FList>& hash = filterByKeyword;
	wstring result = defaultResult;
	int resultCount = 0xFFFFFF;
	int resultLength = 0;
	for (size_t i = 0; i < candidates.size(); i++)
	{
		wstring candidate = candidates[i].substr(1);
		auto iter = hash.find(candidate);
		int count = (iter != hash.end()) ? (int)iter->second.size() : 0;
		if (count < resultCount || (count == resultCount && (int)candidate.length() > resultLength))
		{
			result = candidate;
			resultCount = count;
			resultLength = (int)candidate.length();
		}
	}

	return result;
}

/**
 * Checks whether a particular filter is being matched against.
 */
bool Matcher::hasFilter(RegExpFilter* filter) const
{
	return keywordByFilter.find(filter) != keywordByFilter.end();
}


/**
 * Returns the keyword used for a filter, null for unknown filters.
 */
wstring Matcher::getKeywordForFilter(RegExpFilter* filter) const
{
	auto iter = keywordByFilter.find(filter);
	if (iter != keywordByFilter.end())
		return iter->second;
	return strEmpty;
}

/**
 * Checks whether the entries for a particular keyword match a URL
 */
RegExpFilter* Matcher::checkEntryMatch(const wstring& keyword, const wstring& location,
	ContentType_T contentType, const wstring& docDomain, bool thirdParty) const
{
	auto iter = filterByKeyword.find(keyword);
	if (iter == filterByKeyword.end()) return NULL;

	const FList& flist = iter->second;
	for (unsigned int i = 0; i < flist.size(); i++)
	{
		RegExpFilter* filter = flist[i];
		if (filter->matches(location, contentType, docDomain, thirdParty))
			return filter;
	}
	return NULL;
}

namespace abp { namespace funcStatic { namespace Matcher_matchesAny {
	// pre-compiled to speed up the process
	static const RegExp re1 = L"/[a-z0-9%]{3,}/g";

	static const wstring strDoNotTrack = L"donottrack";
} } } // namespace abp::funcStatic::Matcher_matchesAny

/**
 * Tests whether the URL matches any of the known filters
 */
RegExpFilter* Matcher::matchesAny(const wstring& location, ContentType_T contentType,
	const wstring& docDomain, bool thirdParty) const
{
	using namespace funcStatic::Matcher_matchesAny;

	RegExpMatch candidateMatch;
	bool ret = match(candidateMatch, toLowerCase(location), re1);
	vector<wstring> candidates;
	if (ret) candidates = std::move(candidateMatch.substrings);

	RegExpFilter* res = NULL;
	if (contentType & DONOTTRACK)
	{
		res = checkEntryMatch(strDoNotTrack, location, contentType, docDomain, thirdParty);
		if (res) return res;
	}
	for (size_t i = 0; i < candidates.size(); i++)
	{
		res = checkEntryMatch(candidates[i], location, contentType, docDomain, thirdParty);
		if (res) return res;
	}
	if ((contentType & DONOTTRACK) == 0)
	{
		res = checkEntryMatch(strEmpty, location, contentType, docDomain, thirdParty);
	}
	return res;
}

const size_t CombinedMatcher::maxCacheEntries = 10000;

bool CombinedMatcher::queryResultCache(const wstring& key, RegExpFilter*& result) const
{
	Lock lock(mtCache);
	auto iter = resultCache.find(key);
	if (iter == resultCache.end()) return false;
	result = iter->second;
	return true;
}

void CombinedMatcher::putResultCache(const wstring& key, RegExpFilter* result)
{
	Lock lock(mtCache);
	if (cacheEntries >= maxCacheEntries)
		resultCache.clear();
	resultCache[key] = result;
	cacheEntries = resultCache.size();
}

void CombinedMatcher::clear()
{
	blacklist.clear();
	whitelist.clear();
	keys.clear();
	resultCache.clear();
	cacheEntries = 0;
}

void CombinedMatcher::add(RegExpFilter* filter)
{
	if (!filter) return;
	if (filter->isException())
	{
		// can safely cast to WhitelistFilter
		WhitelistFilter* wf = static_cast<WhitelistFilter*>(filter);
		const vector<wstring>& siteKeys = wf->getSiteKeys();
		if (siteKeys.size())
		{
			for (size_t i = 0; i < siteKeys.size(); i++)
			{
				keys[siteKeys[i]] = filter->getText();
			}
		}
		else
			whitelist.add(filter);
	}
	else
		blacklist.add(filter);

	if (cacheEntries > 0)
	{
		resultCache.clear();
		cacheEntries = 0;
	}
}

void CombinedMatcher::remove(RegExpFilter* filter)
{
	if (filter->isException())
	{
		// can safely cast to WhitelistFilter
		WhitelistFilter* wf = static_cast<WhitelistFilter*>(filter);
		const vector<wstring>& siteKeys = wf->getSiteKeys();
		if (siteKeys.size())
		{
			for (size_t i = 0; i < siteKeys.size(); i++)
			{
				keys.erase(siteKeys[i]);
			}
		}
		else
			whitelist.remove(filter);
	}
	else
		blacklist.remove(filter);

	if (cacheEntries > 0)
	{
		resultCache.clear();
		cacheEntries = 0;
	}
}

wstring CombinedMatcher::findKeyword(RegExpFilter* filter) const
{
	if (filter->isException())
		return whitelist.findKeyword(filter);
	else
		return blacklist.findKeyword(filter);
}

bool CombinedMatcher::hasFilter(RegExpFilter* filter) const
{
	if (filter->isException())
		return whitelist.hasFilter(filter);
	else
		return blacklist.hasFilter(filter);
}

wstring CombinedMatcher::getKeywordForFilter(RegExpFilter* filter) const
{
	if (filter->isException())
		return whitelist.getKeywordForFilter(filter);
	else
		return blacklist.getKeywordForFilter(filter);
}

RegExpFilter* CombinedMatcher::checkCandidateInternal(const wstring& keyword, const wstring& location,
	ContentType_T contentType, const wstring& docDomain, bool thirdParty,
	RegExpFilter*& blacklistHit) const
{
	RegExpFilter* whitelistHit = whitelist.checkEntryMatch(keyword, location, contentType,
		docDomain, thirdParty);
	if (whitelistHit) return whitelistHit;

	if (!blacklistHit)
		blacklistHit = blacklist.checkEntryMatch(keyword, location, contentType, docDomain, thirdParty);
	return NULL;
}

namespace abp { namespace funcStatic { namespace CombinedMatcher_matchesAnyInternal {
	// pre-compiled to speed up the process
	static const RegExp re1 = L"/[a-z0-9%]{3,}/g";

	static const wstring strDoNotTrack = L"donottrack";
} } } // namespace abp::funcStatic::CombinedMatcher_matchesAnyInternal

/**
 * Optimized filter matching testing both whitelist and blacklist matchers
 * simultaneously. For parameters see Matcher.matchesAny().
 */
RegExpFilter* CombinedMatcher::matchesAnyInternal(const wstring& location, ContentType_T contentType,
	const wstring& docDomain, bool thirdParty) const
{
	using namespace funcStatic::CombinedMatcher_matchesAnyInternal;

	RegExpMatch candidateMatch;
	bool ret = match(candidateMatch, toLowerCase(location), re1);
	vector<wstring> candidates;
	if (ret) candidates = std::move(candidateMatch.substrings);

	RegExpFilter* blacklistHit = NULL;
	RegExpFilter* result = NULL;
	if (contentType & DONOTTRACK)
	{
		result = checkCandidateInternal(strDoNotTrack, location, contentType,
			docDomain, thirdParty, blacklistHit);
		if (result) return result;
	}
	for (size_t i = 0; i < candidates.size(); i++)
	{
		result = checkCandidateInternal(candidates[i], location, contentType,
			docDomain, thirdParty, blacklistHit);
		if (result) return result;
	}
	if ((contentType & DONOTTRACK) == 0)
	{
		result = checkCandidateInternal(strEmpty, location, contentType,
			docDomain, thirdParty, blacklistHit);
		if (result) return result;
	}
	return blacklistHit;
}

RegExpFilter* CombinedMatcher::matchesAny(const wstring& location, ContentType_T contentType,
	const wstring& docDomain, bool thirdParty)
{
	wstring key = location;
	key.push_back(L' ');
	key.append(RegExpFilter::getReverseTypeMap().at(contentType));
	key.push_back(L' ');
	key.append(docDomain);
	key.push_back(L' ');
	key.append(thirdParty ? L"true" : L"false");

	RegExpFilter* result;
	if (queryResultCache(key, result)) return result;
#ifdef MATCHER_PERF
	DWORD startTick = GetTickCount();
#endif

	result = matchesAnyInternal(location, contentType, docDomain, thirdParty);

#ifdef MATCHER_PERF
	// we only need the correct value at the end of the program,
	// so no locking is needed
	InterlockedExchangeAdd(&matchTicks, GetTickCount() - startTick);
	InterlockedIncrement(&matchCount);
	InterlockedExchangeAdd(&matchURLLen, (unsigned int)location.length());
#endif
	
	putResultCache(key, result);
	return result;
}

RegExpFilter* CombinedMatcher::matchesByKey(const wstring& location, const wstring& key,
	const wstring& docDomain) const
{
	wstring ukey = toUpperCase(key);
	auto iter = keys.find(ukey);
	if (iter != keys.end())
	{
		const unordered_map<wstring, Filter*>& knownFilters = Filter::getKnownFilters();
		auto iterKnownFilter = knownFilters.find(iter->second);
		if (iterKnownFilter != knownFilters.end())
		{
			return iterKnownFilter->second->toRegExpFilter();
		}
	}
	return NULL;
}
