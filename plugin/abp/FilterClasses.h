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

// FilterClasses.h : ABP filter classes
//   almost a direct port from the JS version, with lazy initialization removed (for multi-threading safety)
//

#include "re/RegExp.h"
#include "TriBool.h"
#include "FilterContentType.h"
#include <unordered_map>
#include <map>
#include <vector>

namespace abp {
	// Forward declaration
	class ActiveFilter;
	class RegExpFilter;
	class ElemHideFilter;

	/**
	 * Abstract base class for filters
	 */
	class Filter {
	public:
		/*
		 * @param {String} text   string representation of the filter
		 * @constructor
		 */
		Filter(const std::wstring& text) : text(text) {}
		virtual ~Filter() {}

		const std::wstring& getText() const { return text; }
		std::wstring toString() const { return text; }

		// custom dynamic_cast routines to avoid RTTI
		virtual ActiveFilter* toActiveFilter() { return NULL; }
		virtual const ActiveFilter* toActiveFilter() const { return NULL; }
		virtual RegExpFilter* toRegExpFilter() { return NULL; }
		virtual const RegExpFilter* toRegExpFilter() const { return NULL; }
		virtual ElemHideFilter* toElemHideFilter() { return NULL; }
		virtual const ElemHideFilter* toElemHideFilter() const { return NULL; }

		static const re::RegExp regexpRegExp;
		static const re::RegExp optionsRegExp;
		static const re::RegExp elemhideRegExp;

		static Filter* fromText(const std::wstring& text);
		static Filter* fromObject(const std::map<std::wstring, std::wstring>& obj);
		static std::wstring normalize(const std::wstring& text);

		static const std::unordered_map<std::wstring, Filter*>&
			getKnownFilters() { return knownFilters; }
		static void clearKnownFilters();

		// Hash function based on Filter*
		class Hasher : public std::unary_function<Filter*, size_t> {
		public:
			size_t operator()(Filter* filter) const { return hasher(reinterpret_cast<size_t>(filter)); }
		private:
			static const std::hash<size_t> hasher;
		};

		// Equality function based on Filter*
		class EqualTo : public std::binary_function<Filter*, Filter*, bool> {
		public:
			bool operator()(Filter* filterLeft, Filter* filterRight) const { return filterLeft == filterRight; }
		};
	private:
		std::wstring text;
		static std::unordered_map<std::wstring, Filter*> knownFilters;
	};

	/**
	 * Class for invalid filters
	 * @augments Filter
	 */
	class InvalidFilter : public Filter {
	public:
		/*
		 * @param {String} text see Filter()
		 * @param {String} reason Reason why this filter is invalid
		 * @constructor
		 */
		InvalidFilter(const std::wstring& text, const std::wstring& reason)
			: Filter(text), reason(reason) {}
	private:
		std::wstring reason;
	};

	/**
	 * Class for comments
	 * @augments Filter
	 */
	class CommentFilter : public Filter {
	public:
		/*
		 * @param {String} text see Filter()
		 * @constructor
		 */
		CommentFilter(const std::wstring& text)
			: Filter(text) {}
	};

	/**
	 * Abstract base class for filters that can get hits
	 * @augments Filter
	 */
	class ActiveFilter : public Filter {
	public:
		bool isDisabled() const { return disabled; }
		void setDisabled(bool value);

		bool isActiveOnDomain(const std::wstring& docDomain) const;
		bool isActiveOnlyOnDomain(const std::wstring& docDomain) const;
		const std::map<std::wstring, bool>& getDomains() const { return domains ? *domains : s_mEmpty; }

		virtual bool isException() const { return false; }

		virtual ActiveFilter* toActiveFilter() { return this; }
		virtual const ActiveFilter* toActiveFilter() const { return this; }
	protected:
		/*
		 * @param {String} text see Filter()
		 * @param {String} domains  (optional) Domains that the filter is restricted to separated by domainSeparator e.g. "foo.com|bar.com|~baz.com"
		 * @constructor
		 */
		ActiveFilter(const std::wstring& text, const std::wstring& domains = L"", 
					 const std::wstring& domainSeparator = L"|", bool ignoreTrailingDot = true)
			: Filter(text), domainSeparator(domainSeparator), ignoreTrailingDot(ignoreTrailingDot), disabled(false)
		{
			this->domains = NULL;
			generateDomains(domains);
		}
		
		~ActiveFilter() { delete domains; }
	private:
		/**
		 * Separator character used in domainSource property, must be overridden by subclasses
		 * @type String
		 */
		std::wstring domainSeparator;

		/**
		 * Determines whether the trailing dot in domain names isn't important and
		 * should be ignored, must be overridden by subclasses.
		 * @type Boolean
		 */
		bool ignoreTrailingDot;

		bool disabled;

		// number of domains are not many, using std::map suffices
		std::map<std::wstring, bool>* domains;
		void generateDomains(const std::wstring& domainSource);

		static const std::map<std::wstring, bool> s_mEmpty;
	};

	/**
	 * Abstract base class for RegExp-based filters
	 * @augments ActiveFilter
	 */
	class RegExpFilter : public ActiveFilter {
	public:
		static const ContentType_T DEFAULT_CONTENT_TYPE = 0x7FFFFFFFul & ~(ELEMHIDE | DONOTTRACK | POPUP);
		/*
		 * @param {String} text see Filter()
		 * @param {String} regexpSource filter part that the regular expression should be build from
		 * @param {Number} contentType  (optional) Content types the filter applies to, combination of values from RegExpFilter.typeMap
		 * @param {Boolean} matchCase   (optional) Defines whether the filter should distinguish between lower and upper case letters
		 * @param {String} domains      (optional) Domains that the filter is restricted to, e.g. "foo.com|bar.com|~baz.com"
		 * @param {Boolean} thirdParty  (optional) Defines whether the filter should apply to third-party or first-party content only
		 * @constructor
		 */
		RegExpFilter(const std::wstring& text, const std::wstring& regexpSource,
			ContentType_T contentType = DEFAULT_CONTENT_TYPE, bool matchCase = false, const std::wstring& domains = L"",
			TriBool thirdParty = TriNull)
			: ActiveFilter(text, domains, L"|", true), contentType(contentType), matchCase(matchCase), thirdParty(thirdParty)
		{
			if (regexpSource.length() >= 2 && regexpSource.front() == L'/'
				&& regexpSource.back() == L'/')
			{
				// The filter is a regular expression - convert it directly
				regexp = regexpSource;
			}
			else
			{
				generateRegExp(regexpSource);
			}
		}

		ContentType_T getContentType() { return contentType; }
		bool matches(const std::wstring& location, ContentType_T contentType, const std::wstring& docDomain, bool thirdParty) const;

		virtual RegExpFilter* toRegExpFilter() { return this; }
		virtual const RegExpFilter* toRegExpFilter() const { return this; }

		static Filter* fromText(const std::wstring& text);
		static const std::map<std::wstring, ContentType_T>&
			getTypeMap() { return typeMap; }
		static const std::map<ContentType_T, std::wstring>&
			getReverseTypeMap() { return reverseTypeMap; }
	private:
		re::RegExp regexp;
		void generateRegExp(const std::wstring& regexpSource);

		ContentType_T contentType;
		// 3-value boolean, null: no restriction; false: first-party only; true: third-party only
		TriBool thirdParty;
		bool matchCase;

		static std::map<std::wstring, ContentType_T> typeMap;
		static std::map<ContentType_T, std::wstring> reverseTypeMap;
		class TypeMapInitializer;
		friend class TypeMapInitializer;
		class TypeMapInitializer {
		public:
			TypeMapInitializer();
		};
		static TypeMapInitializer typeMapInit;
	};

	/**
	 * Class for blocking filters
	 * @augments RegExpFilter
	 */
	class BlockingFilter : public RegExpFilter {
	public:
		/*
		 * @param {String} text see Filter()
		 * @param {String} regexpSource see RegExpFilter()
		 * @param {Number} contentType see RegExpFilter()
		 * @param {Boolean} matchCase see RegExpFilter()
		 * @param {String} domains see RegExpFilter()
		 * @param {Boolean} thirdParty see RegExpFilter()
		 * @param {Boolean} collapse  defines whether the filter should collapse blocked content, can be null
		 * @constructor
		 */
		BlockingFilter(const std::wstring& text, const std::wstring& regexpSource,
			ContentType_T contentType = DEFAULT_CONTENT_TYPE, bool matchCase = false, const std::wstring& domains = L"",
			TriBool thirdParty = TriNull, TriBool collapse = TriNull)
			: RegExpFilter(text, regexpSource, contentType, matchCase, domains, thirdParty),
			  collapse(collapse) {}
	private:
		TriBool collapse;
	};

	/**
	 * Class for whitelist filters
	 * @augments RegExpFilter
	 */
	class WhitelistFilter : public RegExpFilter {
	public:
		/*
		 * @param {String} text see Filter()
		 * @param {String} regexpSource see RegExpFilter()
		 * @param {Number} contentType see RegExpFilter()
		 * @param {Boolean} matchCase see RegExpFilter()
		 * @param {String} domains see RegExpFilter()
		 * @param {Boolean} thirdParty see RegExpFilter()
		 * @param {String[]} siteKeys public keys of websites that this filter should apply to
		 * @constructor
		 */
		WhitelistFilter(const std::wstring& text, const std::wstring& regexpSource,
			ContentType_T contentType = DEFAULT_CONTENT_TYPE, bool matchCase = false, const std::wstring& domains = L"",
			TriBool thirdParty = TriNull, std::vector<std::wstring>&& siteKeys = std::vector<std::wstring>())
			: RegExpFilter(text, regexpSource, contentType, matchCase, domains, thirdParty)
		{
			if (siteKeys.size())
				this->siteKeys = new std::vector<std::wstring>(std::move(siteKeys));
			else this->siteKeys = NULL;
		}

		~WhitelistFilter() { delete siteKeys; }

		const std::vector<std::wstring>& getSiteKeys() { return siteKeys ? *siteKeys : s_vEmpty; }

		virtual bool isException() const { return true; }
	private:
		std::vector<std::wstring>* siteKeys;

		static const std::vector<std::wstring> s_vEmpty;
	};

	/**
	 * Base class for element hiding filters
	 * @augments ActiveFilter
	 */
	class ElemHideBase : public ActiveFilter {
	public:
		/*
		 * @param {String} text see Filter()
		 * @param {String} domains    (optional) Host names or domains the filter should be restricted to
		 * @param {String} selector   CSS selector for the HTML elements that should be hidden
		 * @constructor
		 */
		ElemHideBase(const std::wstring& text, const std::wstring& domains, const std::wstring& selector);

		const std::wstring& getSelector() const { return selector; }
		const std::wstring& getSelectorDomain() const { return selectorDomain; }

		static Filter* fromText(const std::wstring& text, const std::wstring& domain, bool isException,
								const std::wstring& tagName, const std::wstring& attrRules,
								const std::wstring& selector);
	private:
		std::wstring selectorDomain;
		std::wstring selector;
	};

	/**
	 * Class for element hiding filters
	 * really don't need RTTI here, so I'm combining the exception class with regular one
	 * @augments ElemHideBase
	 */
	class ElemHideFilter : public ElemHideBase {
	public:
		/*
		 * @param {String} text see Filter()
		 * @param {String} domains  see ElemHideBase()
		 * @param {String} selector see ElemHideBase()
		 * @constructor
		 */
		ElemHideFilter(const std::wstring& text, const std::wstring& domains,
			const std::wstring& selector, bool isException)
			: ElemHideBase(text, domains, selector), exception(isException) {}

		virtual bool isException() const { return exception; };

		virtual ElemHideFilter* toElemHideFilter() { return this; }
		virtual const ElemHideFilter* toElemHideFilter() const { return this; }
	private:
		bool exception;
	};

} // namespace abp
