/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

/**
 * @fileOverview Public Adblock Plus API.
 */

var EXPORTED_SYMBOLS = ["AdblockPlus"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);

Cu.import(baseURL.spec + "Utils.jsm");
Cu.import(baseURL.spec + "RuleStorage.jsm");
Cu.import(baseURL.spec + "RuleClasses.jsm");
Cu.import(baseURL.spec + "SubscriptionClasses.jsm");

const externalPrefix = "~external~";

/**
 * Class implementing public Adblock Plus API
 * @class
 */
var AdblockPlus = {
  /**
   * Returns current subscription count
   * @type Integer
   */
  get subscriptionCount()
  {
    return RuleStorage.subscriptions.length;
  },

  /**
   * Gets a subscription by its URL
   */
  getSubscription: function( /**String*/ id) /**IAdblockPlusSubscription*/
  {
    if (id in RuleStorage.knownSubscriptions) return createSubscriptionWrapper(RuleStorage.knownSubscriptions[id]);

    return null;
  },

  /**
   * Gets a subscription by its position in the list
   */
  getSubscriptionAt: function( /**Integer*/ index) /**IAdblockPlusSubscription*/
  {
    if (index < 0 || index >= RuleStorage.subscriptions.length) return null;

    return createSubscriptionWrapper(RuleStorage.subscriptions[index]);
  },

  /**
   * Updates an external subscription and creates it if necessary
   */
  updateExternalSubscription: function( /**String*/ id, /**String*/ title, /**Array of Rule*/ rules) /**String*/
  {
    if (id.substr(0, externalPrefix.length) != externalPrefix) id = externalPrefix + id;
    let subscription = Subscription.fromURL(id);
    if (!subscription) subscription = new ExternalSubscription(id, title);

    subscription.lastDownload = parseInt(new Date().getTime() / 1000);

    let newRules = [];
    for each(let rule in rules)
    {
      rule = Rule.fromText(Rule.normalize(rule));
      if (rule) newRules.push(rule);
    }

    if (id in RuleStorage.knownSubscriptions) RuleStorage.updateSubscriptionRules(subscription, newRules);
    else
    {
      subscription.rules = newRules;
      RuleStorage.addSubscription(subscription);
    }

    return id;
  },

  /**
   * Removes an external subscription by its identifier
   */
  removeExternalSubscription: function( /**String*/ id) /**Boolean*/
  {
    if (id.substr(0, externalPrefix.length) != externalPrefix) id = externalPrefix + id;
    if (!(id in RuleStorage.knownSubscriptions)) return false;

    RuleStorage.removeSubscription(RuleStorage.knownSubscriptions[id]);
    return true;
  },

  /**
   * Adds user-defined rules to the list
   */
  addPatterns: function( /**Array of String*/ rules)
  {
    for each(let rule in rules)
    {
      rule = Rule.fromText(Rule.normalize(rule));
      if (rule)
      {
        rule.disabled = false;
        RuleStorage.addRule(rule);
      }
    }
  },

  /**
   * Removes user-defined rules from the list
   */
  removePatterns: function( /**Array of String*/ rules)
  {
    for each(let rule in rules)
    {
      rule = Rule.fromText(Rule.normalize(rule));
      if (rule) RuleStorage.removeRule(rule);
    }
  },

  /**
   * Returns installed Adblock Plus version
   */
  getInstalledVersion: function() /**String*/
  {
    return Utils.addonVersion;
  },

  /**
   * Returns source code revision this Adblock Plus build was created from (if available)
   */
  getInstalledBuild: function() /**String*/
  {
    return Utils.addonBuild;
  },
};

/**
 * Wraps a subscription into IAdblockPlusSubscription structure.
 */
function createSubscriptionWrapper( /**Subscription*/ subscription) /**IAdblockPlusSubscription*/
{
  if (!subscription) return null;

  return {
    url: subscription.url,
    special: subscription instanceof SpecialSubscription,
    title: subscription.title,
    autoDownload: true,
    disabled: subscription.disabled,
    external: subscription instanceof ExternalSubscription,
    lastDownload: subscription instanceof RegularSubscription ? subscription.lastDownload : 0,
    downloadStatus: subscription instanceof DownloadableSubscription ? subscription.downloadStatus : "synchronize_ok",
    lastModified: subscription instanceof DownloadableSubscription ? subscription.lastModified : null,
    expires: subscription instanceof DownloadableSubscription ? subscription.expires : 0,
    getPatterns: function()
    {
      let result = subscription.rules.map(function(rule)
      {
        return rule.text;
      });
      return result;
    }
  };
}