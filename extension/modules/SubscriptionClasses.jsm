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
 * @fileOverview Definition of Subscription class and its subclasses.
 */

var EXPORTED_SYMBOLS = ["Subscription", "SpecialSubscription", "RegularSubscription", "ExternalSubscription", "DownloadableSubscription"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);

Cu.import("resource://gre/modules/Services.jsm");

Cu.import(baseURL.spec + "Utils.jsm");
Cu.import(baseURL.spec + "RuleClasses.jsm");
Cu.import(baseURL.spec + "RuleNotifier.jsm");

/**
 * Abstract base class for rule subscriptions
 *
 * @param {String} url    download location of the subscription
 * @param {String} [title]  title of the rule subscription
 * @constructor
 */
function Subscription(url, title)
{
  this.url = url;
  this.rules = [];
  this._title = title || Utils.getString("newGroup.title");
  Subscription.knownSubscriptions[url] = this;
}

Subscription.prototype = {
  /**
   * Download location of the subscription
   * @type String
   */
  url: null,

  /**
   * Rules contained in the rule subscription
   * @type Array of Rule
   */
  rules: null,

  _title: null,
  _disabled: false,

  /**
   * Title of the rule subscription
   * @type String
   */
  get title() this._title,
  set title(value)
  {
    if (value != this._title)
    {
      let oldValue = this._title;
      this._title = value;
      RuleNotifier.triggerListeners("subscription.title", this, value, oldValue);
    }
    return this._title;
  },

  /**
   * Defines whether the rules in the subscription should be disabled
   * @type Boolean
   */
  get disabled() this._disabled,
  set disabled(value)
  {
    if (value != this._disabled)
    {
      let oldValue = this._disabled;
      this._disabled = value;
      RuleNotifier.triggerListeners("subscription.disabled", this, value, oldValue);
    }
    return this._disabled;
  },

  /**
   * Serializes the rule to an array of strings for writing out on the disk.
   * @param {Array of String} buffer  buffer to push the serialization results into
   */
  serialize: function(buffer)
  {
    buffer.push("[Subscription]");
    buffer.push("url=" + this.url);
    buffer.push("title=" + this._title);
    if (this._disabled) buffer.push("disabled=true");
  },

  serializeRules: function(buffer)
  {
    for each(let rule in this.rules)
    buffer.push(rule.text.replace(/\[/g, "\\["));
  },

  toString: function()
  {
    let buffer = [];
    this.serialize(buffer);
    return buffer.join("\n");
  }
};

/**
 * Cache for known rule subscriptions, maps URL to subscription objects.
 * @type Object
 */
Subscription.knownSubscriptions = {
  __proto__: null
};

/**
 * Returns a subscription from its URL, creates a new one if necessary.
 * @param {String} url  URL of the subscription
 * @return {Subscription} subscription or null if the subscription couldn't be created
 */
Subscription.fromURL = function(url)
{
  if (url in Subscription.knownSubscriptions) return Subscription.knownSubscriptions[url];

  try
  {
    // Test URL for validity
    url = Services.io.newURI(url, null, null).spec;
    return new DownloadableSubscription(url, null);
  }
  catch (e)
  {
    return new SpecialSubscription(url);
  }
}

/**
 * Deserializes a subscription
 *
 * @param {Object}  obj map of serialized properties and their values
 * @return {Subscription} subscription or null if the subscription couldn't be created
 */
Subscription.fromObject = function(obj)
{
  let result;
  try
  {
    obj.url = Services.io.newURI(obj.url, null, null).spec;

    // URL is valid - this is a downloadable subscription
    result = new DownloadableSubscription(obj.url, obj.title);
    if ("downloadStatus" in obj) result._downloadStatus = obj.downloadStatus;
    if ("lastModified" in obj) result.lastModified = obj.lastModified;
    if ("lastSuccess" in obj) result.lastSuccess = parseInt(obj.lastSuccess) || 0;
    if ("lastCheck" in obj) result._lastCheck = parseInt(obj.lastCheck) || 0;
    if ("expires" in obj) result.expires = parseInt(obj.expires) || 0;
    if ("errors" in obj) result._errors = parseInt(obj.errors) || 0;
    if ("requiredVersion" in obj)
    {
      result.requiredVersion = obj.requiredVersion;
      if (Services.vc.compare(result.requiredVersion, Utils.addonVersion) > 0) result.upgradeRequired = true;
    }
    if ("homepage" in obj) result._homepage = obj.homepage;
    if ("lastDownload" in obj) result._lastDownload = parseInt(obj.lastDownload) || 0;
  }
  catch (e)
  {
    // Invalid URL - custom rule group
    if (!("title" in obj))
    {
      // Backwards compatibility - titles and rule types were originally
      // determined by group identifier.
      if (obj.url == "~exceptional~") obj.defaults = "exceptional";
      else if (obj.url == "~custom~") obj.defaults = "custom";
      if ("defaults" in obj) obj.title = Utils.getString(obj.defaults + "Group.title");
    }
    result = new SpecialSubscription(obj.url, obj.title);
    if ("defaults" in obj) result.defaults = obj.defaults.split(" ");
  }
  if ("disabled" in obj) result._disabled = (obj.disabled == "true");

  return result;
}

/**
 * Class for special rule subscriptions (user's rules)
 * @param {String} url see Subscription()
 * @param {String} [title]  see Subscription()
 * @constructor
 * @augments Subscription
 */
function SpecialSubscription(url, title)
{
  Subscription.call(this, url, title);
}
SpecialSubscription.prototype = {
  __proto__: Subscription.prototype,

  /**
   * Rule types that should be added to this subscription by default
   * (entries should correspond to keys in SpecialSubscription.defaultsMap).
   * @type Array of String
   */
  defaults: null,

  /**
   * Tests whether a rule should be added to this group by default
   * @param {Rule} rule rule to be tested
   * @return {Boolean}
   */
  isDefaultFor: function(rule)
  {
    if (this.defaults && this.defaults.length)
    {
      for each(let type in this.defaults)
      {
        if (rule instanceof SpecialSubscription.defaultsMap[type]) return true;
        if (!(rule instanceof ActiveRule) && type == "blacklist") return true;
      }
    }

    return false;
  },

  /**
   * See Subscription.serialize()
   */
  serialize: function(buffer)
  {
    Subscription.prototype.serialize.call(this, buffer);
    if (this.defaults && this.defaults.length) buffer.push("defaults=" + this.defaults.filter(function(type) type in SpecialSubscription.defaultsMap).join(" "));
    if (this._lastDownload) buffer.push("lastDownload=" + this._lastDownload);
  }
};

SpecialSubscription.defaultsMap = {
  __proto__: null,
  "exceptional": EngineExceptionalRule,
  "custom": EngineRule
};

/**
 * Creates a new user-defined rule group.
 * @param {String} [title]  title of the new rule group
 * @result {SpecialSubscription}
 */
SpecialSubscription.create = function(title)
{
  let url;
  do
  {
    url = "~user~" + Math.round(Math.random() * 1000000);
  } while (url in Subscription.knownSubscriptions);
  return new SpecialSubscription(url, title)
};

/**
 * Creates a new user-defined rule group and adds the given rule to it.
 * This group will act as the default group for this rule type.
 */
SpecialSubscription.createForRule = function( /**Rule*/ rule) /**SpecialSubscription*/
{
  let subscription = SpecialSubscription.create();
  subscription.rules.push(rule);
  for (let type in SpecialSubscription.defaultsMap)
  {
    if (rule instanceof SpecialSubscription.defaultsMap[type]) subscription.defaults = [type];
  }
  if (!subscription.defaults) subscription.defaults = ["custom"];
  subscription.title = Utils.getString(subscription.defaults[0] + "Group.title");
  return subscription;
};

/**
 * Abstract base class for regular rule subscriptions (both internally and externally updated)
 * @param {String} url    see Subscription()
 * @param {String} [title]  see Subscription()
 * @constructor
 * @augments Subscription
 */
function RegularSubscription(url, title)
{
  Subscription.call(this, url, title || url);
}
RegularSubscription.prototype = {
  __proto__: Subscription.prototype,

  _homepage: null,
  _lastDownload: 0,

  /**
   * Rule subscription homepage if known
   * @type String
   */
  get homepage() this._homepage,
  set homepage(value)
  {
    if (value != this._homepage)
    {
      let oldValue = this._homepage;
      this._homepage = value;
      RuleNotifier.triggerListeners("subscription.homepage", this, value, oldValue);
    }
    return this._homepage;
  },

  /**
   * Time of the last subscription download (in seconds since the beginning of the epoch)
   * @type Number
   */
  get lastDownload() this._lastDownload,
  set lastDownload(value)
  {
    if (value != this._lastDownload)
    {
      let oldValue = this._lastDownload;
      this._lastDownload = value;
      RuleNotifier.triggerListeners("subscription.lastDownload", this, value, oldValue);
    }
    return this._lastDownload;
  },

  /**
   * See Subscription.serialize()
   */
  serialize: function(buffer)
  {
    Subscription.prototype.serialize.call(this, buffer);
    if (this._homepage) buffer.push("homepage=" + this._homepage);
    if (this._lastDownload) buffer.push("lastDownload=" + this._lastDownload);
  }
};

/**
 * Class for rule subscriptions updated by externally (by other extension)
 * @param {String} url    see Subscription()
 * @param {String} [title]  see Subscription()
 * @constructor
 * @augments RegularSubscription
 */
function ExternalSubscription(url, title)
{
  RegularSubscription.call(this, url, title);
}
ExternalSubscription.prototype = {
  __proto__: RegularSubscription.prototype,

  /**
   * See Subscription.serialize()
   */
  serialize: function(buffer)
  {
    throw "Unexpected call, external subscriptions should not be serialized";
  }
};

/**
 * Class for rule subscriptions updated by externally (by other extension)
 * @param {String} url  see Subscription()
 * @param {String} [title]  see Subscription()
 * @constructor
 * @augments RegularSubscription
 */
function DownloadableSubscription(url, title)
{
  RegularSubscription.call(this, url, title);
}
DownloadableSubscription.prototype = {
  __proto__: RegularSubscription.prototype,

  _downloadStatus: null,
  _lastCheck: 0,
  _errors: 0,


  /**
   * Status of the last download (ID of a string)
   * @type String
   */
  get downloadStatus() this._downloadStatus,
  set downloadStatus(value)
  {
    let oldValue = this._downloadStatus;
    this._downloadStatus = value;
    RuleNotifier.triggerListeners("subscription.downloadStatus", this, value, oldValue);
    return this._downloadStatus;
  },

  /**
   * Value of the Last-Modified header returned by the server on last download
   * @type String
   */
  lastModified: null,

  /**
   * Time of the last successful download (in seconds since the beginning of the
   * epoch).
   */
  lastSuccess: 0,

  /**
   * Time when the subscription was considered for an update last time (in seconds
   * since the beginning of the epoch). This will be used to increase softExpiration
   * if the user doesn't use Fire IE for some time.
   * @type Number
   */
  get lastCheck() this._lastCheck,
  set lastCheck(value)
  {
    if (value != this._lastCheck)
    {
      let oldValue = this._lastCheck;
      this._lastCheck = value;
      RuleNotifier.triggerListeners("subscription.lastCheck", this, value, oldValue);
    }
    return this._lastCheck;
  },

  /**
   * Hard expiration time of the rule subscription (in seconds since the beginning of the epoch)
   * @type Number
   */
  expires: 0,

  /**
   * Number of download failures since last success
   * @type Number
   */
  get errors() this._errors,
  set errors(value)
  {
    if (value != this._errors)
    {
      let oldValue = this._errors;
      this._errors = value;
      RuleNotifier.triggerListeners("subscription.errors", this, value, oldValue);
    }
    return this._errors;
  },

  /**
   * Minimal add-on's version required for this subscription
   * @type String
   */
  requiredVersion: null,

  /**
   * Should be true if requiredVersion is higher than current add-on's version
   * @type Boolean
   */
  upgradeRequired: false,

  /**
   * See Subscription.serialize()
   */
  serialize: function(buffer)
  {
    RegularSubscription.prototype.serialize.call(this, buffer);
    if (this.downloadStatus) buffer.push("downloadStatus=" + this.downloadStatus);
    if (this.lastModified) buffer.push("lastModified=" + this.lastModified);
    if (this.lastSuccess) buffer.push("lastSuccess=" + this.lastSuccess);
    if (this.lastCheck) buffer.push("lastCheck=" + this.lastCheck);
    if (this.expires) buffer.push("expires=" + this.expires);
    if (this.errors) buffer.push("errors=" + this.errors);
    if (this.requiredVersion) buffer.push("requiredVersion=" + this.requiredVersion);
  }
};