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
function Initializer() {}
Initializer.prototype =
{
  classDescription: "Fire-IE initializer",
  contractID: "@fireie.org/fireie/startup;1",
  classID: Components.ID("{4CD0BB64-942B-4EBA-A260-BCB721EAECBE}"),
  _xpcom_categories: [{ category: "app-startup", service: true }],

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference]),

  observe: function(subject, topic, data)
  {
    let observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
    switch (topic)
    {
      case "app-startup":
        observerService.addObserver(this, "profile-after-change", true);
        break;
      case "profile-after-change":
        observerService.addObserver(this, "quit-application", true);

        Cu.import("resource://fireie/Bootstrap.jsm");
        Bootstrap.startup();
  
        break;
      case "quit-application":
        observerService.removeObserver(this, "quit-application");
        if ("@fireie.org/fireie/private;1" in Cc)
        {
          let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);
          Cu.import(baseURL.spec + "Bootstrap.jsm");
          Bootstrap.shutdown(false);
        }
        break;
    }
  }
};

if (XPCOMUtils.generateNSGetFactory)
  var NSGetFactory = XPCOMUtils.generateNSGetFactory([Initializer]);
else
  var NSGetModule = XPCOMUtils.generateNSGetModule([Initializer]);
