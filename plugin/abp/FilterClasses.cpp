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

// FilterClasses.cpp : ABP filter classes implementation
//

#include "StdAfx.h"

#include "FilterClasses.h"
#include "StringUtils.h"

using namespace abp;
using namespace re;
using namespace Utils;
using namespace Utils::String;

static const wstring strEmpty = L"";

// Regular expression that element hiding filters should match
const RegExp Filter::elemhideRegExp = L"/^([^\\/\\*\\|\\@\"!]*?)#(\\@)?(?:([\\w\\-]+|\\*)((?:\\([\\w\\-]+(?:[$^*]?=[^\\(\\)\"]*)?\\))*)|#([^{}]+))$/";

// Regular expression that RegExp filters specified as RegExps should match
const RegExp Filter::regexpRegExp = L"/^(@@)?\\/.*\\/(?:\\$~?[\\w\\-]+(?:=[^,\\s]+)?(?:,~?[\\w\\-]+(?:=[^,\\s]+)?)*)?$/";

// Regular expression that options on a RegExp filter should match
const RegExp Filter::optionsRegExp = L"/\\$(~?[\\w\\-]+(?:=[^,\\s]+)?(?:,~?[\\w\\-]+(?:=[^,\\s]+)?)*)$/";

/**
 * Cache for known filters, maps string representation to filter objects.
 */
Filter::FiltersHolder Filter::knownFiltersHolder;
unordered_map<wstring, Filter*>& Filter::knownFilters = knownFiltersHolder.filters;

// Automatically cleanup at program exit
void Filter::FiltersHolder::clear()
{
	// not just a "clear" call, we should free the Filters themselves
	for (auto iter = filters.begin(); iter != filters.end(); ++iter)
		delete iter->second;
	filters.clear();
}

void Filter::clearKnownFilters()
{
	knownFiltersHolder.clear();
}

/**
 * Creates a filter of correct type from its text representation - does the basic parsing and
 * calls the right constructor then.
 */
Filter* Filter::fromText(const wstring& text)
{
	unordered_map<wstring, Filter*>::iterator iter = knownFilters.find(text);
	if (iter != knownFilters.end())
		return iter->second;

	Filter* ret = NULL;
	RegExpMatch match;
	if (text.find(L'#') != wstring::npos && elemhideRegExp.exec(match, text))
	{
		const vector<wstring>& substrings = match.substrings;
		ret = ElemHideBase::fromText(text, substrings[1], 0 != substrings[2].length(), substrings[3],
			substrings[4], substrings[5]);
	}
	else if (startsWithChar(text, L'!'))
	{
		ret = new CommentFilter(text);
	}
	else
	{
		ret = RegExpFilter::fromText(text);
	}

	knownFilters[ret->text] = ret;
	return ret;
}

namespace abp { namespace funcStatic { namespace Filter_fromObject {
	static const wstring strText = L"text";
	static const wstring strDisabled = L"disabled";
	static const wstring strTrue = L"true";
} } } // namespace abp::funcStatic::Filter_fromObject

Filter* Filter::fromObject(const map<wstring, wstring>& obj)
{
	using namespace funcStatic::Filter_fromObject;

	auto iter = obj.find(strText);
	if (iter != obj.end())
	{
		Filter* filter = Filter::fromText(iter->second);
		if (filter)
		{
			ActiveFilter* af = filter->toActiveFilter();
			if (af)
			{
				iter = obj.find(strDisabled);
				if (iter != obj.end())
					af->setDisabled(iter->second == strTrue);
				else af->setDisabled(false);
			}
		}
		return filter;
	}
	return NULL;
}

namespace abp { namespace funcStatic { namespace Filter_normalize {
	// pre-compiled to speed up the process
	static const RegExp re1 = L"/[^\\S ]/g";
	static const RegExp re2 = L"/^\\s*!/";
	static const RegExp re3 = L"/^\\s+/";
	static const RegExp re4 = L"/\\s+$/";
	static const RegExp re5 = L"/^(.*?)(#\\@?#?)(.*)$/";
	static const RegExp re6 = L"/\\s/g";
} } } // namespace abp::funcStatic::Filter_normalize

/**
 * Removes unnecessary whitespaces from filter text
 */
wstring Filter::normalize(const wstring& text)
{
	using namespace funcStatic::Filter_normalize;

	// Remove line breaks and such
	wstring res = replace(text, re1, strEmpty);
	if (re2.test(res))
	{
		// Don't remove spaces inside comments
		return replace(replace(res, re3, strEmpty), re4, strEmpty);
	}
	else if (elemhideRegExp.test(res))
	{
		// Special treatment for element hiding filters, right side is allowed to contain spaces
		RegExpMatch match;
		if (re5.exec(match, res))
		{
			const wstring& domain = match.substrings[1];
			const wstring& separator = match.substrings[2];
			const wstring& selector = match.substrings[3];
			res = replace(domain, re6, strEmpty) + separator
				+ replace(replace(selector, re3, strEmpty), re4, strEmpty);
		}
		return res;
	}
	else
	{
		return replace(res, re6, strEmpty);
	}
}

const map<wstring, bool> ActiveFilter::s_mEmpty;

void ActiveFilter::setDisabled(bool value)
{
	disabled = value;
}

namespace abp { namespace funcStatic { namespace ActiveFilter_generateDomains {
	// pre-compiled to speed up the process
	static const RegExp re1 = L"/\\.+$/";
} } } // namespace abp::funcStatic::ActiveFilter_generateDomains

void ActiveFilter::generateDomains(const wstring& domainSource)
{
	using namespace funcStatic::ActiveFilter_generateDomains;

	if (domainSource.length())
	{
		map<wstring, bool> domains;

		wstring ds = toUpperCase(domainSource);
		vector<wstring> list = split(ds, wstring(1, domainSeparator));

		bool hasIncludes = false;
		for (size_t i = 0; i < list.size(); i++)
		{
			wstring domain = list[i];
			if (ignoreTrailingDot)
				domain = replace(domain, re1, strEmpty);
			if (domain == strEmpty)
				continue;

			bool include;
			if (startsWithChar(domain, L'~'))
			{
				include = false;
				domain = domain.substr(1);
			}
			else
			{
				include = true;
				hasIncludes = true;
			}

			domains[domain] = include;
		}

		if (domains.size())
		{
			domains[strEmpty] = !hasIncludes;
			this->domains = new map<wstring, bool>(std::move(domains));
		}
	}
}

namespace abp { namespace funcStatic { namespace ActiveFilter_isActiveOnDomain {
	// pre-compiled to speed up the process
	static const RegExp re1 = L"/\\.+$/";
} } } // namespace abp::funcStatic::ActiveFilter_isActiveOnDomain

/**
 * Checks whether this filter is active on a domain.
 */
bool ActiveFilter::isActiveOnDomain(const wstring& docDomain) const
{
	using namespace funcStatic::ActiveFilter_isActiveOnDomain;

	// If no domains are set the rule matches everywhere
	if (!domains) return true;

	// If the document has no host name, match only if the filter isn't restricted to specific domains
	if (!docDomain.length())
		return domains->at(strEmpty);

	wstring domain;
	if (ignoreTrailingDot)
		domain = replace(docDomain, re1, strEmpty);
	else domain = docDomain;
	domain = toUpperCase(domain);

	while (true)
	{
		auto iter = domains->find(domain);
		if (iter != domains->end())
			return iter->second;

		size_t nextDot = domain.find(L'.');
		if (nextDot == wstring::npos)
			break;
		domain = domain.substr(nextDot + 1);
	}
	return domains->at(strEmpty);
}

namespace abp { namespace funcStatic { namespace ActiveFilter_isActiveOnlyOnDomain {
	// pre-compiled to speed up the process
	static const RegExp re1 = L"/\\.+$/";
} } } // namespace abp::funcStatic::ActiveFilter_isActiveOnlyOnDomain

/**
 * Checks whether this filter is active only on a domain and its subdomains.
 */
bool ActiveFilter::isActiveOnlyOnDomain(const wstring& docDomain) const
{
	using namespace funcStatic::ActiveFilter_isActiveOnlyOnDomain;

	if (!docDomain.length() || domains || domains->at(strEmpty))
		return false;

	wstring domain;
	if (ignoreTrailingDot)
		domain = replace(docDomain, re1, strEmpty);
	else domain = docDomain;
	domain = toUpperCase(domain);
	wstring dotDomain = L"." + domain;

	for (auto iter = domains->begin(); iter != domains->end(); ++iter)
	{
		if (iter->second && iter->first != domain &&
			(iter->first.length() <= domain.length() ||
			iter->first.rfind(dotDomain) != iter->first.length() - dotDomain.length()))
		{
			return false;
		}
	}

	return true;
}

/**
 * Maps type strings like "SCRIPT" or "OBJECT" to bit masks
 */
map<wstring, ContentType_T> RegExpFilter::typeMap;
map<ContentType_T, wstring> RegExpFilter::reverseTypeMap;
RegExpFilter::TypeMapInitializer RegExpFilter::typeMapInit;
RegExpFilter::TypeMapInitializer::TypeMapInitializer()
{
#define DEFTYPEMAP(type) do { typeMap[L#type] = type; reverseTypeMap[type] = L#type; } while (false)
	DEFTYPEMAP(OTHER);
	DEFTYPEMAP(SCRIPT);
	DEFTYPEMAP(IMAGE);
	DEFTYPEMAP(STYLESHEET);
	DEFTYPEMAP(OBJECT);
	DEFTYPEMAP(SUBDOCUMENT);
	DEFTYPEMAP(DOCUMENT);
	DEFTYPEMAP(XBL);
	DEFTYPEMAP(PING);
	DEFTYPEMAP(XMLHTTPREQUEST);
	DEFTYPEMAP(OBJECT_SUBREQUEST);
	DEFTYPEMAP(DTD);
	DEFTYPEMAP(MEDIA);
	DEFTYPEMAP(FONT);
	DEFTYPEMAP(BACKGROUND);
	DEFTYPEMAP(POPUP);
	DEFTYPEMAP(DONOTTRACK);
	DEFTYPEMAP(ELEMHIDE);
	DEFTYPEMAP(UNKNOWN_OTHER);
}

namespace abp { namespace funcStatic { namespace RegExpFilter_generateRegExp {
	// pre-compiled to speed up the process
	// Remove multiple wildcards
	static const RegExp re1 = L"/\\*+/g";
	static const wstring ws1 = L"*";

	// remove anchors following separator placeholder
	static const RegExp re2 = L"/\\^\\|$/";
	static const wstring ws2 = L"^";

	// escape special symbols
	static const RegExp re3 = L"/\\W/g";
	static const wstring ws3 = L"\\$&";

	// replace wildcards by .*
	static const RegExp re4 = L"/\\\\\\*/g";
	static const wstring ws4 = L".*";

	// process separator placeholders (all ANSI charaters but alphanumeric characters and _%.-)
	static const RegExp re5 = L"/\\\\\\^/g";
	static const wstring ws5 = L"(?:[\\x00-\\x24\\x26-\\x2C\\x2F\\x3A-\\x40\\x5B-\\x5E\\x60\\x7B-\\x7F]|$)";

	// process extended anchor at expression start
	static const RegExp re6 = L"/^\\\\\\|\\\\\\|/";
	static const wstring ws6 = L"^[\\w\\-]+:\\/+(?!\\/)(?:[^.\\/]+\\.)*?";

	// process anchor at expression start
	static const RegExp re7 = L"/^\\\\\\|/";
	static const wstring ws7 = L"^";

	// process anchor at expression end
	static const RegExp re8 = L"/\\\\\\|$/";
	static const wstring ws8 = L"$";
} } } // namespace abp::funcStatic::RegExpFilter_generateRegExp

/**
 * Regular expression to be used when testing against this filter
 */
void RegExpFilter::generateRegExp(const wstring& regexpSource)
{
	using namespace funcStatic::RegExpFilter_generateRegExp;

	// Remove multiple wildcards
	wstring source = replace(regexpSource, re1, ws1);

	// remove anchors & other 6 operations (see above)
	source = replace(source, re2, ws2);
	source = replace(source, re3, ws3);
	source = replace(source, re4, ws4);
	source = replace(source, re5, ws5);
	source = replace(source, re6, ws6);
	source = replace(source, re7, ws7);
	source = replace(source, re8, ws8);

	// Remove leading wildcards
	if (startsWith(source, L".*")) source = source.substr(2);
	// Remove trailing wildcards
	if (endsWith(source, L".*")) source = source.substr(0, source.length() - 2);

	// wrap to regexp syntax
	source.insert(source.begin(), L'/');
	source.push_back(L'/');
	if (!matchCase) source.push_back(L'i');

	// construct the RegExp object
	regexp = source;
}

/**
 * Tests whether the URL matches this filter
 */
bool RegExpFilter::matches(const wstring& location, ContentType_T contentType, const wstring& docDomain, bool thirdParty) const
{
	return (contentType & this->contentType)
		&& (this->thirdParty == TriNull || (this->thirdParty == TriTrue) == thirdParty)
		&& regexp.test(location)
		&& isActiveOnDomain(docDomain);
}

namespace abp { namespace funcStatic { namespace RegExpFilter_fromText {
	// pre-compiled to speed up the process
	static const RegExp re1 = L"/-/";
	static const RegExp re2 = L"/^\\|?[\\w\\-]+:/";

	static const wstring strAtAt = L"@@";
	static const wstring strComma = L",";
	static const wstring strUnderscore = L"_";
	static const wstring strMatchCase = L"MATCH_CASE";
	static const wstring strDomain = L"DOMAIN";
	static const wstring strThirdParty = L"THIRD_PARTY";
	static const wstring strNotThirdParty = L"~THIRD_PARTY";
	static const wstring strCollapse = L"COLLAPSE";
	static const wstring strNotCollapse = L"~COLLAPSE";
	static const wstring strSiteKey = L"SITEKEY";
	static const wstring strBar = L"|";
	static const wstring strDocument = L"DOCUMENT";
} } } // namespace abp::funcStatic::RegExpFilter_fromText

/**
 * Creates a RegExp filter from its text representation
 */
Filter* RegExpFilter::fromText(const wstring& text)
{
	using namespace funcStatic::RegExpFilter_fromText;

	bool blocking = true;
	wstring regexpSource = text;
	if (startsWith(text, strAtAt))
	{
		blocking = false;
		regexpSource = regexpSource.substr(2);
	}

	ContentType_T contentType = 0;
	bool contentTypeNull = true;
	bool matchCase = false;
	wstring domains;
	vector<wstring> siteKeys;
	TriBool thirdParty = TriNull;
	TriBool collapse = TriNull;
	vector<wstring> options;
	RegExpMatch match;
	if (regexpSource.find(L'$') != wstring::npos && Filter::optionsRegExp.exec(match, regexpSource))
	{
		options = split(toUpperCase(match.substrings[1]), strComma);
		regexpSource = match.input.substr(0, match.index);

		for (size_t i = 0; i < options.size(); i++)
		{
			wstring option = options[i];
			wstring value;
			size_t separatorIndex = option.find(L'=');
			if (separatorIndex != wstring::npos)
			{
				value = option.substr(separatorIndex + 1);
				option = option.substr(0, separatorIndex);
			}
			option = replace(option, re1, strUnderscore);
			auto iter = typeMap.find(option);
			if (iter != typeMap.end())
			{
				if (contentTypeNull)
				{
					contentType = 0;
					contentTypeNull = false;
				}
				contentType |= iter->second;
			}
			else if (startsWithChar(option, L'~') && typeMap.end() != (iter = typeMap.find(option.substr(1))))
			{
				if (contentTypeNull)
				{
					contentType = DEFAULT_CONTENT_TYPE;
					contentTypeNull = false;
				}
				contentType &= ~iter->second;
			}
			else if (option == strMatchCase)
				matchCase = true;
			else if (option == strDomain)
				domains = value;
			else if (option == strThirdParty)
				thirdParty = TriTrue;
			else if (option == strNotThirdParty)
				thirdParty = TriFalse;
			else if (option == strCollapse)
				collapse = TriTrue;
			else if (option == strNotCollapse)
				collapse = TriFalse;
			else if (option == strSiteKey)
				siteKeys = split(value, strBar);
		}
	}

	if (!blocking && (contentTypeNull || (contentType & DOCUMENT))
		&& (!options.size() || find(options.begin(), options.end(), strDocument) == options.end())
		&& !re2.test(regexpSource))
	{
		// Exception filters shouldn't apply to pages by default unless they start with a protocol name
		if (contentTypeNull)
		{
			contentTypeNull = false;
			contentType = DEFAULT_CONTENT_TYPE;
		}
		contentType &= ~DOCUMENT;
	}
	if (!blocking && siteKeys.size())
	{
		contentTypeNull = false;
		contentType = DOCUMENT;
	}
	if (contentTypeNull)
		contentType = DEFAULT_CONTENT_TYPE;

	try
	{
		if (blocking)
			return new BlockingFilter(text, regexpSource, contentType, matchCase, domains, thirdParty, collapse);
		else
			return new WhitelistFilter(text, regexpSource, contentType, matchCase, domains, thirdParty, std::move(siteKeys));
	}
	catch (const RegExpCompileError& e)
	{
		UNUSED(e); // for release builds
		TRACE("RegExpCompileError thrown: %s\n", e.what());
		return new InvalidFilter(text, L"RegExp Compile Error");
	}
	catch (...)
	{
		TRACE("Unknown exception thrown.");
		return new InvalidFilter(text, L"Unknown Error");
	}
}

const std::vector<std::wstring> WhitelistFilter::s_vEmpty;

namespace abp { namespace funcStatic { namespace ElemHideBase_ElemHideBase {
	// pre-compiled to speed up the process
	static const RegExp re1 = L"/,~[^,]+/g";
	static const RegExp re2 = L"/^~[^,]+,?/";
} } } // namespace abp::funcStatic::ElemHideBase_ElemHideBase

ElemHideBase::ElemHideBase(const wstring& text, const wstring& domains, const wstring& selector)
	: ActiveFilter(text, toUpperCase(domains), L',', false), selector(selector)
{
	using namespace funcStatic::ElemHideBase_ElemHideBase;

	if (domains.size())
	{
		selectorDomain = toLowerCase(replace(replace(domains, re1, strEmpty), re2, strEmpty));
	}
}

namespace abp { namespace funcStatic { namespace ElemHideBase_fromText {
	// pre-compiled to speed up the process
	static const RegExp re1 = L"/\\([\\w\\-]+(?:[$^*]?=[^\\(\\)\"]*)?\\)/g";
	static const RegExp re2 = L"/=/";

	static const wstring strEqQuot = L"=\"";
	static const wstring strStar = L"*";
} } } // namespace abp::funcStatic::ElemHideBase_fromText

/**
 * Creates an element hiding filter from a pre-parsed text representation
 */
Filter* ElemHideBase::fromText(const wstring& text, const wstring& domain, bool isException,
	const wstring& tagName, const wstring& attrRules, const wstring& selector)
{
	using namespace funcStatic::ElemHideBase_fromText;

	wstring sel = selector;
	if (!sel.length())
	{
		wstring tag = tagName;
		if (tagName == strStar)
			tag = strEmpty;

		wstring id;
		wstring additional = strEmpty;
		if (attrRules.length())
		{
			RegExpMatch match;
			String::match(match, attrRules, re1);
			for (size_t i = 0; i < match.substrings.size(); i++)
			{
				wstring rule = match.substrings[i];
				size_t separatorPos = rule.find(L'=');
				if (separatorPos != wstring::npos && separatorPos > 0)
				{
					rule = replace(rule, re2, strEqQuot);
					rule.push_back(L'"');
					additional.push_back(L'[');
					additional.append(rule);
					additional.push_back(L']');
				}
				else
				{
					if (id.length())
					{
						return new InvalidFilter(text, L"Duplicate ID");
					}
					else
						id = rule;
				}
			}
		}

		if (id.length())
		{
			sel = tag;
			sel.push_back(L'.');
			sel.append(id);
			sel.append(additional);
			sel.push_back(L',');
			sel.append(tag);
			sel.push_back(L'#');
			sel.append(id);
			sel.append(additional);
		}
		else if (tag.length() || additional.length())
			sel = tag + additional;
		else
		{
			return new InvalidFilter(text, L"No Criteria");
		}
	}
	return new ElemHideFilter(text, domain, sel, isException);
}
