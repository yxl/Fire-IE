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
 * @fileOverview Bootstrap module, will initialize Fire IE when loaded
 */

var EXPORTED_SYMBOLS = ["Bootstrap"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

let chromeSupported = true;
let publicURL = Services.io.newURI("resource://fireie/Public.jsm", null, null);
let baseURL = publicURL.clone().QueryInterface(Ci.nsIURL);
baseURL.fileName = "";

Cu.import(baseURL.spec + "Utils.jsm");

if (publicURL instanceof Ci.nsIMutable) publicURL.mutable = false;
if (baseURL instanceof Ci.nsIMutable) baseURL.mutable = false;

const cidPublic = Components.ID("{205D5CF8-A382-4D5E-BE4C-86012C7161FF}");
const contractIDPublic = "@fireie.org/fireie/public;1";

const cidPrivate = Components.ID("{B264B58F-2948-4E8A-9824-45AA6C19697E}");
const contractIDPrivate = "@fireie.org/fireie/private;1";

let factoryPublic = {
  createInstance: function(outer, iid)
  {
    if (outer) throw Cr.NS_ERROR_NO_AGGREGATION;
    return publicURL.QueryInterface(iid);
  }
};

let factoryPrivate = {
  createInstance: function(outer, iid)
  {
    if (outer) throw Cr.NS_ERROR_NO_AGGREGATION;
    return baseURL.QueryInterface(iid);
  }
};

let defaultModules = [
  baseURL.spec + "Prefs.jsm",
  baseURL.spec + "RuleListener.jsm",
  baseURL.spec + "ContentPolicy.jsm",
  baseURL.spec + "Synchronizer.jsm",
  baseURL.spec + "IECookieManager.jsm",
  baseURL.spec + "FontObserver.jsm",
  baseURL.spec + "UtilsPluginManager.jsm",
  baseURL.spec + "ABPObserver.jsm"
];

let loadedModules = {
  __proto__: null
};

let lazyLoadModules = {
  __proto__: null
};

// Ensures ordered initialization for lazy loaded modules
let lazyLoadModulesOrdered = [];

let initialized = false;

/**
 * Allows starting up and shutting down Fire IE functions.
 * @class
 */
var Bootstrap = {
  /**
   * Initializes add-on, loads and initializes all modules.
   */
  startup: function()
  {
    if (initialized) return;
    initialized = true;

    // Register component to allow retrieving private and public URL
    let registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
    registrar.registerFactory(cidPublic, "Fire-IE public module URL", contractIDPublic, factoryPublic);
    registrar.registerFactory(cidPrivate, "Fire-IE private module URL", contractIDPrivate, factoryPrivate);

    // Load and initialize modules
    defaultModules.forEach(Bootstrap.loadModule);

    let categoryManager = Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager);
    let enumerator = categoryManager.enumerateCategory("fireie-module-location");
    while (enumerator.hasMoreElements())
    {
      let uri = enumerator.getNext().QueryInterface(Ci.nsISupportsCString).data;
      Bootstrap.loadModule(uri);
    }

    Services.obs.addObserver(BootstrapPrivate, "xpcom-category-entry-added", true);
    Services.obs.addObserver(BootstrapPrivate, "xpcom-category-entry-removed", true);
    
    if (lazyLoadModulesOrdered.length)
    {
      // add lazy init observer if there's any such modules
      Services.obs.addObserver(BootstrapLazyLoadPrivate, "fireie-lazy-init", true);
    }
  },

  /**
   * Shuts down add-on.
   */
  shutdown: function()
  {
    if (!initialized) return;

    // Shut down modules
    for (let url in loadedModules)
      Bootstrap.shutdownModule(url);

    Services.obs.removeObserver(BootstrapPrivate, "xpcom-category-entry-added");
    Services.obs.removeObserver(BootstrapPrivate, "xpcom-category-entry-removed");
    Services.obs.removeObserver(BootstrapLazyLoadPrivate, "fireie-lazy-init");
  },

  /**
   * Loads and initializes a module.
   */
  loadModule: function( /**String*/ url)
  {
    if (url in loadedModules || url in lazyLoadModules) return;

    let module = {};
    try
    {
      Cu.import(url, module);
    }
    catch (e)
    {
      Cu.reportError("Fire-IE: Failed to load module " + url + ": " + e);
      return;
    }

    for (let prop in module)
    {
      let obj = module[prop];
      if ("startup" in obj)
      {
        try
        {
          obj.startup();
          loadedModules[url] = obj;
        }
        catch (e)
        {
          Cu.reportError("Fire-IE: Calling method startup() for module " + url + " failed: " + e);
        }
        return;
      }
      if ("lazyStartup" in obj)
      {
        lazyLoadModules[url] = obj;
        lazyLoadModulesOrdered.push(url);
        return;
      }
    }

    Cu.reportError("Fire-IE: No exported object with startup() method found for module " + url);
  },

  /**
   * Shuts down a module.
   */
  shutdownModule: function( /**String*/ url)
  {
    if (!(url in loadedModules)) return;

    let obj = loadedModules[url];
    if ("shutdown" in obj)
    {
      try
      {
        obj.shutdown();
      }
      catch (e)
      {
        Cu.reportError("Fire-IE: Calling method shutdown() for module " + url + " failed: " + e);
      }
      return;
    }
  },
  
  /**
   * Lazy load all modules in lazyLoadModules
   */
  doLazyLoadModules: function()
  {
    Services.obs.removeObserver(BootstrapLazyLoadPrivate, "fireie-lazy-init");
    lazyLoadModulesOrdered.forEach(function(url)
    {
      let obj = lazyLoadModules[url];
      try
      {
        obj.lazyStartup();
        loadedModules[url] = obj;
      }
      catch (e)
      {
        Cu.reportError("Fire-IE: Calling method lazyStartup() for module " + url + " failed: " + e);
      }
    });
    lazyLoadModules = null;
    lazyLoadModulesOrdered = null;
  }
};

/**
 * Observer called on modules category changes.
 * @class
 */
var BootstrapPrivate = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference]),

  observe: function(subject, topic, data)
  {
    if (data != "fireie-module-location") return;

    switch (topic)
    {
    case "xpcom-category-entry-added":
      Bootstrap.loadModule(subject.QueryInterface(Ci.nsISupportsCString).data);
      break;
    case "xpcom-category-entry-removed":
      Bootstrap.unloadModule(subject.QueryInterface(Ci.nsISupportsCString).data, true);
      break;
    }
  }
};

/**
 * Observer called on module lazy initialization
 * @class
 */
var BootstrapLazyLoadPrivate = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference]),
  
  observe: function(subject, topic, data)
  {
    if (topic == "fireie-lazy-init")
      Bootstrap.doLazyLoadModules();
  }
};
