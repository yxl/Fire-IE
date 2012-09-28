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

// AdBlockPlus.cpp : necessary ABP control routines
//
#include "StdAfx.h"

#include "AdBlockPlus.h"
#include "Matcher.h"
#include "FilterClasses.h"
#include "re/RegExp.h"
#include "re/strutils.h"
#include "URL.h"
#include "IEHostWindow.h"
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
// do not process files larger than 10MB
const ULONGLONG AdBlockPlus::FILE_SIZE_LIMIT = 10 * (1 << 20);

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
	disable();
	s_strLoadingFile = pathname;
	s_bLoading = true;
	wstring* pstr = new wstring(pathname);
	AfxBeginThread(asyncLoader, reinterpret_cast<void*>(pstr));
}

void AdBlockPlus::_filterLoadedCallback(bool loaded)
{
	s_bLoading = false;
	if (loaded)
		s_strFilterFile = s_strLoadingFile;
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
	RegExpFilter* docFilter = regexpMatcher.matchesAny(location, ELEMHIDE, tokens.domain, false);
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
		unordered_set<Filter*, Filter::Hasher, Filter::EqualTo> filters;

		static map<wstring, Section> sectionMapper;
	private:
		class SectionMapperInit {
		public:
			SectionMapperInit()
			{
				RegExp re = L"/_/";
#define DEFSECTION(section) sectionMapper[replace(toLowerCase(L#section), re, L" ")] = section;
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

		RegExpMatch* match = NULL;
		if (wantObj && (match = re1.exec(line)))
		{
			curObj[match->substrings[1]] = match->substrings[2];
			delete match;
		}
		else if (eof || (match = re2.exec(line)))
		{
			wstring strSection;
			if (match)
			{
				strSection = toLowerCase(match->substrings[1]);
				delete match;
			}
			if (curObj.size())
			{
				// Process current object before going to next section
				switch (curSection)
				{
				case FILTER:
				case PATTERN:
					// create the filter, with certain properties set up
					// after parsing is done, everything in INIParser::filters
					// will be put into the matchers
					filters.insert(Filter::fromObject(curObj));
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
							// need to reset the disabled property since we don't clear
							// the global filter list between reloads
							Filter* filter = Filter::fromText(text);
							ActiveFilter* activeFilter = filter->toActiveFilter();
							if (activeFilter)
								activeFilter->setDisabled(false);
							// just put the filter in INIParser::filters
							filters.insert(filter);
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
		bool success = readFile(file, content);
		file.Close();
		if (success)
		{
			// record filter file path
			s_strFilterFile = pathname;

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
				Filter* filter = *iter;
				if (!filter) continue;

				RegExpFilter* regexpFilter = filter->toRegExpFilter();
				if (regexpFilter)
				{
					if (!regexpFilter->isDisabled())
						regexpMatcher.add(regexpFilter);
					continue;
				}

				ElemHideFilter* elemhideFilter = filter->toElemHideFilter();
				if (elemhideFilter && !elemhideFilter->isDisabled())
					elemhideMatcher.add(elemhideFilter);
			}
			// generate the general filter list for elemhideMatcher to improve speed
			elemhideMatcher.generateGeneralFilters();
			loaded = true;
		}
	}

	// Notify main thread about load completion
	HWND hwndIEHostWindow = CIEHostWindow::GetAnyUtilsHWND();
	if (hwndIEHostWindow)
		PostMessage(hwndIEHostWindow, UserMessage::WM_USER_MESSAGE, loaded ? UserMessage::WPARAM_ABP_FILTER_LOADED : UserMessage::WPARAM_ABP_LOAD_FAILURE, 0);
	return 0;
}

bool AdBlockPlus::readFile(CFile& file, wstring& content)
try
{
	// File encoding signatures
	static const WORD SIG_UNICODE = 0xFEFF; // Unicode (little endian)
	static const WORD SIG_UNICODE_BIG_ENDIAN = 0xFFFE; // Unicode big endian
	static const DWORD SIG_UTF8 = 0xBFBBEF; /*EF BB BF*/ // UTF-8

	// Read the signature from file
	WORD signature = 0;
	if (file.GetLength() >= 2)
	{
		file.Read(&signature, 2);
		file.SeekToBegin();
	}
	// Use different ways to open files with different encodings
	bool success = false;
	if (signature == SIG_UNICODE)
		success = readUnicode(file, content);
	else if (signature == SIG_UNICODE_BIG_ENDIAN)
		success = readUnicodeBigEndian(file, content);
	else if(signature == (SIG_UTF8 & 0xffff))
	{
		if (file.GetLength() >= 3) {
			DWORD sig = 0;
			file.Read(&sig, 3);
			file.SeekToBegin();
			if (sig == SIG_UTF8)
				success = readUTF8(file, content);
			else
			{
				success = readUTF8OrANSI(file, content);
			}
		} else success = readUTF8OrANSI(file, content);
	}
	else 
		success = readUTF8OrANSI(file, content);
	
	return success;
}
catch (...)
{
	TRACE(L"Failed to load filter file.\n");
	return false;
}

bool AdBlockPlus::readUTF8OrANSI(CFile& file, wstring& content)
{
	// try twice, first with UTF8, then fallback to ANSI
	bool success = readUTF8(file, content, false);
	if (!success)
	{
		file.SeekToBegin();
		success = readANSI(file, content);
	}
	return success;
}

bool AdBlockPlus::readANSI(CFile& file, wstring& content)
{
	ULONGLONG contentLength = file.GetLength();
	// Do not process files larger than 10MB
	if (contentLength == 0)
	{
		content = L"";
		return true;
	}
	if (contentLength > FILE_SIZE_LIMIT)
		contentLength = FILE_SIZE_LIMIT;
	char* buffer = new char[(size_t)contentLength];
	file.Read(buffer, (unsigned int)contentLength);

	// We need a code page convertion here
	// Calculate the size of buffer needed
	int newContentLength = MultiByteToWideChar(CP_ACP, 0, 
		buffer, (int)contentLength, NULL, 0);
	if (!newContentLength)
	{
		delete[] buffer;
		return false;
	}
	content.resize(newContentLength);

	// Real convertion
	int size = MultiByteToWideChar(CP_ACP, 0, 
		buffer, (int)contentLength, &content[0], newContentLength);
	delete[] buffer;
	return 0 != size;
}

bool AdBlockPlus::readUTF8(CFile& file, wstring& content, bool skipBOM)
{
	ULONGLONG contentLength = (file.GetLength() - (skipBOM ? 0 : 3));
	if (contentLength <= 0)
	{
		content = L"";
		return true;
	}
	if (contentLength > FILE_SIZE_LIMIT)
		contentLength = FILE_SIZE_LIMIT;
	if (skipBOM) file.Seek(3, CFile::begin);

	char* buffer = new char[(size_t)contentLength];
	file.Read(buffer, (unsigned int)contentLength);

	// We need a code page convertion here
	// Calculate the size of buffer needed
	int newContentLength = MultiByteToWideChar(CP_UTF8, 0, 
		buffer, (int)contentLength, NULL, 0);
	if (!newContentLength)
	{
		delete[] buffer;
		return false;
	}
	content.resize(newContentLength);

	// Real convertion
	int size = MultiByteToWideChar(CP_UTF8, 0, 
		buffer, (int)contentLength, &content[0], newContentLength);
	delete[] buffer;
	return 0 != size;
}

bool AdBlockPlus::readUnicode(CFile& file, wstring& content)
{
	ASSERT(sizeof(wchar_t) == 2); // required by UTF16

	ULONGLONG contentLength = (file.GetLength() - 2) / sizeof(wchar_t);
	if (contentLength <= 0)
	{
		content = L"";
		return true;
	}
	if (contentLength > FILE_SIZE_LIMIT)
		contentLength = FILE_SIZE_LIMIT;
	content.resize((size_t)contentLength);
	file.Seek(2, CFile::begin);

	// Directly put the contents into the wstring
	file.Read(&content[0], (unsigned int)(contentLength * sizeof(wchar_t)));
	
	return true;
}

bool AdBlockPlus::readUnicodeBigEndian(CFile& file, wstring& content)
{
	ASSERT(sizeof(wchar_t) == 2); // required by UTF16

	ULONGLONG contentLength = (file.GetLength() - 2) / sizeof(wchar_t);
	if (contentLength <= 0)
	{
		content = L"";
		return true;
	}
	if (contentLength > FILE_SIZE_LIMIT)
		contentLength = FILE_SIZE_LIMIT;
	content.resize((size_t)contentLength);
	file.Seek(2, CFile::begin);

	// Directly put the contents into the wstring
	file.Read(&content[0], (unsigned int)(contentLength * sizeof(wchar_t)));

	// reverse the bytes in each character
	for (int i = 0; i < (int)contentLength; i++) {
		unsigned int ch = content[i];
		content[i] = (wchar_t)((ch >> 8) | (ch << 8));
	}

	return true;
}
