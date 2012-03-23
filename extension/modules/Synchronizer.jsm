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
 * @fileOverview Manages synchronization of rule subscriptions.
 */

var EXPORTED_SYMBOLS = ["Synchronizer"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

Cu.import(baseURL.spec + "Utils.jsm");
Cu.import(baseURL.spec + "RuleStorage.jsm");
Cu.import(baseURL.spec + "RuleNotifier.jsm");
Cu.import(baseURL.spec + "RuleClasses.jsm");
Cu.import(baseURL.spec + "SubscriptionClasses.jsm");
Cu.import(baseURL.spec + "Prefs.jsm");

const MILLISECONDS_IN_SECOND = 1000;
const SECONDS_IN_MINUTE = 60;
const SECONDS_IN_HOUR = 60 * SECONDS_IN_MINUTE;
const SECONDS_IN_DAY = 24 * SECONDS_IN_HOUR;
const INITIAL_DELAY = 6 * SECONDS_IN_MINUTE;
const CHECK_INTERVAL = SECONDS_IN_HOUR;
const MIN_EXPIRATION_INTERVAL = 1 * SECONDS_IN_DAY;
const MAX_EXPIRATION_INTERVAL = 4 * SECONDS_IN_DAY;
const MAX_ABSENSE_INTERVAL = 1 * SECONDS_IN_DAY;

var XMLHttpRequest = Components.Constructor("@mozilla.org/xmlextras/xmlhttprequest;1", "nsIJSXMLHttpRequest");

let timer = null;

/**
 * Map of subscriptions currently being downloaded, all currently downloaded
 * URLs are keys of that map.
 */
let executing = {
  __proto__: null
};

/**
 * This object is responsible for downloading rule subscriptions whenever
 * necessary.
 * @class
 */
var Synchronizer = {
  /**
   * Called on module startup.
   */
  startup: function()
  {
    let callback = function()
    {
      timer.delay = CHECK_INTERVAL * MILLISECONDS_IN_SECOND;
      checkSubscriptions();
    };

    timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    timer.initWithCallback(callback, INITIAL_DELAY * MILLISECONDS_IN_SECOND, Ci.nsITimer.TYPE_REPEATING_SLACK);
  },

  /**
   * Checks whether a subscription is currently being downloaded.
   * @param {String} url  URL of the subscription
   * @return {Boolean}
   */
  isExecuting: function(url)
  {
    return url in executing;
  },

  /**
   * Starts the download of a subscription.
   * @param {DownloadableSubscription} subscription  Subscription to be downloaded
   * @param {Boolean} manual  true for a manually started download (should not trigger fallback requests)
   * @param {Boolean}  forceDownload  if true, the subscription will even be redownloaded if it didn't change on the server
   */
  execute: function(subscription, manual, forceDownload)
  {
    // Delay execution, SeaMonkey 2.1 won't fire request's event handlers
    // otherwise if the window that called us is closed.
    Utils.runAsync(this.executeInternal, this, subscription, manual, forceDownload);
  },

  executeInternal: function(subscription, manual, forceDownload)
  {
    let url = subscription.url;
    if (url in executing) return;

    let loadFrom = url;

    let request = null;

    function errorCallback(error)
    {
      let channelStatus = -1;
      try
      {
        channelStatus = request.channel.status;
      }
      catch (e)
      {}
      let responseStatus = "";
      try
      {
        responseStatus = request.channel.QueryInterface(Ci.nsIHttpChannel).responseStatus;
      }
      catch (e)
      {}
      setError(subscription, error, channelStatus, responseStatus, manual);
    }

    try
    {
      request = new XMLHttpRequest();
      request.mozBackgroundRequest = true;
      request.open("GET", loadFrom);
    }
    catch (e)
    {
      errorCallback("Synchronizer.invalidUrl");
      return;
    }

    try
    {
      request.overrideMimeType("text/plain");
      request.channel.loadFlags = request.channel.loadFlags | request.channel.INHIBIT_CACHING | request.channel.VALIDATE_ALWAYS;

      request.channel.notificationCallbacks = {
        QueryInterface: XPCOMUtils.generateQI([Ci.nsIInterfaceRequestor, Ci.nsIChannelEventSink]),

        getInterface: function(iid)
        {
          if (iid.equals(Ci.nsIChannelEventSink))
          {
            return this;
          }

          throw Cr.NS_ERROR_NO_INTERFACE;
        },

        asyncOnChannelRedirect: function(oldChannel, newChannel, flags, callback)
        {
          this.onChannelRedirect(oldChannel, newChannel, flags);

          // If onChannelRedirect didn't throw an exception indicate success
          callback.onRedirectVerifyCallback(Cr.NS_OK);
        }
      }
    }
    catch (e)
    {
      Cu.reportError(e)
    }

    if (subscription.lastModified && !forceDownload) request.setRequestHeader("If-Modified-Since", subscription.lastModified);

    request.addEventListener("error", function(ev)
    {
      delete executing[url];
      try
      {
        request.channel.notificationCallbacks = null;
      }
      catch (e)
      {}

      errorCallback("Synchronizer.connectionError");
    }, false);

    request.addEventListener("load", function(ev)
    {
      delete executing[url];
      try
      {
        request.channel.notificationCallbacks = null;
      }
      catch (e)
      {}

      // Status will be 0 for non-HTTP requests
      if (request.status && request.status != 200 && request.status != 304)
      {
        errorCallback("Synchronizer.connectionError");
        return;
      }

      let newRules = null;
      if (request.status != 304)
      {
        newRules = readRules(subscription, request.responseText, errorCallback);
        if (!newRules) return;

        subscription.lastModified = request.getResponseHeader("Last-Modified");
      }

      subscription.lastSuccess = subscription.lastDownload = Math.round(Date.now() / MILLISECONDS_IN_SECOND);
      subscription.downloadStatus = "synchronize_ok";
      subscription.errors = 0;

      // Expiration header is relative to server time - use Date header if it exists, otherwise local time
      let now = Math.round((new Date(request.getResponseHeader("Date")).getTime() || Date.now()) / MILLISECONDS_IN_SECOND);
      let expires = Math.round(new Date(request.getResponseHeader("Expires")).getTime() / MILLISECONDS_IN_SECOND) || 0;
      let expirationInterval = (expires ? expires - now : 0);
      for each(let rule in newRules || subscription.rules)
      {
        if (rule instanceof CommentRule && /\bExpires\s*(?::|after)\s*(\d+)\s*(h)?/i.test(rule.text))
        {
          let interval = parseInt(RegExp.$1);
          if (RegExp.$2) interval *= SECONDS_IN_HOUR;
          else interval *= SECONDS_IN_DAY;

          if (interval > expirationInterval) expirationInterval = interval;
        }
      }

      // Expiration interval should be within allowed range
      expirationInterval = Math.min(Math.max(expirationInterval, MIN_EXPIRATION_INTERVAL), MAX_EXPIRATION_INTERVAL);

      // Hard expiration: download immediately after twice the expiration interval
      subscription.expires = (subscription.lastDownload + expirationInterval * 2);

      // Process some special rules and remove them
      if (newRules)
      {
        for (let i = 0; i < newRules.length; i++)
        {
          let rule = newRules[i];
          if (rule instanceof CommentRule && /^!\s*(\w+)\s*:\s*(.*)/.test(rule.text))
          {
            let keyword = RegExp.$1.toLowerCase();
            let value = RegExp.$2;
            let known = true;
            if (keyword == "homepage")
            {
              let uri = Utils.makeURI(value);
              if (uri && (uri.scheme == "http" || uri.scheme == "https")) subscription.homepage = uri.spec;
            }
            else known = false;

            if (known) newRules.splice(i--, 1);
          }
        }
      }

      if (newRules) RuleStorage.updateSubscriptionRules(subscription, newRules);
      delete subscription.oldSubscription;
    }, false);

    executing[url] = true;
    RuleNotifier.triggerListeners("subscription.downloadStatus", subscription);

    try
    {
      request.send(null);
    }
    catch (e)
    {
      delete executing[url];
      errorCallback("Synchronizer.connectionError");
      return;
    }
  }
};

/**
 * Checks whether any subscriptions need to be downloaded and starts the download
 * if necessary.
 */
function checkSubscriptions()
{
  if (!Prefs.subscriptions_autoupdate) return;

  let time = Math.round(Date.now() / MILLISECONDS_IN_SECOND);
  for each(let subscription in RuleStorage.subscriptions)
  {
    if (!(subscription instanceof DownloadableSubscription)) continue;

    subscription.lastCheck = time;

    // Sanity check: do expiration times make sense? Make sure people changing
    // system clock don't get stuck with outdated subscriptions.
    if (subscription.expires - time > MAX_EXPIRATION_INTERVAL) subscription.expires = time + MAX_EXPIRATION_INTERVAL;

    if (subscription.expires > time) continue;

    // Do not retry downloads more often than MIN_EXPIRATION_INTERVAL
    if (time - subscription.lastDownload >= MIN_EXPIRATION_INTERVAL) Synchronizer.execute(subscription, false);
  }
}

/**
 * Extracts a list of rules from text returned by a server.
 * @param {DownloadableSubscription} subscription  subscription the info should be placed into
 * @param {String} text server response
 * @param {Function} errorCallback function to be called on error
 * @return {Array of Rule}
 */
function readRules(subscription, text, errorCallback)
{
  let lines = text.split(/[\r\n]+/);
  if (!/\[fireie(?:\s*([\d\.]+)?)?\]/i.test(lines[0]))
  {
    errorCallback("Synchronizer.invalidData");
    return null;
  }
  let minVersion = RegExp.$1;

  for (let i = 0; i < lines.length; i++)
  {
    if (/!\s*checksum[\s\-:]+([\w\+\/]+)/i.test(lines[i]))
    {
      lines.splice(i, 1);
      let checksumExpected = RegExp.$1;
      let checksum = Utils.generateChecksum(lines);

      if (checksum && checksum != checksumExpected)
      {
        errorCallback("Synchronizer.checksumMismatch");
        return null;
      }

      break;
    }
  }

  delete subscription.requiredVersion;
  delete subscription.upgradeRequired;
  if (minVersion)
  {
    subscription.requiredVersion = minVersion;
    if (Services.vc.compare(minVersion, Utils.addonVersion) > 0) subscription.upgradeRequired = true;
  }

  lines.shift();
  let result = [];
  for each(let line in lines)
  {
    let rule = Rule.fromText(Rule.normalize(line));
    if (rule) result.push(rule);
  }

  return result;
}

/**
 * Handles an error during a subscription download.
 * @param {DownloadableSubscription} subscription  subscription that failed to download
 * @param {Integer} channelStatus result code of the download channel
 * @param {String} responseStatus result code as received from server
 * @param {String} error error ID in global.properties
 * @param {Boolean} manual  true for a manually started download (should not trigger fallback requests)
 */
function setError(subscription, error, channelStatus, responseStatus, manual)
{
  try
  {
    Cu.reportError("Fire-IE: Downloading rule subscription " + subscription.title + " failed (" + Utils.getString(error) + ")\n" + "Download address: " + subscription.url + "\n" + "Channel status: " + channelStatus + "\n" + "Server response: " + responseStatus);
  }
  catch (e)
  {}

  subscription.lastDownload = Math.round(Date.now() / MILLISECONDS_IN_SECOND);
  subscription.downloadStatus = error;

  // Request fallback URL if necessary - for automatic updates only
  if (!manual)
  {
    if (error == "synchronize_checksum_mismatch")
    {
      // No fallback for successful download with checksum mismatch, reset error counter
      subscription.errors = 0;
    }
    else subscription.errors++;

    if (subscription.errors >= Prefs.subscriptions_fallbackerrors && /^https?:\/\//i.test(subscription.url))
    {
      subscription.errors = 0;

      let fallbackURL = Prefs.subscriptions_fallbackurl;
      fallbackURL = fallbackURL.replace(/%VERSION%/g, encodeURIComponent(Utils.addonVersion));
      fallbackURL = fallbackURL.replace(/%SUBSCRIPTION%/g, encodeURIComponent(subscription.url));
      fallbackURL = fallbackURL.replace(/%ERROR%/g, encodeURIComponent(error));
      fallbackURL = fallbackURL.replace(/%CHANNELSTATUS%/g, encodeURIComponent(channelStatus));
      fallbackURL = fallbackURL.replace(/%RESPONSESTATUS%/g, encodeURIComponent(responseStatus));

      let request = new XMLHttpRequest();
      request.mozBackgroundRequest = true;
      request.open("GET", fallbackURL);
      request.overrideMimeType("text/plain");
      request.channel.loadFlags = request.channel.loadFlags | request.channel.INHIBIT_CACHING | request.channel.VALIDATE_ALWAYS;
      request.addEventListener("load", function(ev)
      {
        if (!(subscription.url in RuleStorage.knownSubscriptions)) return;

        if (/^410\b/.test(request.responseText)) // Gone
        {
          let data = "[fireie]\n" + subscription.rules.map(function(f) f.text).join("\n");
          let url = "data:text/plain," + encodeURIComponent(data);
          let newSubscription = Subscription.fromURL(url);
          newSubscription.title = subscription.title;
          newSubscription.disabled = subscription.disabled;
          RuleStorage.removeSubscription(subscription);
          RuleStorage.addSubscription(newSubscription);
          Synchronizer.execute(newSubscription);
        }
      }, false);
      request.send(null);
    }
  }
}