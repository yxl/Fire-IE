/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

/**
 * Application startup/shutdown observer, triggers init()/shutdown() methods in Bootstrap.jsm module.
 * @constructor
 */
function Initializer()
{}
Initializer.prototype = {
  classDescription: "Fire-IE initializer",
  contractID: "@fireie.org/fireie/startup;1",
  classID: Components.ID("{4CD0BB64-942B-4EBA-A260-BCB721EAECBE}"),
  _xpcom_categories: [
  {
    category: "app-startup",
    service: true
  }],

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference]),

  observe: function(subject, topic, data)
  {
    let observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
    let prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService).QueryInterface(Ci.nsIPrefBranch2);

    switch (topic)
    {
    case "app-startup":
      observerService.addObserver(this, "profile-after-change", true);
      break;
    case "profile-after-change":
      observerService.addObserver(this, "quit-application", true);
      observerService.addObserver(this, "fireie-clear-cache", true);
      observerService.addObserver(this, "fireie-clear-cookies", true);

      Cu.import("resource://fireie/Bootstrap.jsm");
      Bootstrap.startup();

      break;
    case "quit-application":
      observerService.removeObserver(this, "quit-application");
      observerService.removeObserver(this, "fireie-clear-cache");
      observerService.removeObserver(this, "fireie-clear-cookies");

      // Clear the history if need sanitize on shutdown
      if (prefs.getBoolPref('privacy.sanitize.sanitizeOnShutdown'))
      {
        if (prefs.getBoolPref('privacy.clearOnShutdown.extensions-fireie-cache'))
          this._clearCache();
        if (prefs.getBoolPref('privacy.clearOnShutdown.extensions-fireie-cookies'))
          this._clearCookies();
      }

      if ("@fireie.org/fireie/private;1" in Cc)
      {
        let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);
        Cu.import(baseURL.spec + "Bootstrap.jsm");
        Bootstrap.shutdown(false);
      }

      break;
    case "fireie-clear-cache":
      this._clearCache();
      break;
    case "fireie-clear-cookies":
      this._clearCookies();
      break;
    }
  },

  /**
   * Clear the IE engine history including the cache files and cookies. The cache files are stored
   * under the directory [profile]/fireie/cache, while the cookies are stored under the directory
   * [profile]/fireie/cookies.
   */
  _clearHistory: function()
  {
    this._clearCache();
    this._clearCookies();
  },

  _clearHistoryDir: function(dir)
  {
    let file = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIDirectoryService).QueryInterface(Ci.nsIProperties).get("ProfD", Ci.nsIFile);
    file.append("fireie");
    file.append(dir);
    try
    {
      if (file.exists())
      {
        // Also clear the sub-directories
        file.remove(true);
      }
    } catch (ex) { }
  },
  
  /**
   * Clear the IE engine cache files. The cache files are stored under the directory
   * [profile]/fireie/cache
   */
  _clearCache: function()
  {
    this._clearHistoryDir("cache");
  },

  /**
   * Clear the IE engine cookies. The cookies are stored under the directory
   * [profile]/fireie/cookies
   */
  _clearCookies: function()
  {
    this._clearHistoryDir("cookies");
  }
};

if (XPCOMUtils.generateNSGetFactory) var NSGetFactory = XPCOMUtils.generateNSGetFactory([Initializer]);
else var NSGetModule = XPCOMUtils.generateNSGetModule([Initializer]);
