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

// AdBlockPlus.cpp : necessary ABP control routines
//

#include "StdAfx.h"

#include "AdBlockPlus.h"
#include "Matcher.h"
#include "FilterClasses.h"
#include "re/RegExp.h"
#include "re/strutils.h"
#include "URL.h"
#include "File.h"
#include "IEHostWindow.h"
#include "PrefManager.h"
#include <map>
#include <unordered_set>

using namespace abp;
using namespace std;
using namespace re;
using namespace strutils;

CombinedMatcher AdBlockPlus::regexpMatcher;
ElemHideMatcher AdBlockPlus::elemhideMatcher;

wstring AdBlockPlus::s_strFilterFile = L"";
wstring AdBlockPlus::s_strLoadingFile = L"";

bool AdBlockPlus::s_bEnabled = false;
bool AdBlockPlus::s_bLoading = false;

unsigned int AdBlockPlus::s_loadStartTick = 0;
unsigned int AdBlockPlus::s_loadTicks = 0;

// synchronization
ReaderWriterMutex AdBlockPlus::s_mutex;

const vector<wstring> AdBlockPlus::vEmpty;

void AdBlockPlus::clearFilters()
{
	disable();
	s_strFilterFile.clear();
	WriterLock wl(s_mutex);
	clearFiltersInternal();
}

void AdBlockPlus::clearFiltersInternal(bool reload)
{
	// do the clean up
	regexpMatcher.clear();
	elemhideMatcher.clear();
	if (!reload) // keep filters during reload to speed up
		Filter::clearKnownFilters();
}

void AdBlockPlus::enable()
{
	// protection: dangerous to enable while still loading
	if (s_bLoading)
		return;
	s_bEnabled = true;
}

void AdBlockPlus::disable()
{
	s_bEnabled = false;
}

void AdBlockPlus::reloadFilterFile()
{
	loadFilterFile(s_strFilterFile);
}

void AdBlockPlus::loadFilterFile(const wstring& pathname)
{
	s_loadStartTick = GetTickCount();
	disable();
	s_strLoadingFile = pathname;
	s_bLoading = true;
	wstring* pstr = new wstring(pathname);
	AfxBeginThread(asyncLoader, reinterpret_cast<void*>(pstr));
}

void AdBlockPlus::filterLoadedCallback(bool loaded)
{
	s_bLoading = false;
	if (loaded)
		s_strFilterFile = s_strLoadingFile;
	s_loadTicks = GetTickCount() - s_loadStartTick;
}

bool AdBlockPlus::shouldLoad(const wstring& location, ContentType_T contentType,
							 const wstring& docLocation, bool thirdParty)
{
	if (!s_bEnabled) return true;

	Utils::URLTokenizer tokens(docLocation);

	ReaderLock rl(s_mutex);

	// Check document whitelist rules
	RegExpFilter* docFilter = regexpMatcher.matchesAny(docLocation, DOCUMENT, tokens.domain, false);
	if (docFilter && docFilter->isException())
		return true;

	// Check regular filters
	RegExpFilter* filter = regexpMatcher.matchesAny(location, contentType, tokens.domain, thirdParty);
	return !filter || filter->isException();
}

bool AdBlockPlus::shouldSendDNTHeader(const wstring& location)
{
	if (PrefManager::instance().isDNTEnabled() && PrefManager::instance().getDNTValue() == 1) return true;
	if (!s_bEnabled) return false;

	ReaderLock rl(s_mutex);

	RegExpFilter* filter = regexpMatcher.matchesAny(location, DONOTTRACK, L"", false);
	return filter && !filter->isException();
}

int AdBlockPlus::getNumberOfFilters()
{
	return (int)Filter::getKnownFilters().size();
}

int AdBlockPlus::getNumberOfActiveFilters()
{
	return regexpMatcher.getNumberOfFilters() + elemhideMatcher.getNumberOfFilters();
}

bool AdBlockPlus::getElemHideStyles(const wstring& location, vector<wstring>& out)
{
	if (!s_bEnabled) return false;

	// Don't need any lock here -- access is from main thread only

	// Check whether we are allowed to hide elements on this page
	Utils::URLTokenizer tokens(location);
	// Check document exception rules
	RegExpFilter* docFilter = regexpMatcher.matchesAny(location, DOCUMENT, tokens.domain, false);
	if (docFilter && docFilter->isException())
		return false;
	// Check elemhide exception rules
	docFilter = regexpMatcher.matchesAny(location, ELEMHIDE, tokens.domain, false);
	if (docFilter && docFilter->isException())
		return false;

	// Query elemhideMatcher to get the list of style text
	out = elemhideMatcher.generateCSSContentForDomain(tokens.domain);
	return true;
}

const vector<wstring>& AdBlockPlus::getGlobalElemHideStyles()
{
	if (!s_bEnabled) return vEmpty;

	return elemhideMatcher.getGeneralCSSContent();
}

// pattern.ini parsing
namespace abp {
	class INIParser {
	public:
		enum Section {
			OTHER,
			FILTER,
			PATTERN,
			SUBSCRIPTION,
			SUBSCRIPTION_FILTERS,
			SUBSCRIPTION_PATTERNS,
			USER_PATTERNS
		};

		INIParser() : wantObj(false), subscriptionDisabled(false),
			curSection(OTHER) {}
		void process(const wstring& line, bool eof);
		unordered_set<ActiveFilter*, ActiveFilter::Hasher, ActiveFilter::EqualTo> filters;

		static map<wstring, Section> sectionMapper;
	private:
		class SectionMapperInit {
		public:
			SectionMapperInit()
			{
				RegExp re = L"/_/";
#define DEFSECTION(section) sectionMapper[replace(toLowerCase(L#section), re, L" ")] = section
				DEFSECTION(OTHER);
				DEFSECTION(FILTER);
				DEFSECTION(PATTERN);
				DEFSECTION(SUBSCRIPTION);
				DEFSECTION(SUBSCRIPTION_FILTERS);
				DEFSECTION(SUBSCRIPTION_PATTERNS);
				DEFSECTION(USER_PATTERNS);
			}
		};
		static SectionMapperInit init;

		bool wantObj;
		bool subscriptionDisabled;
		Section curSection;
		map<wstring, wstring> curObj;
		vector<wstring> curList;
		unordered_set<Filter*, Filter::Hasher, Filter::EqualTo> persistedFilters;
	};

	map<wstring, INIParser::Section> INIParser::sectionMapper;
	INIParser::SectionMapperInit INIParser::init;

	void INIParser::process(const wstring& line, bool eof)
	{
		static const RegExp re1 = L"/^(\\w+)=(.*)$/";
		static const RegExp re2 = L"/^\\s*\\[(.+)\\]\\s*$/";
		static const RegExp re3 = L"/\\\\\\[/g";

		static const wstring strDisabled = L"disabled";
		static const wstring strTrue = L"true";
		static const wstring strLeftBracket = L"[";

		RegExpMatch match;
		bool ret = false;
		if (wantObj && re1.exec(match, line))
		{
			curObj[match.substrings[1]] = match.substrings[2];
		}
		else if (eof || (ret = re2.exec(match, line)))
		{
			wstring strSection;
			if (ret)
			{
				strSection = toLowerCase(match.substrings[1]);
			}
			if (wantObj ? curObj.size() : curList.size())
			{
				// Process current object before going to next section
				switch (curSection)
				{
				case FILTER:
				case PATTERN:
					// create the filter, with certain properties set up
					// do not insert it into the filters set
					// if it's active, it'll be inserted in some subscription we'll later parse
					persistedFilters.insert(Filter::fromObject(curObj));
					break;
				case SUBSCRIPTION:
					// not supported, just record whether the whole subscription is disabled or not
					{
						auto iter = curObj.find(strDisabled);
						subscriptionDisabled =
							iter != curObj.end() && iter->second == strTrue;
					}
					break;
				case SUBSCRIPTION_FILTERS:
				case SUBSCRIPTION_PATTERNS:
				case USER_PATTERNS:
					if (!subscriptionDisabled)
					{
						for (size_t i = 0; i < curList.size(); i++)
						{
							const wstring& text = curList[i];
							Filter* filter = Filter::fromText(text);
							// need to reset the disabled property since we don't clear
							// the global filter list between reloads
							ActiveFilter* activeFilter = filter->toActiveFilter();
							if (activeFilter)
							{
								// Only reset disabled property for those not persisted yet
								if (persistedFilters.find(filter) == persistedFilters.end())
									activeFilter->setDisabled(false);
								// just put the filter in INIParser::filters
								filters.insert(activeFilter);
							}
						}
					}
				}
			}

			if (eof) return;

			auto iter = sectionMapper.find(strSection);
			if (iter != sectionMapper.end())
			{
				curSection = iter->second;
				switch (curSection)
				{
				case FILTER:
				case PATTERN:
				case SUBSCRIPTION:
					wantObj = true;
					curObj.clear();
					break;
				case SUBSCRIPTION_FILTERS:
				case SUBSCRIPTION_PATTERNS:
				case USER_PATTERNS:
				default:
					wantObj = false;
					curList.clear();
				}
			}
		}
		else if (!wantObj && line.length())
		{
			curList.push_back(replace(line, re3, strLeftBracket));
		}
	}
}

unsigned int AdBlockPlus::asyncLoader(void* ppathname)
{
	wstring* pstr = reinterpret_cast<wstring*>(ppathname);
	wstring pathname = *pstr;
	delete pstr;

	bool loaded = false;

	// then load stuff
	CFile file;
	if (file.Open(pathname.c_str(), CFile::modeRead | CFile::shareDenyWrite))
	{
		wstring content;
		bool success = Utils::File::readFile(file, content);
		file.Close();
		if (success)
		{
			WriterLock wl(s_mutex);
			clearFiltersInternal(true);

			INIParser parser;
			
			// split content into lines, process with INIParser one by one
			size_t lastPos = 0;
			wchar_t lastCh = 0;
			for (size_t i = 0; i < content.length(); i++)
			{
				wchar_t ch = content[i];
				// accept CR, LF and CRLF sequence
				if (ch == L'\r' || (ch == L'\n' && lastCh != L'\r'))
				{
					parser.process(content.substr(lastPos, i - lastPos), false);
				}
				if (ch == L'\r' || ch == L'\n')
					lastPos = i + 1;
				lastCh = ch;
			}
			if (lastPos < content.length())
				parser.process(content.substr(lastPos, content.length() - lastPos), false);
			parser.process(L"", true);

			// put everything in INIParser::filters into the matcher
			for (auto iter = parser.filters.begin(); iter != parser.filters.end(); ++iter)
			{
				ActiveFilter* filter = *iter;
				if (!filter || filter->isDisabled()) continue;

				RegExpFilter* regexpFilter = filter->toRegExpFilter();
				if (regexpFilter)
				{
					regexpMatcher.add(regexpFilter);
					continue;
				}

				ElemHideFilter* elemhideFilter = filter->toElemHideFilter();
				if (elemhideFilter)
					elemhideMatcher.add(elemhideFilter);
			}
			// generate the general filter list for elemhideMatcher to improve speed
			elemhideMatcher.generateGeneralFilters();
			loaded = true;
		}
	}

	// Notify main thread about load completion
	CIEHostWindow* pWindow = CIEHostWindow::GetAnyUtilsWindow();
	if (pWindow)
		pWindow->RunAsync([=]
		{
			filterLoadedCallback(loaded);
			pWindow->SendMessage(UserMessage::WM_USER_MESSAGE,
				loaded ? UserMessage::WPARAM_ABP_FILTER_LOADED : UserMessage::WPARAM_ABP_LOAD_FAILURE, 0);
		});
	else
		filterLoadedCallback(loaded);

	return 0;
}
