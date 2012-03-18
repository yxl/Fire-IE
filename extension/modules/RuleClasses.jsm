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

/** * @fileOverview Definition of Rule class and its subclasses.
 */

var EXPORTED_SYMBOLS = ["Rule", "InvalidRule", "CommentRule", "ActiveRule", "RegExpRule", "EngineRule", "EngineExceptionalRule", "UserAgentRule", "UserAgentExceptionalRule"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);

Cu.import(baseURL.spec + "Utils.jsm");
Cu.import(baseURL.spec + "RuleNotifier.jsm");

/**
 * Abstract base class for rules
 *
 * @param {String} text   string representation of the rule
 * @constructor
 */
function Rule(text)
{
  this.text = text;
  this.subscriptions = [];
}
Rule.prototype = {
  /**
   * String representation of the rule
   * @type String
   */
  text: null,

  /**
   * Rule subscriptions the rule belongs to
   * @type Array of Subscription
   */
  subscriptions: null,

  /**
   * Serializes the rule to an array of strings for writing out on the disk.
   * @param {Array of String} buffer  buffer to push the serialization results into
   */
  serialize: function(buffer)
  {
    buffer.push("[Rule]");
    buffer.push("text=" + this.text);
  },

  toString: function()
  {
    return this.text;
  }
};

/**
 * Cache for known rules, maps string representation to rule objects.
 * @type Object
 */
Rule.knownRules = {
  __proto__: null
};

/**
 * Regular expression that RegExp rules specified as RegExps should match
 * @type RegExp
 */
Rule.regexpRegExp = /^(@@)?(##)?\/.*\/(?:\$~?[\w\-]+(?:=[^,\s]+)?(?:,~?[\w\-]+(?:=[^,\s]+)?)*)?$/;
/**
 * Regular expression that options on a RegExp rule should match
 * @type RegExp
 */
Rule.optionsRegExp = /\$([\w\-]+(?:=[^,\s]+)?(?:,[\w\-]+(?:=[^,\s]+)?)*)$/;

/**
 * Creates a rule of correct type from its text representation - does the basic parsing and
 * calls the right constructor then.
 *
 * @param {String} text   as in Rule()
 * @return {Rule} rule or null if the rule couldn't be created
 */
Rule.fromText = function(text)
{
  if (text in Rule.knownRules) return Rule.knownRules[text];

  if (!/\S/.test(text)) return null;

  let ret;
  if (text[0] == "!") ret = new CommentRule(text);
  else ret = RegExpRule.fromText(text);

  Rule.knownRules[ret.text] = ret;
  return ret;
}

/**
 * Deserializes a rule
 *
 * @param {Object}  obj map of serialized properties and their values
 * @return {Rule} rule or null if the rule couldn't be created
 */
Rule.fromObject = function(obj)
{
  let ret = Rule.fromText(obj.text);
  if (ret instanceof ActiveRule)
  {
    if ("disabled" in obj) ret._disabled = (obj.disabled == "true");
    if ("hitCount" in obj) ret._hitCount = parseInt(obj.hitCount) || 0;
    if ("lastHit" in obj) ret._lastHit = parseInt(obj.lastHit) || 0;
  }
  return ret;
}

/**
 * Removes unnecessary whitespaces from rule text, will only return null if
 * the input parameter is null.
 */
Rule.normalize = function( /**String*/ text) /**String*/
{
  if (!text) return text;

  // Remove line breaks and such
  text = text.replace(/[^\S ]/g, "");

  if (/^\s*!/.test(text))
  {
    // Don't remove spaces inside comments
    return text.replace(/^\s+/, "").replace(/\s+$/, "");
  }
  else
  {
    return text.replace(/\s/g, "");
  }
}

/**
 * Class for invalid rules
 * @param {String} text see Rule()
 * @param {String} reason Reason why this rule is invalid
 * @constructor
 * @augments Rule
 */
function InvalidRule(text, reason)
{
  Rule.call(this, text);

  this.reason = reason;
}
InvalidRule.prototype = {
  __proto__: Rule.prototype,

  /**
   * Reason why this rule is invalid
   * @type String
   */
  reason: null,

  /**
   * See Rule.serialize()
   */
  serialize: function(buffer)
  {}
};

/**
 * Class for comments
 * @param {String} text see Rule()
 * @constructor
 * @augments Rule
 */
function CommentRule(text)
{
  Rule.call(this, text);
}
CommentRule.prototype = {
  __proto__: Rule.prototype,

  /**
   * See Rule.serialize()
   */
  serialize: function(buffer)
  {}
};

/**
 * Abstract base class for rules that can get hits
 * @param {String} text see Rule()
 * @param {String} domains  (optional) Domains that the rule is restricted to separated by domainSeparator e.g. "foo.com|bar.com|~baz.com"
 * @constructor
 * @augments Rule
 */
function ActiveRule(text, domains)
{
  Rule.call(this, text);

  if (domains)
  {
    this.domainSource = domains;
    this.__defineGetter__("domains", this._getDomains);
  }
}
ActiveRule.prototype = {
  __proto__: Rule.prototype,

  _disabled: false,
  _hitCount: 0,
  _lastHit: 0,

  /**
   * Defines whether the rule is disabled
   * @type Boolean
   */
  get disabled() this._disabled,
  set disabled(value)
  {
    if (value != this._disabled)
    {
      let oldValue = this._disabled;
      this._disabled = value;
      RuleNotifier.triggerListeners("rule.disabled", this, value, oldValue);
    }
    return this._disabled;
  },

  /**
   * Number of hits on the rule since the last reset
   * @type Number
   */
  get hitCount() this._hitCount,
  set hitCount(value)
  {
    if (value != this._hitCount)
    {
      let oldValue = this._hitCount;
      this._hitCount = value;
      RuleNotifier.triggerListeners("rule.hitCount", this, value, oldValue);
    }
    return this._hitCount;
  },

  /**
   * Last time the rule had a hit (in milliseconds since the beginning of the epoch)
   * @type Number
   */
  get lastHit() this._lastHit,
  set lastHit(value)
  {
    if (value != this._lastHit)
    {
      let oldValue = this._lastHit;
      this._lastHit = value;
      RuleNotifier.triggerListeners("rule.lastHit", this, value, oldValue);
    }
    return this._lastHit;
  },

  /**
   * String that the domains property should be generated from
   * @type String
   */
  domainSource: null,

  /**
   * Separator character used in domainSource property, must be overridden by subclasses
   * @type String
   */
  domainSeparator: null,

  /**
   * Map containing domains that this rule should match on/not match on or null if the rule should match on all domains
   * @type Object
   */
  domains: null,

  /**
   * Called first time domains property is requested, triggers _generateDomains method.
   */
  _getDomains: function()
  {
    this._generateDomains();
    return this.domains;
  },

  /**
   * Generates domains property when it is requested for the first time.
   */
  _generateDomains: function()
  {
    let domains = this.domainSource.split(this.domainSeparator);

    delete this.domainSource;
    delete this.domains;

    if (domains.length == 1 && domains[0][0] != "~")
    {
      // Fast track for the common one-domain scenario
      this.domains = {
        __proto__: null,
        "": false
      };
      this.domains[domains[0]] = true;
    }
    else
    {
      let hasIncludes = false;
      for (let i = 0; i < domains.length; i++)
      {
        let domain = domains[i];
        if (domain == "") continue;

        let include;
        if (domain[0] == "~")
        {
          include = false;
          domain = domain.substr(1);
        }
        else
        {
          include = true;
          hasIncludes = true;
        }

        if (!this.domains) this.domains = {
          __proto__: null
        };

        this.domains[domain] = include;
      }
      this.domains[""] = !hasIncludes;
    }
  },

  /**
   * Checks whether this rule is active on a domain.
   */
  isActiveOnDomain: function( /**String*/ docDomain) /**Boolean*/
  {
    // If no domains are set the rule matches everywhere
    if (!this.domains) return true;

    // If the document has no host name, match only if the rule isn't restricted to specific domains
    if (!docDomain) return this.domains[""];

    docDomain = docDomain.replace(/\.+$/, "").toUpperCase();

    while (true)
    {
      if (docDomain in this.domains) return this.domains[docDomain];

      let nextDot = docDomain.indexOf(".");
      if (nextDot < 0) break;
      docDomain = docDomain.substr(nextDot + 1);
    }
    return this.domains[""];
  },

  /**
   * Checks whether this rule is active only on a domain and its subdomains.
   */
  isActiveOnlyOnDomain: function( /**String*/ docDomain) /**Boolean*/
  {
    if (!docDomain || !this.domains || this.domains[""]) return false;

    docDomain = docDomain.replace(/\.+$/, "").toUpperCase();

    for (let domain in this.domains)
    if (this.domains[domain] && domain != docDomain && (domain.length <= docDomain.length || domain.indexOf("." + docDomain) != domain.length - docDomain.length - 1)) return false;

    return true;
  },

  /**
   * See Rule.serialize()
   */
  serialize: function(buffer)
  {
    if (this._disabled || this._hitCount || this._lastHit)
    {
      Rule.prototype.serialize.call(this, buffer);
      if (this._disabled) buffer.push("disabled=true");
      if (this._hitCount) buffer.push("hitCount=" + this._hitCount);
      if (this._lastHit) buffer.push("lastHit=" + this._lastHit);
    }
  }
};

/**
 * Abstract base class for RegExp-based rules
 * @param {String} text see Rule()
 * @param {String} regexpSource rule part that the regular expression should be build from
 * @param {Boolean} matchCase   (optional) Defines whether the rule should distinguish between lower and upper case letters
 * @param {String} domains      (optional) Domains that the rule is restricted to, e.g. "foo.com|bar.com|~baz.com"
 * @constructor
 * @augments ActiveRule
 */
function RegExpRule(text, regexpSource, matchCase, domains)
{
  ActiveRule.call(this, text, domains);

  if (matchCase) this.matchCase = matchCase;

  if (regexpSource.length >= 2 && regexpSource[0] == "/" && regexpSource[regexpSource.length - 1] == "/")
  {
    // The rule is a regular expression - convert it immediately to catch syntax errors
    this.regexp = new RegExp(regexpSource.substr(1, regexpSource.length - 2), this.matchCase ? "" : "i");
  }
  else
  {
    // No need to convert this rule to regular expression yet, do it on demand
    this.regexpSource = regexpSource;
    this.__defineGetter__("regexp", this._generateRegExp);
  }
}
RegExpRule.prototype = {
  __proto__: ActiveRule.prototype,

  /**
   * @see ActiveRule.domainSeparator
   */
  domainSeparator: "|",

  /**
   * Expression from which a regular expression should be generated - for delayed creation of the regexp property
   * @type String
   */
  regexpSource: null,
  /**
   * Regular expression to be used when testing against this rule
   * @type RegExp
   */
  regexp: null,
  /**
   * Defines whether the rule should distinguish between lower and upper case letters
   * @type Boolean
   */
  matchCase: false,

  /**
   * Generates regexp property when it is requested for the first time.
   * @return {RegExp}
   */
  _generateRegExp: function()
  {
    // Remove multiple wildcards
    let source = this.regexpSource.replace(/\*+/g, "*");

    // Remove leading wildcards
    if (source[0] == "*") source = source.substr(1);

    // Remove trailing wildcards
    let pos = source.length - 1;
    if (pos >= 0 && source[pos] == "*") source = source.substr(0, pos);

    source = source.replace(/\^\|$/, "^") // remove anchors following separator placeholder
    .replace(/\W/g, "\\$&") // escape special symbols
    .replace(/\\\*/g, ".*") // replace wildcards by .*
    // process separator placeholders (all ANSI charaters but alphanumeric characters and _%.-)
    .replace(/\\\^/g, "(?:[\\x00-\\x24\\x26-\\x2C\\x2F\\x3A-\\x40\\x5B-\\x5E\\x60\\x7B-\\x80]|$)").replace(/^\\\|\\\|/, "^[\\w\\-]+:\\/+(?!\\/)(?:[^.\\/]+\\.)*?") // process extended anchor at expression start
    .replace(/^\\\|/, "^") // process anchor at expression start
    .replace(/\\\|$/, "$"); // process anchor at expression end
    let regexp = new RegExp(source, this.matchCase ? "" : "i");

    delete this.regexp;
    delete this.regexpSource;
    return (this.regexp = regexp);
  },

  /**
   * Tests whether the URL matches this rule
   * @param {String} location URL to be tested
   * @param {String} docDomain domain name of the document that loads the URL
   * @return {Boolean} true in case of a match
   */
  matches: function(location, docDomain)
  {
    if (this.regexp.test(location) && this.isActiveOnDomain(docDomain))
    {
      return true;
    }

    return false;
  }
};

/**
 * Creates a RegExp rule from its text representation
 * @param {String} text   same as in Rule()
 */
RegExpRule.fromText = function(text)
{
  let blocking = true;
  let userAgent = false;
  let origText = text;
  if (text.indexOf("@@") == 0)
  {
    blocking = false;
    text = text.substr(2);
  }
  if (text.indexOf("##") == 0)
  {
    userAgent = true;
    text = text.substr(2);
  }

  let matchCase = null;
  let domains = null;
  let options;
  if (Rule.optionsRegExp.test(text))
  {
    options = RegExp.$1.toUpperCase().split(",");
    text = RegExp.leftContext;
    for each(let option in options)
    {
      let value = null;
      let separatorIndex = option.indexOf("=");
      if (separatorIndex >= 0)
      {
        value = option.substr(separatorIndex + 1);
        option = option.substr(0, separatorIndex);
      }
      option = option.replace(/-/, "_");
      if (option == "MATCH_CASE") matchCase = true;
      else if (option == "DOMAIN" && typeof value != "undefined") domains = value;
    }
  }

  try
  {
    if (blocking)
    {
      if (userAgent)
      {
        return new UserAgentRule(origText, text, matchCase, domains);
      }
      else
      {
        return new EngineRule(origText, text, matchCase, domains);
      }
    }
    else
    {
      if (userAgent)
      {
        return new UserAgentExceptionalRule(origText, text, matchCase, domains);
      }
      else
      {
        return new EngineExceptionalRule(origText, text, matchCase, domains);
      }
    }
  }
  catch (e)
  {
    return new InvalidRule(text, e);
  }
}

/**
 * Class for engine switch rules
 * @param {String} text see Rule()
 * @param {String} regexpSource see RegExpRule()
 * @param {Boolean} matchCase see RegExpRule()
 * @param {String} domains see RegExpRule()
 * @constructor
 * @augments RegExpRule
 */
function EngineRule(text, regexpSource, matchCase, domains)
{
  RegExpRule.call(this, text, regexpSource, matchCase, domains);
}
EngineRule.prototype = {
  __proto__: RegExpRule.prototype
};

/**
 * Class for user agent switch rules
 * @param {String} text see Rule()
 * @param {String} regexpSource see RegExpRule()
 * @param {Boolean} matchCase see RegExpRule()
 * @param {String} domains see RegExpRule()
 * @constructor
 * @augments RegExpRule
 */
function UserAgentRule(text, regexpSource, matchCase, domains)
{
  RegExpRule.call(this, text, regexpSource, matchCase, domains);
}
UserAgentRule.prototype = {
  __proto__: RegExpRule.prototype
};

/**
 * Class for engine exceptional rules
 * @param {String} text see Rule()
 * @param {String} regexpSource see RegExpRule()
 * @param {Boolean} matchCase see RegExpRule()
 * @param {String} domains see RegExpRule()
 * @constructor
 * @augments RegExpRule
 */
function EngineExceptionalRule(text, regexpSource, matchCase, domains)
{
  RegExpRule.call(this, text, regexpSource, matchCase, domains);
}
EngineExceptionalRule.prototype = {
  __proto__: RegExpRule.prototype
}

/**
 * Class for user agent exceptional rules
 * @param {String} text see Rule()
 * @param {String} regexpSource see RegExpRule()
 * @param {Boolean} matchCase see RegExpRule()
 * @param {String} domains see RegExpRule()
 * @constructor
 * @augments RegExpRule
 */
function UserAgentExceptionalRule(text, regexpSource, matchCase, domains)
{
  RegExpRule.call(this, text, regexpSource, matchCase, domains);
}
UserAgentExceptionalRule.prototype = {
  __proto__: RegExpRule.prototype,
}