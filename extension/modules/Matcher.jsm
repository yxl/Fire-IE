/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 * The Original Code is Adblock Plus.
 *
 * The Initial Developer of the Original Code is
 * Wladimir Palant.
 * Portions created by the Initial Developer are Copyright (C) 2006-2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 * 	Yuan Xulei(hi@yxl.name)
 */

/**
 * @fileOverview Matcher class implementing matching addresses against a list of filters.
 * Refer to http://adblockplus.org/blog/investigating-filter-matching-algorithms for more information about
 * the matching algorithms.
 */

var EXPORTED_SYMBOLS = ["Matcher", "CombinedMatcher", "engineMatcher", "userAgentMatcher", "AllMatcher"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);
Cu.import(baseURL.spec + "FilterClasses.jsm");

/**
 * Blacklist/whitelist filter matching
 * @constructor
 */
function Matcher()
{
	this.clear();
}

Matcher.prototype = {
	/**
	 * Lookup table for filters by their associated keyword
	 * @type Object
	 */
	filterByKeyword: null,

	/**
	 * Lookup table for keywords by the filter text
	 * @type Object
	 */
	keywordByFilter: null,

	/**
	 * Removes all known filters
	 */
	clear: function()
	{
		this.filterByKeyword = {__proto__: null};
		this.keywordByFilter = {__proto__: null};
	},

	/**
	 * Adds a filter to the matcher
	 * @param {RegExpFilter} filter
	 */
	add: function(filter)
	{
		if (filter.text in this.keywordByFilter)
			return;

		// Look for a suitable keyword
		let keyword = this.findKeyword(filter);
		switch (typeof this.filterByKeyword[keyword])
		{
			case "undefined":
				this.filterByKeyword[keyword] = filter.text;
				break;
			case "string":
				this.filterByKeyword[keyword] = [this.filterByKeyword[keyword], filter.text];
				break;
			default:
				this.filterByKeyword[keyword].push(filter.text);
				break;
		}
		this.keywordByFilter[filter.text] = keyword;
	},

	/**
	 * Removes a filter from the matcher
	 * @param {RegExpFilter} filter
	 */
	remove: function(filter)
	{
		if (!(filter.text in this.keywordByFilter))
			return;

		let keyword = this.keywordByFilter[filter.text];
		let list = this.filterByKeyword[keyword];
		if (typeof list == "string")
			delete this.filterByKeyword[keyword];
		else
		{
			let index = list.indexOf(filter.text);
			if (index >= 0)
			{
				list.splice(index, 1);
				if (list.length == 1)
					this.filterByKeyword[keyword] = list[0];
			}
		}

		delete this.keywordByFilter[filter.text];
	},

	/**
	 * Chooses a keyword to be associated with the filter
	 * @param {String} text text representation of the filter
	 * @return {String} keyword (might be empty string)
	 */
	findKeyword: function(filter)
	{
		let defaultResult = "";

		let text = filter.text;
		if (Filter.regexpRegExp.test(text))
			return defaultResult;

		// Remove options
		if (Filter.optionsRegExp.test(text))
			text = RegExp.leftContext;

		// Remove whitelist marker
		if (text.substr(0, 2) == "@@")
			text = text.substr(2);
			
		// Remove user agent marker
		if (text.substr(0, 2) == "##")
			text = text.substr(2);

		let candidates = text.toLowerCase().match(/[^a-z0-9%*][a-z0-9%]{3,}(?=[^a-z0-9%*])/g);
		if (!candidates)
			return defaultResult;

		let hash = this.filterByKeyword;
		let result = defaultResult;
		let resultCount = 0xFFFFFF;
		let resultLength = 0;
		for (let i = 0, l = candidates.length; i < l; i++)
		{
			let candidate = candidates[i].substr(1);
			let count;
			switch (typeof hash[candidate])
			{
				case "undefined":
					count = 0;
					break;
				case "string":
					count = 1;
					break;
				default:
					count = hash[candidate].length;
					break;
			}
			if (count < resultCount || (count == resultCount && candidate.length > resultLength))
			{
				result = candidate;
				resultCount = count;
				resultLength = candidate.length;
			}
		}
		return result;
	},

	/**
	 * Checks whether a particular filter is being matched against.
	 */
	hasFilter: function(/**RegExpFilter*/ filter) /**Boolean*/
	{
		return (filter.text in this.keywordByFilter);
	},

	/**
	 * Returns the keyword used for a filter, null for unknown filters.
	 */
	getKeywordForFilter: function(/**RegExpFilter*/ filter) /**String*/
	{
		if (filter.text in this.keywordByFilter)
			return this.keywordByFilter[filter.text];
		else
			return null;
	},

	/**
	 * Checks whether the entries for a particular keyword match a URL
	 */
	_checkEntryMatch: function(keyword, location, docDomain)
	{
		let list = this.filterByKeyword[keyword];
		if (typeof list == "string")
		{
			let filter = Filter.knownFilters[list];
			if (!filter)
			{
				// Something is wrong, we probably shouldn't have this filter in the first place
				delete this.filterByKeyword[keyword];
				return null;
			}
			return (filter.matches(location, docDomain) ? filter : null);
		}
		else
		{
			for (let i = 0; i < list.length; i++)
			{
				let filter = Filter.knownFilters[list[i]];
				if (!filter)
				{
					// Something is wrong, we probably shouldn't have this filter in the first place
					if (list.length == 1)
					{
						delete this.filterByKeyword[keyword];
						return null;
					}
					else
					{
						list.splice(i--, 1);
						continue;
					}
				}
				if (filter.matches(location, docDomain))
					return filter;
			}
			return null;
		}
	},

	/**
	 * Tests whether the URL matches any of the known filters
	 * @param {String} location URL to be tested
	 * @param {String} docDomain domain name of the document that loads the URL
	 * @return {RegExpFilter} matching filter or null
	 */
	matchesAny: function(location, docDomain)
	{
		let candidates = location.toLowerCase().match(/[a-z0-9%]{3,}/g);
		if (candidates === null)
			candidates = [];
		candidates.push("");
		for (let i = 0, l = candidates.length; i < l; i++)
		{
			let substr = candidates[i];
			if (substr in this.filterByKeyword)
			{
				let result = this._checkEntryMatch(substr, location, docDomain);
				if (result)
					return result;
			}
		}

		return null;
	},

	/**
	 * Stores current state in a JSON'able object.
	 */
	toCache: function(/**Object*/ cache)
	{
		cache.filterByKeyword = this.filterByKeyword;
	},

	/**
	 * Restores current state from an object.
	 */
	fromCache: function(/**Object*/ cache)
	{
		this.filterByKeyword = cache.filterByKeyword;
		this.filterByKeyword.__proto__ = null;

		// We don't want to initialize keywordByFilter yet, do it when it is needed
		delete this.keywordByFilter;
		this.__defineGetter__("keywordByFilter", function()
		{
			let result = {__proto__: null};
			for (let k in this.filterByKeyword)
			{
				let list = this.filterByKeyword[k];
				if (typeof list == "string")
					result[list] = k;
				else
					for (let i = 0, l = list.length; i < l; i++)
						result[list[i]] = k;
			}
			return this.keywordByFilter = result;
		});
		this.__defineSetter__("keywordByFilter", function(value)
		{
			delete this.keywordByFilter;
			return this.keywordByFilter = value;
		});
	}
};

/**
 * Combines a matcher for blocking and exception rules, automatically sorts
 * rules into two Matcher instances.
 * @constructor
 */
function CombinedMatcher()
{
	this.blacklist = new Matcher();
	this.whitelist = new Matcher();
	this.resultCache = {__proto__: null};
}

/**
 * Maximal number of matching cache entries to be kept
 * @type Number
 */
CombinedMatcher.maxCacheEntries = 1000;

CombinedMatcher.prototype =
{
	/**
	 * Matcher for blocking rules.
	 * @type Matcher
	 */
	blacklist: null,

	/**
	 * Matcher for exception rules.
	 * @type Matcher
	 */
	whitelist: null,

	/**
	 * Lookup table of previous matchesAny results
	 * @type Object
	 */
	resultCache: null,

	/**
	 * Number of entries in resultCache
	 * @type Number
	 */
	cacheEntries: 0,

	/**
	 * @see Matcher#clear
	 */
	clear: function()
	{
		this.blacklist.clear();
		this.whitelist.clear();
		this.resultCache = {__proto__: null};
		this.cacheEntries = 0;
	},

	/**
	 * @see Matcher#add
	 */
	add: function(filter)
	{
		if (filter instanceof WhitelistFilter)
		{
			this.whitelist.add(filter);
		}
		else
		{
			this.blacklist.add(filter);
		}

		if (this.cacheEntries > 0)
		{
			this.resultCache = {__proto__: null};
			this.cacheEntries = 0;
		}
	},

	/**
	 * @see Matcher#remove
	 */
	remove: function(filter)
	{
		if (filter instanceof WhitelistFilter)
		{
			this.whitelist.remove(filter);
		}
		else
		{
			this.blacklist.remove(filter);
		}

		if (this.cacheEntries > 0)
		{
			this.resultCache = {__proto__: null};
			this.cacheEntries = 0;
		}
	},

	/**
	 * @see Matcher#findKeyword
	 */
	findKeyword: function(filter)
	{
		if (filter instanceof WhitelistFilter)
			return this.whitelist.findKeyword(filter);
		else
			return this.blacklist.findKeyword(filter);
	},

	/**
	 * @see Matcher#hasFilter
	 */
	hasFilter: function(filter)
	{
		if (filter instanceof WhitelistFilter)
			return this.whitelist.hasFilter(filter);
		else
			return this.blacklist.hasFilter(filter);
	},

	/**
	 * @see Matcher#getKeywordForFilter
	 */
	getKeywordForFilter: function(filter)
	{
		if (filter instanceof WhitelistFilter)
			return this.whitelist.getKeywordForFilter(filter);
		else
			return this.blacklist.getKeywordForFilter(filter);
	},

	/**
	 * Checks whether a particular filter is slow
	 */
	isSlowFilter: function(/**RegExpFilter*/ filter) /**Boolean*/
	{
		let matcher = (filter instanceof WhitelistFilter ? this.whitelist : this.blacklist);
		if (matcher.hasFilter(filter))
			return !matcher.getKeywordForFilter(filter);
		else
			return !matcher.findKeyword(filter);
	},

	/**
	 * Optimized filter matching testing both whitelist and blacklist matchers
	 * simultaneously. For parameters see Matcher.matchesAny().
	 * @see Matcher#matchesAny
	 */
	matchesAnyInternal: function(location, docDomain)
	{
		let candidates = location.toLowerCase().match(/[a-z0-9%]{3,}/g);
		if (candidates === null)
			candidates = [];
	  candidates.push("");

		let blacklistHit = null;
		for (let i = 0, l = candidates.length; i < l; i++)
		{
			let substr = candidates[i];
			if (substr in this.whitelist.filterByKeyword)
			{
				let result = this.whitelist._checkEntryMatch(substr, location, docDomain);
				if (result)
					return result;
			}
			if (substr in this.blacklist.filterByKeyword && blacklistHit === null)
				blacklistHit = this.blacklist._checkEntryMatch(substr, location, docDomain);
		}
		return blacklistHit;
	},

	/**
	 * @see Matcher#matchesAny
	 */
	matchesAny: function(location, docDomain)
	{
		let key = location + " " + docDomain;
		if (key in this.resultCache)
			return this.resultCache[key];

		let result = this.matchesAnyInternal(location, docDomain);

		if (this.cacheEntries >= CombinedMatcher.maxCacheEntries)
		{
			this.resultCache = {__proto__: null};
			this.cacheEntries = 0;
		}

		this.resultCache[key] = result;
		this.cacheEntries++;

		return result;
	},

	/**
	 * Stores current state in a JSON'able object.
	 */
	toCache: function(/**Object*/ cache)
	{
		cache.matcher = {whitelist: {}, blacklist: {} };
		this.whitelist.toCache(cache.matcher.whitelist);
		this.blacklist.toCache(cache.matcher.blacklist);
	},

	/**
	 * Restores current state from an object.
	 */
	fromCache: function(/**Object*/ cache)
	{
		this.whitelist.fromCache(cache.matcher.whitelist);
		this.blacklist.fromCache(cache.matcher.blacklist);
	}
}

/**
 * Shared CombinedMatcher instance for engine switching.
 * @type CombinedMatcher
 */
var engineMatcher = new CombinedMatcher();

/**
 * Shared CombinedMatcher instance for user agent switching.
 * @type CombinedMatcher
 */
var userAgentMatcher = new CombinedMatcher();

var AllMatcher = {
  _getFilterMatch: function(filter) {
		let matcher = null;
		if (filter instanceof BlockingFilter || filter instanceof WhitelistFilter)
			matcher = engineMatcher;
		else if (filter instanceof UserAgentFilter || filter instanceof UserAgentExceptionalFilter)
			matcher = userAgentMatcher;
		return matcher;
	},
	/**
	 */
	clear: function()
	{
		engineMatcher.clear();
		userAgentMatcher.clear();
	},

	/**
	 */
	add: function(filter)
	{
		let matcher = this._getFilterMatch(filter);
		if (matcher) {
			matcher.add(filter);
		}
	},

	/**
	 */
	remove: function(filter)
	{
		let matcher = this._getFilterMatch(filter);
		if (matcher) {
			matcher.remove(filter);
		}
	},


	/**
	 * @see Matcher#findKeyword
	 */
	findKeyword: function(filter)
	{
		let matcher = this._getFilterMatch(filter);
		if (matcher) {
			return matcher.findKeyword(filter);
		}	
		return null; 
	},

	/**
	 * @see Matcher#hasFilter
	 */
	hasFilter: function(filter)
	{
		let matcher = this._getFilterMatch(filter);
		if (matcher) {
			return matcher.hasFilter(filter);
		}
		return false;
	},

	/**
	 * @see Matcher#getKeywordForFilter
	 */
	getKeywordForFilter: function(filter)
	{
		let matcher = this._getFilterMatch(filter);
		if (matcher) {
			return matcher.getKeywordForFilter(filter);
		}	
		return "";
	},

	/**
	 * Checks whether a particular filter is slow
	 */
	isSlowFilter: function(/**RegExpFilter*/ filter) /**Boolean*/
	{
		let matcher = this._getFilterMatch(filter);
		if (matcher) {
			return matcher.isSlowFilter(filter);
		}	
		return false;
	},

	/**
	 * Stores current state in a JSON'able object.
	 */
	toCache: function(/**Object*/ cache)
	{
		cache.engineMatcher = {};
		cache.userAgentMatcher = {};
		engineMatcher.toCache(cache.engineMatcher);
		userAgentMatcher.toCache(cache.userAgentMatcher);
	},

	/**
	 * Restores current state from an object.
	 */
	fromCache: function(/**Object*/ cache)
	{
		engineMatcher.fromCache(cache.engineMatcher);
		userAgentMatcher.fromCache(cache.userAgentMatcher);	
	}
};