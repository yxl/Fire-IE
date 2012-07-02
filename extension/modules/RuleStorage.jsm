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
 * @fileOverview RuleStorage class responsible to managing user's subscriptions and rules.
 */

var EXPORTED_SYMBOLS = ["RuleStorage"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);

Cu.import("resource://gre/modules/Services.jsm");

Cu.import(baseURL.spec + "Utils.jsm");
Cu.import(baseURL.spec + "Prefs.jsm");
Cu.import(baseURL.spec + "RuleClasses.jsm");
Cu.import(baseURL.spec + "SubscriptionClasses.jsm");
Cu.import(baseURL.spec + "RuleNotifier.jsm");


/**
 * Version number of the rule storage file format.
 * @type Integer
 */
const formatVersion = 0;

/**
 * This class reads user's rules from disk, manages them in memory and writes them back.
 * @class
 */
var RuleStorage = {
  /**
   * Version number of the patterns.ini format used.
   * @type Integer
   */
  get formatVersion() formatVersion,

  /**
   * File that the rule list has been loaded from and should be saved to
   * @type nsIFile
   */
  get sourceFile()
  {
    // Place the file in the data dir
    let file = Utils.resolveFilePath(Prefs.data_directory);;
    if (file)
    {
      file.append("patterns.ini");
    }
    else
    {
      // Data directory pref misconfigured? Try the default value
      try
      {
        file = Utils.resolveFilePath(Prefs.defaultBranch.getCharPref("data_directory"));
        if (file) file.append("patterns.ini");
      }
      catch (e)
      {}
    }

    if (!file) Cu.reportError("Fire-IE: Failed to resolve rule file location.");

    this.__defineGetter__("sourceFile", function() file);
    return this.sourceFile;
  },

  /**
   * Map of properties listed in the rule storage file before the sections
   * start. Right now this should be only the format version.
   */
  fileProperties: {
    __proto__: null
  },

  /**
   * List of rule subscriptions containing all rules
   * @type Array of Subscription
   */
  subscriptions: [],

  /**
   * Map of subscriptions already on the list, by their URL/identifier
   * @type Object
   */
  knownSubscriptions: {
    __proto__: null
  },

  /**
   * Finds the rule group that a rule should be added to by default. Will
   * return null if this group doesn't exist yet.
   */
  getGroupForRule: function( /**Rule*/ rule) /**SpecialSubscription*/
  {
    let generalSubscription = null;
    for each(let subscription in RuleStorage.subscriptions)
    {
      if (subscription instanceof SpecialSubscription)
      {
        // Always prefer specialized subscriptions
        if (subscription.isDefaultFor(rule)) return subscription;

        // If this is a general subscription - store it as fallback
        if (!generalSubscription && (!subscription.defaults || !subscription.defaults.length)) generalSubscription = subscription;
      }
    }
    return generalSubscription;
  },

  /**
   * Adds a rule subscription to the list
   * @param {Subscription} subscription rule subscription to be added
   * @param {Boolean} silent  if true, no listeners will be triggered (to be used when rule list is reloaded)
   */
  addSubscription: function(subscription, silent)
  {
    if (subscription.url in RuleStorage.knownSubscriptions) return;

    RuleStorage.subscriptions.push(subscription);
    RuleStorage.knownSubscriptions[subscription.url] = subscription;
    addSubscriptionRules(subscription);

    if (!silent) RuleNotifier.triggerListeners("subscription.added", subscription);
  },

  /**
   * Removes a rule subscription from the list
   * @param {Subscription} subscription rule subscription to be removed
   * @param {Boolean} silent  if true, no listeners will be triggered (to be used when rule list is reloaded)
   */
  removeSubscription: function(subscription, silent)
  {
    for (let i = 0; i < RuleStorage.subscriptions.length; i++)
    {
      if (RuleStorage.subscriptions[i].url == subscription.url)
      {
        removeSubscriptionRules(subscription);

        RuleStorage.subscriptions.splice(i--, 1);
        delete RuleStorage.knownSubscriptions[subscription.url];
        if (!silent) RuleNotifier.triggerListeners("subscription.removed", subscription);
        return;
      }
    }
  },

  /**
   * Moves a subscription in the list to a new position.
   * @param {Subscription} subscription rule subscription to be moved
   * @param {Subscription} [insertBefore] rule subscription to insert before
   *        (if omitted the subscription will be put at the end of the list)
   */
  moveSubscription: function(subscription, insertBefore)
  {
    let currentPos = RuleStorage.subscriptions.indexOf(subscription);
    if (currentPos < 0) return;

    let newPos = insertBefore ? RuleStorage.subscriptions.indexOf(insertBefore) : -1;
    if (newPos < 0) newPos = RuleStorage.subscriptions.length;

    if (currentPos < newPos) newPos--;
    if (currentPos == newPos) return;

    RuleStorage.subscriptions.splice(currentPos, 1);
    RuleStorage.subscriptions.splice(newPos, 0, subscription);
    RuleNotifier.triggerListeners("subscription.moved", subscription);
  },

  /**
   * Replaces the list of rules in a subscription by a new list
   * @param {Subscription} subscription rule subscription to be updated
   * @param {Array of Rule} rules new rule lsit
   */
  updateSubscriptionRules: function(subscription, rules)
  {
    removeSubscriptionRules(subscription);
    subscription.oldRules = subscription.rules;
    subscription.rules = rules;
    addSubscriptionRules(subscription);
    RuleNotifier.triggerListeners("subscription.updated", subscription);
    delete subscription.oldRules;

    // Do not keep empty subscriptions disabled
    if (subscription instanceof SpecialSubscription && !subscription.rules.length && subscription.disabled) subscription.disabled = false;
  },

  /**
   * Adds a user-defined rule to the list
   * @param {Rule} rule
   * @param {SpecialSubscription} [subscription] particular group that the rule should be added to
   * @param {Integer} [position] position within the subscription at which the rule should be added
   * @param {Boolean} silent  if true, no listeners will be triggered (to be used when rule list is reloaded)
   */
  addRule: function(rule, subscription, position, silent)
  {
    if (!subscription)
    {
      if (rule.subscriptions.some(function(s) s instanceof SpecialSubscription)) return; // No need to add
      subscription = RuleStorage.getGroupForRule(rule);
    }
    if (!subscription)
    {
      // No group for this rule exists, create one
      subscription = SpecialSubscription.createForRule(rule);
      this.addSubscription(subscription);
      return;
    }

    if (typeof position == "undefined") position = subscription.rules.length;

    if (rule.subscriptions.indexOf(subscription) < 0) rule.subscriptions.push(subscription);
    subscription.rules.splice(position, 0, rule);
    if (!silent) RuleNotifier.triggerListeners("rule.added", rule, subscription, position);
  },

  /**
   * Removes a user-defined rule from the list
   * @param {Rule} rule
   * @param {SpecialSubscription} [subscription] a particular rule group that
   *      the rule should be removed from (if ommited will be removed from all subscriptions)
   * @param {Integer} [position]  position inside the rule group at which the
   *      rule should be removed (if ommited all instances will be removed)
   */
  removeRule: function(rule, subscription, position)
  {
    let subscriptions = (subscription ? [subscription] : rule.subscriptions.slice());
    for (let i = 0; i < subscriptions.length; i++)
    {
      let subscription = subscriptions[i];
      if (subscription instanceof SpecialSubscription)
      {
        let positions = [];
        if (typeof position == "undefined")
        {
          let index = -1;
          do
          {
            index = subscription.rules.indexOf(rule, index + 1);
            if (index >= 0) positions.push(index);
          } while (index >= 0);
        }
        else positions.push(position);

        for (let j = positions.length - 1; j >= 0; j--)
        {
          let position = positions[j];
          if (subscription.rules[position] == rule)
          {
            subscription.rules.splice(position, 1);
            if (subscription.rules.indexOf(rule) < 0)
            {
              let index = rule.subscriptions.indexOf(subscription);
              if (index >= 0) rule.subscriptions.splice(index, 1);
            }
            RuleNotifier.triggerListeners("rule.removed", rule, subscription, position);
          }
        }
      }
    }
  },

  /**
   * Moves a user-defined rule to a new position
   * @param {Rule} rule
   * @param {SpecialSubscription} subscription rule group where the rule is located
   * @param {Integer} oldPosition current position of the rule
   * @param {Integer} newPosition new position of the rule
   */
  moveRule: function(rule, subscription, oldPosition, newPosition)
  {
    if (!(subscription instanceof SpecialSubscription) || subscription.rules[oldPosition] != rule) return;

    newPosition = Math.min(Math.max(newPosition, 0), subscription.rules.length - 1);
    if (oldPosition == newPosition) return;

    subscription.rules.splice(oldPosition, 1);
    subscription.rules.splice(newPosition, 0, rule);
    RuleNotifier.triggerListeners("rule.moved", rule, subscription, oldPosition, newPosition);
  },

  /**
   * Increases the hit count for a rule by one
   * @param {Rule} rule
   */
  increaseHitCount: function(rule)
  {
    if (!Prefs.savestats || Prefs.privateBrowsing || !(rule instanceof ActiveRule)) return;

    rule.hitCount++;
    rule.lastHit = Date.now();
  },

  /**
   * Resets hit count for some rules
   * @param {Array of Rule} rules  rules to be reset, if null all rules will be reset
   */
  resetHitCounts: function(rules)
  {
    if (!rules)
    {
      rules = [];
      for each(let rule in Rule.knownRules)
      rules.push(rule);
    }
    for each(let rule in rules)
    {
      rule.hitCount = 0;
      rule.lastHit = 0;
    }
  },

  /**
   * Loads all subscriptions from the disk
   * @param {nsIFile} [sourceFile] File to read from
   * @param {Boolean} silent  if true, no listeners will be triggered (to be used when data is already initialized)
   */
  loadFromDisk: function(sourceFile, silent)
  {


    if (!silent)
    {
      Rule.knownRules = {
        __proto__: null
      };
      Subscription.knownSubscriptions = {
        __proto__: null
      };
    }

    let explicitFile = true;
    if (!sourceFile)
    {
      sourceFile = RuleStorage.sourceFile;
      explicitFile = false;

      if (!sourceFile || !sourceFile.exists())
      {
        // patterns.ini doesn't exist - but maybe we have a default one?
        let patternsURL = Services.io.newURI("chrome://fireie/content/patterns.ini", null, null);
        patternsURL = Utils.chromeRegistry.convertChromeURL(patternsURL);
        if (patternsURL instanceof Ci.nsIFileURL) sourceFile = patternsURL.file;
      }
    }

    let userRules = null;
    let backup = 0;
    while (true)
    {
      RuleStorage.subscriptions = [];
      RuleStorage.knownSubscriptions = {
        __proto__: null
      };

      try
      {
        if (sourceFile && sourceFile.exists())
        {
          let fileStream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
          fileStream.init(sourceFile, 0x01, 0444, 0);

          let stream = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(Ci.nsIConverterInputStream);
          stream.init(fileStream, "UTF-8", 16384, 0);
          stream = stream.QueryInterface(Ci.nsIUnicharLineInputStream);

          parseIniFile(stream);
          stream.close();

          if (!RuleStorage.subscriptions.length)
          {
            // No rule subscriptions in the file, this isn't right.
            throw "No data in the file";
          }
        }

        // We either successfully loaded rules or the source file doesn't exist
        // (already past last backup?). Either way, we should exit the loop now.
        break;
      }
      catch (e)
      {
        Cu.reportError("Fire-IE: Failed to read rules from file " + sourceFile.path);
        Cu.reportError(e);
      }

      if (explicitFile) break;

      // We failed loading rules, let's try next backup file
      sourceFile = RuleStorage.sourceFile;
      if (!sourceFile) break;

      let part1 = sourceFile.leafName;
      let part2 = "";
      if (/^(.*)(\.\w+)$/.test(part1))
      {
        part1 = RegExp.$1;
        part2 = RegExp.$2;
      }

      sourceFile = sourceFile.clone();
      sourceFile.leafName = part1 + "-backup" + (++backup) + part2;
    }


    // Old special groups might have been converted, remove them if they are empty
    for each(let specialSubscription in ["~exceptional~", "~custom~"])
    {
      if (specialSubscription in RuleStorage.knownSubscriptions)
      {
        let subscription = Subscription.fromURL(specialSubscription);
        if (subscription.rules.length == 0) RuleStorage.removeSubscription(subscription, true);
      }
    }

    if (!silent) RuleNotifier.triggerListeners("load");

  },

  /**
   * Saves all subscriptions back to disk
   * @param {nsIFile} [targetFile] File to be written
   */
  saveToDisk: function(targetFile)
  {
    let explicitFile = true;
    if (!targetFile)
    {
      targetFile = RuleStorage.sourceFile;
      explicitFile = false;
    }
    if (!targetFile) return;

    try
    {
      targetFile.normalize();
    }
    catch (e)
    {}

    // Make sure the file's parent directory exists
    try
    {
      targetFile.parent.create(Ci.nsIFile.DIRECTORY_TYPE, 0755);
    }
    catch (e)
    {}

    let tempFile = targetFile.clone();
    tempFile.leafName += "-temp";
    let fileStream, stream;
    try
    {
      fileStream = Cc["@mozilla.org/network/safe-file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
      fileStream.init(tempFile, 0x02 | 0x08 | 0x20, 0644, 0);

      stream = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(Ci.nsIConverterOutputStream);
      stream.init(fileStream, "UTF-8", 16384, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
    }
    catch (e)
    {
      Cu.reportError(e);
      return;
    }

    const maxBufLength = 1024;
    let buf = ["# Fire-IE preferences", "version=" + formatVersion];
    let lineBreak = Utils.getLineBreak();

    function writeBuffer()
    {
      stream.writeString(buf.join(lineBreak) + lineBreak);
      buf.splice(0, buf.length);
    }

    let saved = {
      __proto__: null
    };

    // Save rule data
    for each(let subscription in RuleStorage.subscriptions)
    {
      // Do not persist external subscriptions
      if (subscription instanceof ExternalSubscription) continue;

      for each(let rule in subscription.rules)
      {
        if (!(rule.text in saved))
        {
          rule.serialize(buf);
          saved[rule.text] = rule;
          if (buf.length > maxBufLength) writeBuffer();
        }
      }
    }

    // Save subscriptions
    for each(let subscription in RuleStorage.subscriptions)
    {
      // Do not persist external subscriptions
      if (subscription instanceof ExternalSubscription) continue;

      buf.push("");
      subscription.serialize(buf);
      if (subscription.rules.length)
      {
        buf.push("", "[Subscription rules]")
        subscription.serializeRules(buf);
      }
      if (buf.length > maxBufLength) writeBuffer();
    }

    try
    {
      stream.writeString(buf.join(lineBreak) + lineBreak);
      stream.flush();
      fileStream.QueryInterface(Ci.nsISafeOutputStream).finish();
    }
    catch (e)
    {
      Cu.reportError(e);

      return;
    }

    if (!explicitFile && targetFile.exists())
    {
      // Check whether we need to backup the file
      let part1 = targetFile.leafName;
      let part2 = "";
      if (/^(.*)(\.\w+)$/.test(part1))
      {
        part1 = RegExp.$1;
        part2 = RegExp.$2;
      }

      let doBackup = (Prefs.patternsbackups > 0);
      if (doBackup)
      {
        let lastBackup = targetFile.clone();
        lastBackup.leafName = part1 + "-backup1" + part2;
        if (lastBackup.exists() && (Date.now() - lastBackup.lastModifiedTime) / 3600000 < Prefs.patternsbackupinterval) doBackup = false;
      }

      if (doBackup)
      {
        let backupFile = targetFile.clone();
        backupFile.leafName = part1 + "-backup" + Prefs.patternsbackups + part2;

        // Remove oldest backup
        try
        {
          backupFile.remove(false);
        }
        catch (e)
        {}

        // Rename backup files
        for (let i = Prefs.patternsbackups - 1; i >= 0; i--)
        {
          backupFile.leafName = part1 + (i > 0 ? "-backup" + i : "") + part2;
          try
          {
            backupFile.moveTo(backupFile.parent, part1 + "-backup" + (i + 1) + part2);
          }
          catch (e)
          {}
        }
      }
    }
    else if (targetFile.exists()) targetFile.remove(false);

    tempFile.moveTo(targetFile.parent, targetFile.leafName);

    if (!explicitFile) RuleNotifier.triggerListeners("save");

  },

  /**
   * Returns the list of existing backup files.
   */
  getBackupFiles: function() /**nsIFile[]*/
  {
    let result = [];

    let part1 = RuleStorage.sourceFile.leafName;
    let part2 = "";
    if (/^(.*)(\.\w+)$/.test(part1))
    {
      part1 = RegExp.$1;
      part2 = RegExp.$2;
    }

    for (let i = 1;; i++)
    {
      let file = RuleStorage.sourceFile.clone();
      file.leafName = part1 + "-backup" + i + part2;
      if (file.exists()) result.push(file);
      else break;
    }
    return result;
  }
};

/**
 * Joins subscription's rules to the subscription without any notifications.
 * @param {Subscription} subscription rule subscription that should be connected to its rules
 */
function addSubscriptionRules(subscription)
{
  if (!(subscription.url in RuleStorage.knownSubscriptions)) return;

  for each(let rule in subscription.rules)
  rule.subscriptions.push(subscription);
}

/**
 * Removes subscription's rules from the subscription without any notifications.
 * @param {Subscription} subscription rule subscription to be removed
 */
function removeSubscriptionRules(subscription)
{
  if (!(subscription.url in RuleStorage.knownSubscriptions)) return;

  for each(let rule in subscription.rules)
  {
    let i = rule.subscriptions.indexOf(subscription);
    if (i >= 0) rule.subscriptions.splice(i, 1);
  }
}

/**
 * Parses rule data from a stream. 
 */
function parseIniFile( /**nsIUnicharLineInputStream*/ stream) /**Array of String*/
{
  let wantObj = true;
  RuleStorage.fileProperties = {};
  let curObj = RuleStorage.fileProperties;
  let curSection = null;
  let line = {};
  let haveMore = true;
  while (true)
  {
    if (haveMore) haveMore = stream.readLine(line);
    else line.value = "[end]";

    let val = line.value;
    if (wantObj === true && /^(\w+)=(.*)$/.test(val)) curObj[RegExp.$1] = RegExp.$2;
    else if (/^\s*\[(.+)\]\s*$/.test(val))
    {
      let newSection = RegExp.$1.toLowerCase();
      if (curObj)
      {
        // Process current object before going to next section
        switch (curSection)
        {
        case "rule":
          if ("text" in curObj) Rule.fromObject(curObj);
          break;
        case "subscription":
          let subscription = Subscription.fromObject(curObj);
          if (subscription) RuleStorage.addSubscription(subscription, true);
          break;
        case "subscription rules":
          if (RuleStorage.subscriptions.length)
          {
            let subscription = RuleStorage.subscriptions[RuleStorage.subscriptions.length - 1];
            for each(let text in curObj)
            {
              let rule = Rule.fromText(text);
              if (rule)
              {
                subscription.rules.push(rule);
                rule.subscriptions.push(subscription);
              }
            }
          }
          break;
        }
      }

      if (newSection == 'end') break;

      curSection = newSection;
      switch (curSection)
      {
      case "rule":
      case "subscription":
        wantObj = true;
        curObj = {};
        break;
      case "subscription rules":
        wantObj = false;
        curObj = [];
        break;
      default:
        wantObj = undefined;
        curObj = null;
      }
    }
    else if (wantObj === false && val) curObj.push(val.replace(/\\\[/g, "["));
  }
}
