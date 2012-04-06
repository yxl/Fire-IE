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
      observerService.addObserver(this, "fireie-clear-history", true);

      Cu.import("resource://fireie/Bootstrap.jsm");
      Bootstrap.startup();

      break;
    case "quit-application":
      observerService.removeObserver(this, "quit-application");
      observerService.removeObserver(this, "fireie-clear-history");

      // Clear the history if need sanitize on shutdown
      if (prefs.getBoolPref('privacy.sanitize.sanitizeOnShutdown') && prefs.getBoolPref('privacy.clearOnShutdown.extensions-fireie'))
      {
        this._clearHistory();
      }

      if ("@fireie.org/fireie/private;1" in Cc)
      {
        let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);
        Cu.import(baseURL.spec + "Bootstrap.jsm");
        Bootstrap.shutdown(false);
      }

      break;
    case "fireie-clear-history":
      this._clearHistory();
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
    let rootDir = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIDirectoryService).QueryInterface(Ci.nsIProperties).get("ProfD", Ci.nsIFile);
    rootDir.append('fireie');
    for each(let e in ['cache', 'cookies'])
    {
      try
      {
        let file = rootDir.clone();
        file.append(e);
        if (file.exists())
        {
          // Also clear the sub-directories
          file.remove(true);
        }
      }
      catch (ex)
      {}
    }
  }
};

if (XPCOMUtils.generateNSGetFactory) var NSGetFactory = XPCOMUtils.generateNSGetFactory([Initializer]);
else var NSGetModule = XPCOMUtils.generateNSGetModule([Initializer]);