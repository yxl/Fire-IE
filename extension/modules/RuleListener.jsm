/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

/**
 * @fileOverview Component synchronizing rule storage with Matcher instances.
 */

var EXPORTED_SYMBOLS = ["RuleListener"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

Cu.import(baseURL.spec + "RuleStorage.jsm");
Cu.import(baseURL.spec + "RuleNotifier.jsm");
Cu.import(baseURL.spec + "Matcher.jsm");
Cu.import(baseURL.spec + "RuleClasses.jsm");
Cu.import(baseURL.spec + "SubscriptionClasses.jsm");
Cu.import(baseURL.spec + "Prefs.jsm");
Cu.import(baseURL.spec + "Utils.jsm");

/**
 * Version of the data cache file, files with different version will be ignored.
 */
const cacheVersion = 2;

/**
 * Value of the RuleListener.batchMode property.
 * @type Boolean
 */
let batchMode = false;

/**
 * Increases on rule changes, rules will be saved if it exceeds 1.
 * @type Integer
 */
let isDirty = 0;

/**
 * This object can be used to change properties of the rule change listeners.
 * @class
 */
var RuleListener = {
  /**
   * Called on module initialization, registers listeners for RuleStorage changes
   */
  startup: function()
  {


    RuleNotifier.addListener(function(action, item, newValue, oldValue)
    {
      if (/^rule\.(.*)/.test(action)) onRuleChange(RegExp.$1, item, newValue, oldValue);
      else if (/^subscription\.(.*)/.test(action)) onSubscriptionChange(RegExp.$1, item, newValue, oldValue);
      else onGenericChange(action, item);
    });

    let initialized = false;
    let cacheFile = Utils.resolveFilePath(Prefs.data_directory);
    cacheFile.append("cache.js");
    if (cacheFile.exists())
    {
      // Yay, fast startup!
      try
      {

        let stream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
        stream.init(cacheFile, 0x01, 0444, 0);

        let json = Cc["@mozilla.org/dom/json;1"].createInstance(Ci.nsIJSON);
        let cache = json.decodeFromStream(stream, "UTF-8");

        stream.close();

        if (cache.version == cacheVersion && cache.patternsTimestamp == RuleStorage.sourceFile.clone().lastModifiedTime)
        {
          AllMatchers.fromCache(cache);

          // We still need to load patterns.ini if certain properties are accessed
          var loadDone = false;

          function trapProperty(obj, prop)
          {
            var origValue = obj[prop];
            delete obj[prop];
            Object.defineProperty(obj, prop, {
              get: function()
              {
                delete obj[prop];
                obj[prop] = origValue;
                if (!loadDone)
                {

                  loadDone = true;
                  RuleStorage.loadFromDisk(null, true);

                }
                return obj[prop];
              },
              set: function(value)
              {
                delete obj[prop];
                return obj[prop] = value;
              },
              enumerable: true,
              configurable: true
            });
          }

          for each(let prop in ["fileProperties", "subscriptions", "knownSubscriptions", "addSubscription", "removeSubscription", "updateSubscriptionRules", "addRule", "removeRule", "increaseHitCount", "resetHitCounts"])
          {
            trapProperty(RuleStorage, prop);
          }
          trapProperty(Rule, "fromText");
          trapProperty(Rule, "knownRules");
          trapProperty(Subscription, "fromURL");
          trapProperty(Subscription, "knownSubscriptions");

          initialized = true;
        }
      }
      catch (e)
      {
        Cu.reportError(e);
      }
    }

    // If we failed to restore from cache - load patterns.ini
    if (!initialized) RuleStorage.loadFromDisk();

    Services.obs.addObserver(RuleListenerPrivate, "browser:purge-session-history", true);
  },

  /**
   * Called on module shutdown.
   */
  shutdown: function()
  {

    if (isDirty > 0) RuleStorage.saveToDisk();

  },

  /**
   * Set to true when executing many changes, changes will only be fully applied after this variable is set to false again.
   * @type Boolean
   */
  get batchMode()
  {
    return batchMode;
  },
  set batchMode(value)
  {
    batchMode = value;
  },

  /**
   * Increases "dirty factor" of the rules and calls RuleStorage.saveToDisk()
   * if it becomes 1 or more. Save is executed delayed to prevent multiple
   * subsequent calls. If the parameter is 0 it forces saving rules if any
   * changes were recorded after the previous save.
   */
  setDirty: function( /**Integer*/ factor)
  {
    if (factor == 0 && isDirty > 0) isDirty = 1;
    else isDirty += factor;
    if (isDirty >= 1 && !rulesFlushScheduled)
    {
      Utils.runAsync(flushRulesInternal);
      rulesFlushScheduled = true;
    }
  }
};

/**
 * Private nsIObserver implementation.
 * @class
 */
var RuleListenerPrivate = {
  observe: function(subject, topic, data)
  {
    if (topic == "browser:purge-session-history" && Prefs.clearStatsOnHistoryPurge)
    {
      RuleStorage.resetHitCounts();
      RuleListener.setDirty(0); // Force saving to disk
      Prefs.recentReports = "[]";
    }
  },
  QueryInterface: XPCOMUtils.generateQI([Ci.nsISupportsWeakReference, Ci.nsIObserver])
};


let rulesFlushScheduled = false;

function flushRulesInternal()
{
  rulesFlushScheduled = false;
  RuleStorage.saveToDisk();
}

/**
 * Notifies Matcher instances about a new rule
 * if necessary.
 * @param {Rule} rule rule that has been added
 */
function addRule(rule)
{
  if (!(rule instanceof ActiveRule) || rule.disabled) return;

  let hasEnabled = false;
  for (let i = 0; i < rule.subscriptions.length; i++)
    if (!rule.subscriptions[i].disabled) hasEnabled = true;
  if (!hasEnabled) return;

  if (rule instanceof RegExpRule) AllMatchers.add(rule);
}

/**
 * Notifies Matcher instances about removal of a rule
 * if necessary.
 * @param {Rule} rule rule that has been removed
 */
function removeRule(rule)
{
  if (!(rule instanceof ActiveRule)) return;

  if (!rule.disabled)
  {
    let hasEnabled = false;
    for (let i = 0; i < rule.subscriptions.length; i++)
      if (!rule.subscriptions[i].disabled) hasEnabled = true;
    if (hasEnabled) return;
  }

  if (rule instanceof RegExpRule)
  {
    AllMatchers.remove(rule);
  }
}

/**
 * Subscription change listener
 */
function onSubscriptionChange(action, subscription, newValue, oldValue)
{
  if (action == "homepage" || action == "downloadStatus" || action == "lastDownload") RuleListener.setDirty(0.2);
  else RuleListener.setDirty(1);

  if (action != "added" && action != "removed" && action != "disabled" && action != "updated") return;

  if (action != "removed" && !(subscription.url in RuleStorage.knownSubscriptions))
  {
    // Ignore updates for subscriptions not in the list
    return;
  }

  if ((action == "added" || action == "removed" || action == "updated") && subscription.disabled)
  {
    // Ignore adding/removing/updating of disabled subscriptions
    return;
  }

  if (action == "added" || action == "removed" || action == "disabled")
  {
    let method = (action == "added" || (action == "disabled" && newValue == false) ? addRule : removeRule);
    if (subscription.rules) subscription.rules.forEach(method);
  }
  else if (action == "updated")
  {
    subscription.oldRules.forEach(removeRule);
    subscription.rules.forEach(addRule);
  }
}

/**
 * Rule change listener
 */
function onRuleChange(action, rule, newValue, oldValue)
{
  if (action == "hitCount" || action == "lastHit") RuleListener.setDirty(0.0001);
  else if (action == "disabled" || action == "moved") RuleListener.setDirty(0.2);
  else RuleListener.setDirty(1);

  if (action != "added" && action != "removed" && action != "disabled") return;

  if ((action == "added" || action == "removed") && rule.disabled)
  {
    // Ignore adding/removing of disabled rules
    return;
  }

  if (action == "added" || (action == "disabled" && newValue == false)) addRule(rule);
  else removeRule(rule);
}

/**
 * Generic notification listener
 */
function onGenericChange(action)
{
  if (action == "load")
  {
    isDirty = 0;

    AllMatchers.clear();
    for each(let subscription in RuleStorage.subscriptions)
    if (!subscription.disabled) subscription.rules.forEach(addRule);
  }
  else if (action == "save")
  {
    isDirty = 0;

    let cache = {
      version: cacheVersion,
      patternsTimestamp: RuleStorage.sourceFile.clone().lastModifiedTime
    };
    AllMatchers.toCache(cache);

    let cacheFile = Utils.resolveFilePath(Prefs.data_directory);
    cacheFile.append("cache.js");

    try
    {
      // Make sure the file's parent directory exists
      cacheFile.parent.create(Ci.nsIFile.DIRECTORY_TYPE, 0755);
    }
    catch (e)
    {}

    try
    {
      let fileStream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
      fileStream.init(cacheFile, 0x02 | 0x08 | 0x20, 0644, 0);

      let json = Cc["@mozilla.org/dom/json;1"].createInstance(Ci.nsIJSON);
      if (Services.vc.compare(Utils.platformVersion, "5.0") >= 0)
      {
        json.encodeToStream(fileStream, "UTF-8", false, cache);
        fileStream.close();
      }
      else
      {
        // nsIJSON.encodeToStream is broken in Gecko 4.0 and below, see bug 633934
        let stream = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(Ci.nsIConverterOutputStream);
        stream.init(fileStream, "UTF-8", 16384, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
        stream.writeString(json.encode(cache));
        stream.close();
      }
    }
    catch (e)
    {
      delete RuleStorage.fileProperties.cacheTimestamp;
      Cu.reportError(e);
    }
  }
}