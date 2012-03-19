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
 *   Yuan Xulei(hi@yxl.name)
 */

/**
 * @fileOverview Matcher class implementing matching addresses against a list of rules.
 * Refer to http://adblockplus.org/blog/investigating-rule-matching-algorithms for more information about
 * the matching algorithms.
 */

var EXPORTED_SYMBOLS = ["Matcher", "CombinedMatcher", "EngineMatcher", "UserAgentMatcher", "AllMatchers"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);
Cu.import(baseURL.spec + "RuleClasses.jsm");

/**
 * Switch rule matching
 * @constructor
 */
function Matcher()
{
  this.clear();
}

Matcher.prototype = {
  /**
   * Lookup table for rules by their associated keyword
   * @type Object
   */
  ruleByKeyword: null,

  /**
   * Lookup table for keywords by the rule text
   * @type Object
   */
  keywordByRule: null,

  /**
   * Removes all known rules
   */
  clear: function()
  {
    this.ruleByKeyword = {
      __proto__: null
    };
    this.keywordByRule = {
      __proto__: null
    };
  },

  /**
   * Adds a rule to the matcher
   * @param {RegExpRule} rule
   */
  add: function(rule)
  {
    if (rule.text in this.keywordByRule) return;

    // Look for a suitable keyword
    let keyword = this.findKeyword(rule);
    switch (typeof this.ruleByKeyword[keyword])
    {
    case "undefined":
      this.ruleByKeyword[keyword] = rule.text;
      break;
    case "string":
      this.ruleByKeyword[keyword] = [this.ruleByKeyword[keyword], rule.text];
      break;
    default:
      this.ruleByKeyword[keyword].push(rule.text);
      break;
    }
    this.keywordByRule[rule.text] = keyword;
  },

  /**
   * Removes a rule from the matcher
   * @param {RegExpRule} rule
   */
  remove: function(rule)
  {
    if (!(rule.text in this.keywordByRule)) return;

    let keyword = this.keywordByRule[rule.text];
    let list = this.ruleByKeyword[keyword];
    if (typeof list == "string") delete this.ruleByKeyword[keyword];
    else
    {
      let index = list.indexOf(rule.text);
      if (index >= 0)
      {
        list.splice(index, 1);
        if (list.length == 1) this.ruleByKeyword[keyword] = list[0];
      }
    }

    delete this.keywordByRule[rule.text];
  },

  /**
   * Chooses a keyword to be associated with the rule
   * @param {String} text text representation of the rule
   * @return {String} keyword (might be empty string)
   */
  findKeyword: function(rule)
  {
    let defaultResult = "";

    let text = rule.text;
    if (Rule.regexpRegExp.test(text)) return defaultResult;

    // Remove options
    if (Rule.optionsRegExp.test(text)) text = RegExp.leftContext;

    // Remove whitelist marker
    if (text.substr(0, 2) == "@@") text = text.substr(2);

    // Remove user agent marker
    if (text.substr(0, 2) == "##") text = text.substr(2);

    let candidates = text.toLowerCase().match(/[^a-z0-9%*][a-z0-9%]{3,}(?=[^a-z0-9%*])/g);
    if (!candidates) return defaultResult;

    let hash = this.ruleByKeyword;
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
   * Checks whether a particular rule is being matched against.
   */
  hasRule: function( /**RegExpRule*/ rule) /**Boolean*/
  {
    return (rule.text in this.keywordByRule);
  },

  /**
   * Returns the keyword used for a rule, null for unknown rules.
   */
  getKeywordForRule: function( /**RegExpRule*/ rule) /**String*/
  {
    if (rule.text in this.keywordByRule) return this.keywordByRule[rule.text];
    else return null;
  },

  /**
   * Checks whether the entries for a particular keyword match a URL
   */
  _checkEntryMatch: function(keyword, location, docDomain)
  {
    let list = this.ruleByKeyword[keyword];
    if (typeof list == "string")
    {
      let rule = Rule.knownRules[list];
      if (!rule)
      {
        // Something is wrong, we probably shouldn't have this rule in the first place
        delete this.ruleByKeyword[keyword];
        return null;
      }
      return (rule.matches(location, docDomain) ? rule : null);
    }
    else
    {
      for (let i = 0; i < list.length; i++)
      {
        let rule = Rule.knownRules[list[i]];
        if (!rule)
        {
          // Something is wrong, we probably shouldn't have this rule in the first place
          if (list.length == 1)
          {
            delete this.ruleByKeyword[keyword];
            return null;
          }
          else
          {
            list.splice(i--, 1);
            continue;
          }
        }
        if (rule.matches(location, docDomain)) return rule;
      }
      return null;
    }
  },

  /**
   * Tests whether the URL matches any of the known rules
   * @param {String} location URL to be tested
   * @param {String} docDomain domain name of the document that loads the URL
   * @return {RegExpRule} matching rule or null
   */
  matchesAny: function(location, docDomain)
  {
    let candidates = location.toLowerCase().match(/[a-z0-9%]{3,}/g);
    if (candidates === null) candidates = [];
    candidates.push("");
    for (let i = 0, l = candidates.length; i < l; i++)
    {
      let substr = candidates[i];
      if (substr in this.ruleByKeyword)
      {
        let result = this._checkEntryMatch(substr, location, docDomain);
        if (result) return result;
      }
    }

    return null;
  },

  /**
   * Stores current state in a JSON'able object.
   */
  toCache: function( /**Object*/ cache)
  {
    cache.ruleByKeyword = this.ruleByKeyword;
  },

  /**
   * Restores current state from an object.
   */
  fromCache: function( /**Object*/ cache)
  {
    this.ruleByKeyword = cache.ruleByKeyword;
    this.ruleByKeyword.__proto__ = null;

    // We don't want to initialize keywordByRule yet, do it when it is needed
    delete this.keywordByRule;
    this.__defineGetter__("keywordByRule", function()
    {
      let result = {
        __proto__: null
      };
      for (let k in this.ruleByKeyword)
      {
        let list = this.ruleByKeyword[k];
        if (typeof list == "string") result[list] = k;
        else for (let i = 0, l = list.length; i < l; i++)
        result[list[i]] = k;
      }
      return this.keywordByRule = result;
    });
    this.__defineSetter__("keywordByRule", function(value)
    {
      delete this.keywordByRule;
      return this.keywordByRule = value;
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
  this.resultCache = {
    __proto__: null
  };
}

/**
 * Maximal number of matching cache entries to be kept
 * @type Number
 */
CombinedMatcher.maxCacheEntries = 1000;

CombinedMatcher.prototype = {
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
    this.resultCache = {
      __proto__: null
    };
    this.cacheEntries = 0;
  },

  /**
   * @see Matcher#add
   */
  add: function(rule)
  {
    if (rule instanceof EngineExceptionalRule)
    {
      this.whitelist.add(rule);
    }
    else
    {
      this.blacklist.add(rule);
    }

    if (this.cacheEntries > 0)
    {
      this.resultCache = {
        __proto__: null
      };
      this.cacheEntries = 0;
    }
  },

  /**
   * @see Matcher#remove
   */
  remove: function(rule)
  {
    if (rule instanceof EngineExceptionalRule)
    {
      this.whitelist.remove(rule);
    }
    else
    {
      this.blacklist.remove(rule);
    }

    if (this.cacheEntries > 0)
    {
      this.resultCache = {
        __proto__: null
      };
      this.cacheEntries = 0;
    }
  },

  /**
   * @see Matcher#findKeyword
   */
  findKeyword: function(rule)
  {
    if (rule instanceof EngineExceptionalRule) return this.whitelist.findKeyword(rule);
    else return this.blacklist.findKeyword(rule);
  },

  /**
   * @see Matcher#hasRule
   */
  hasRule: function(rule)
  {
    if (rule instanceof EngineExceptionalRule) return this.whitelist.hasRule(rule);
    else return this.blacklist.hasRule(rule);
  },

  /**
   * @see Matcher#getKeywordForRule
   */
  getKeywordForRule: function(rule)
  {
    if (rule instanceof EngineExceptionalRule) return this.whitelist.getKeywordForRule(rule);
    else return this.blacklist.getKeywordForRule(rule);
  },

  /**
   * Checks whether a particular rule is slow
   */
  isSlowRule: function( /**RegExpRule*/ rule) /**Boolean*/
  {
    let matcher = (rule instanceof EngineExceptionalRule ? this.whitelist : this.blacklist);
    if (matcher.hasRule(rule)) return !matcher.getKeywordForRule(rule);
    else return !matcher.findKeyword(rule);
  },

  /**
   * Optimized rule matching testing both whitelist and blacklist matchers
   * simultaneously. For parameters see Matcher.matchesAny().
   * @see Matcher#matchesAny
   */
  matchesAnyInternal: function(location, docDomain)
  {
    let candidates = location.toLowerCase().match(/[a-z0-9%]{3,}/g);
    if (candidates === null) candidates = [];
    candidates.push("");

    let blacklistHit = null;
    for (let i = 0, l = candidates.length; i < l; i++)
    {
      let substr = candidates[i];
      if (substr in this.whitelist.ruleByKeyword)
      {
        let result = this.whitelist._checkEntryMatch(substr, location, docDomain);
        if (result) return result;
      }
      if (substr in this.blacklist.ruleByKeyword && blacklistHit === null) blacklistHit = this.blacklist._checkEntryMatch(substr, location, docDomain);
    }
    return blacklistHit;
  },

  /**
   * @see Matcher#matchesAny
   */
  matchesAny: function(location, docDomain)
  {
    let key = location + " " + docDomain;
    if (key in this.resultCache) return this.resultCache[key];

    let result = this.matchesAnyInternal(location, docDomain);

    if (this.cacheEntries >= CombinedMatcher.maxCacheEntries)
    {
      this.resultCache = {
        __proto__: null
      };
      this.cacheEntries = 0;
    }

    this.resultCache[key] = result;
    this.cacheEntries++;

    return result;
  },

  /**
   * Stores current state in a JSON'able object.
   */
  toCache: function( /**Object*/ cache)
  {
    cache.matcher = {
      whitelist: {},
      blacklist: {}
    };
    this.whitelist.toCache(cache.matcher.whitelist);
    this.blacklist.toCache(cache.matcher.blacklist);
  },

  /**
   * Restores current state from an object.
   */
  fromCache: function( /**Object*/ cache)
  {
    this.whitelist.fromCache(cache.matcher.whitelist);
    this.blacklist.fromCache(cache.matcher.blacklist);
  }
}

/**
 * Shared CombinedMatcher instance for engine switching.
 * @type CombinedMatcher
 */
let EngineMatcher = new CombinedMatcher();

/**
 * Shared CombinedMatcher instance for user agent switching.
 * @type CombinedMatcher
 */
let UserAgentMatcher = new CombinedMatcher();

let AllMatchers = {
  _getRuleMatch: function(rule)
  {
    let matcher = null;
    if (rule instanceof EngineRule || rule instanceof EngineExceptionalRule) matcher = EngineMatcher;
    else if (rule instanceof UserAgentRule || rule instanceof UserAgentExceptionalRule) matcher = UserAgentMatcher;
    return matcher;
  },
  /**
   */
  clear: function()
  {
    EngineMatcher.clear();
    UserAgentMatcher.clear();
  },

  /**
   */
  add: function(rule)
  {
    let matcher = this._getRuleMatch(rule);
    if (matcher)
    {
      matcher.add(rule);
    }
  },

  /**
   */
  remove: function(rule)
  {
    let matcher = this._getRuleMatch(rule);
    if (matcher)
    {
      matcher.remove(rule);
    }
  },


  /**
   * @see Matcher#findKeyword
   */
  findKeyword: function(rule)
  {
    let matcher = this._getRuleMatch(rule);
    if (matcher)
    {
      return matcher.findKeyword(rule);
    }
    return null;
  },

  /**
   * @see Matcher#hasRule
   */
  hasRule: function(rule)
  {
    let matcher = this._getRuleMatch(rule);
    if (matcher)
    {
      return matcher.hasRule(rule);
    }
    return false;
  },

  /**
   * @see Matcher#getKeywordForRule
   */
  getKeywordForRule: function(rule)
  {
    let matcher = this._getRuleMatch(rule);
    if (matcher)
    {
      return matcher.getKeywordForRule(rule);
    }
    return "";
  },

  /**
   * Checks whether a particular rule is slow
   */
  isSlowRule: function( /**RegExpRule*/ rule) /**Boolean*/
  {
    let matcher = this._getRuleMatch(rule);
    if (matcher)
    {
      return matcher.isSlowRule(rule);
    }
    return false;
  },

  /**
   * Stores current state in a JSON'able object.
   */
  toCache: function( /**Object*/ cache)
  {
    cache.EngineMatcher = {};
    cache.UserAgentMatcher = {};
    EngineMatcher.toCache(cache.EngineMatcher);
    UserAgentMatcher.toCache(cache.UserAgentMatcher);
  },

  /**
   * Restores current state from an object.
   */
  fromCache: function( /**Object*/ cache)
  {
    EngineMatcher.fromCache(cache.EngineMatcher);
    UserAgentMatcher.fromCache(cache.UserAgentMatcher);
  }
};