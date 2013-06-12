/*
This file is part of Fire-IE.

Fire-IE is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Fire-IE is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with Fire-IE.  If not, see <http://www.gnu.org/licenses/>.
*/

/**
 * @fileOverview Manages the utility plugin
 */

var EXPORTED_SYMBOLS = ["UtilsPluginManager"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

Cu.import(baseURL.spec + "Utils.jsm");
Cu.import(baseURL.spec + "IECookieManager.jsm");
Cu.import(baseURL.spec + "Prefs.jsm");

let prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService).QueryInterface(Ci.nsIPrefBranch2);
let dntBranch = prefs.getBranch("privacy.donottrackheader.").QueryInterface(Ci.nsIPrefBranch2);

let UtilsPluginManager = {
  /**
   * Whether the utils plugin is initialized
   */
  isPluginInitialized: false,
  
  /**
   * Whether init() has been called
   */
  _isInitCalled: false,
  
  /**
   * Keep a list of pref setters, which will be called upon plugin initialization
   */
  _prefSetters: [],
  
  lazyStartup: function()
  {
    this.init();
  },
  
  shutdown: function()
  {
    this.uninit();
  },
  
  init: function()
  {
    if (this._isInitCalled) return;
    this._isInitCalled = true;
    
    this._handlePluginEvents();
    this._install();
    this._registerHandlers();
  },
  
  uninit: function()
  {
    if (!this._isInitCalled) return;
    this._unregisterHandlers();
    this._cancelPluginEvents();
  },
  
  /**
   * Retrieves the utils plugin object
   */
  getPlugin: function()
  {
    let doc = Utils.getHiddenWindow().document;
    let plugin = doc.getElementById(Utils.utilsPluginId);
    return plugin && (plugin.wrappedJSObject || plugin);
  },
  
  /**
   * Retrieves the window where utils plugin sits in
   */
  getWindow: function()
  {
    return Utils.getHiddenWindow();
  },
  
  getPluginProcessName: function()
  {
    let plugin = this.getPlugin();
    // falls back to firefox.exe
    return (plugin && plugin.ProcessName) || "firefox.exe";
  },
  
  /**
   * Ensures that the plugin is initialized before calling the callback
   */
  fireAfterInit: function(callback, self, args, useCapture)
  {
    if (this.isPluginInitialized)
    {
      callback.apply(self, args);
    }
    else
    {
      let window = Utils.getHiddenWindow();
      let handler = function(e)
      {
        window.removeEventListener("IEUtilsPluginInitialized", handler, useCapture ? true : false);
        callback.apply(self, args);
      };
      window.addEventListener("IEUtilsPluginInitialized", handler, useCapture ? true : false);
    }
  },
  
  /**
   * Add a function that sets pref to the plugin instance
   * Setter is called immediately if plugin is already initialized
   */
  addPrefSetter: function(setter)
  {
    this._prefSetters.push(setter);
    if (this.isPluginInitialized)
      setter();
  },

  _handlePluginEvents: function()
  {
    let window = Utils.getHiddenWindow();
    window.addEventListener("PluginClickToPlay", onPluginClickToPlay, true);

    window.addEventListener("PluginNotFound", onPluginLoadFailure, true);
    window.addEventListener("PluginBlockListed", onPluginLoadFailure, true);
    window.addEventListener("PluginOutdated", onPluginLoadFailure, true);
    window.addEventListener("PluginVulnerableUpdatable", onPluginLoadFailure, true);
    window.addEventListener("PluginVulnerableNoUpdate", onPluginLoadFailure, true);
    window.addEventListener("PluginDisabled", onPluginLoadFailure, true);
    
    // https://bugzilla.mozilla.org/show_bug.cgi?id=813963, events merged into PluginBindingAttached
    window.addEventListener("PluginBindingAttached", onPluginBindingAttached, true);
  },
  
  _cancelPluginEvents: function()
  {
    let window = Utils.getHiddenWindow();
    window.removeEventListener("PluginClickToPlay", onPluginClickToPlay, true);

    window.removeEventListener("PluginNotFound", onPluginLoadFailure, true);
    window.removeEventListener("PluginBlockListed", onPluginLoadFailure, true);
    window.removeEventListener("PluginOutdated", onPluginLoadFailure, true);
    window.removeEventListener("PluginVulnerableUpdatable", onPluginLoadFailure, true);
    window.removeEventListener("PluginVulnerableNoUpdate", onPluginLoadFailure, true);
    window.removeEventListener("PluginDisabled", onPluginLoadFailure, true);

    window.removeEventListener("PluginBindingAttached", onPluginBindingAttached, true);
  },

  /**
   * Install the plugin used to do utility things like sync cookie
   */
  _install: function()
  {
    // Change the default cookie and cache directories of the IE, which will
    // be restored when the utils plugin is loaded.
    IECookieManager.changeIETempDirectorySetting();

    this.fireAfterInit(function()
    {
      this.isPluginInitialized = true;
      this._setPluginPrefs();
    }, this, [], true);

    let doc = Utils.getHiddenWindow().document;
    let embed = doc.createElementNS("http://www.w3.org/1999/xhtml", "html:embed");
    embed.setAttribute("id", Utils.utilsPluginId);
    embed.setAttribute("type", "application/fireie");
    embed.style.visibility = "collapse";
    doc.body.appendChild(embed);

    // Check after 30 sec whether the plugin is initialized yet
    Utils.runAsyncTimeout(function()
    {
      if (!this.isPluginInitialized)
        loadFailureSubHandler();
    }, this, 30000);
    
    // Pref setter for cookie sync and DNT
    this.addPrefSetter(setCookieSyncPref);
    this.addPrefSetter(setDNTPref);
  },
  
  _registerHandlers: function()
  {
    let window = Utils.getHiddenWindow();
    window.addEventListener("IEUserAgentReceived", onIEUserAgentReceived, false);
    window.addEventListener("IESetCookie", onIESetCookie, false);
    window.addEventListener("IEBatchSetCookie", onIEBatchSetCookie, false);
    Prefs.addListener(onPrefChanged);
    dntBranch.addObserver("", DNTObserverPrivate, false);
  },
  
  _unregisterHandlers: function()
  {
    let window = Utils.getHiddenWindow();
    window.removeEventListener("IEUserAgentReceived", onIEUserAgentReceived, false);
    window.removeEventListener("IESetCookie", onIESetCookie, false);
    window.removeEventListener("IEBatchSetCookie", onIEBatchSetCookie, false);
    Prefs.removeListener(onPrefChanged);
    dntBranch.removeObserver("", DNTObserverPrivate);
  },
  
  _setPluginPrefs: function()
  {
    let plugin = this.getPlugin();
    this._prefSetters.forEach(function(setter)
    {
      try
      {
        setter(plugin);
      }
      catch (ex)
      {
        Utils.ERROR("Failed calling pref setter: " + ex);
      }
    });
  },
  
  getPluginBindingType: function(plugin)
  {
    switch (plugin.pluginFallbackType) {
    case Ci.nsIObjectLoadingContent.PLUGIN_UNSUPPORTED:
      return "PluginNotFound";
    case Ci.nsIObjectLoadingContent.PLUGIN_DISABLED:
      return "PluginDisabled";
    case Ci.nsIObjectLoadingContent.PLUGIN_BLOCKLISTED:
      return "PluginBlocklisted";
    case Ci.nsIObjectLoadingContent.PLUGIN_OUTDATED:
      return "PluginOutdated";
    case Ci.nsIObjectLoadingContent.PLUGIN_CLICK_TO_PLAY:
      return "PluginClickToPlay";
    case Ci.nsIObjectLoadingContent.PLUGIN_VULNERABLE_UPDATABLE:
      return "PluginVulnerableUpdatable";
    case Ci.nsIObjectLoadingContent.PLUGIN_VULNERABLE_NO_UPDATE:
      return "PluginVulnerableNoUpdate";
    case Ci.nsIObjectLoadingContent.PLUGIN_PLAY_PREVIEW:
      return "PluginPlayPreview";
    default:
      // Not all states map to a handler
      return null;
    }
  },
  
  /**
   * Check dangling new windows if we skipped attaching them to a plugin object
   */
  checkDanglingNewWindow: function(tab)
  {
    let attr = Utils.getTabAttributeJSON(tab, "fireieNavigateParams");
    if (attr && attr.id)
    {
      Utils.LOG("Removing dangling IE new window, id = " + attr.id);
      let plugin = this.getPlugin();
      if (plugin)
        plugin.RemoveNewWindow(attr.id);
      tab.removeAttribute("fireieNavigateParams");
    }
  }
};

function onPluginBindingAttached(event)
{
  let plugin = event.target;

  // We're expecting the target to be a plugin.
  if (!(plugin instanceof Ci.nsIObjectLoadingContent))
    return;
  
  // The plugin binding fires this event when it is created.
  // As an untrusted event, ensure that this object actually has a binding
  // and make sure we don't handle it twice
  let doc = plugin.ownerDocument;
  let overlay = doc.getAnonymousElementByAttribute(plugin, "class", "mainBox");
  if (!overlay || overlay.FireIE_UPMBindingHandled) {
    return;
  }
  overlay.FireIE_UPMBindingHandled = true;

  let eventType = UtilsPluginManager.getPluginBindingType(plugin);
  if (!eventType) return;
  
  switch (eventType)
  {
  case "PluginClickToPlay":
    return onPluginClickToPlay(event);
  case "PluginNotFound":
  case "PluginBlockListed":
  case "PluginOutdated":
  case "PluginVulnerableUpdatable":
  case "PluginVulnerableNoUpdate":
  case "PluginDisabled":
    return onPluginLoadFailure(event);
  default:
    return;
  }
}

/** handle click to play event in the hidden window */
function onPluginClickToPlay(event)
{
  let plugin = event.target;

  // We're expecting the target to be a plugin.
  if (!(plugin instanceof Ci.nsIObjectLoadingContent))
    return;
    
  // used to check whether the plugin is already activated
  let objLoadingContent = plugin.QueryInterface(Ci.nsIObjectLoadingContent);
  
  let mimetype = plugin.getAttribute("type");
  if (mimetype == "application/fireie")
  {
    // check the container page
    let doc = plugin.ownerDocument;
    let url = doc.location.href;
    // is it a utils plugin?
    if (doc.location.href == Utils.hiddenWindowUrl)
    {
      // ok, play the utils plugin
      if (!objLoadingContent.activated)
      {
        plugin.playPlugin();
      }
      event.stopPropagation();
    }
  }
};

function genPluginEventHandler(subHandler)
{
  return function(event)
  {
    let plugin = event.target;

    // We're expecting the target to be a plugin.
    if (!(plugin instanceof Ci.nsIObjectLoadingContent))
      return;
    
    let mimetype = plugin.getAttribute("type");
    if (mimetype == "application/fireie")
    {
      // check the container page
      let doc = plugin.ownerDocument;
      let url = doc.location.href;
      // is it a utils plugin?
      if (doc.location.href == Utils.hiddenWindowUrl)
      {
        subHandler.apply(this, arguments);
      }
    }
  }
}

let loadFailureHandled = false;

function loadFailureSubHandler()
{
  if (loadFailureHandled) return;
  loadFailureHandled = true;
  
  // we have trouble with the plugin now
  IECookieManager.restoreIETempDirectorySetting();
  // notify user about that
  Utils.ERROR("Plugin failed to load. Possibly due to wrong Fire-IE version.");
  Utils.runAsync(function()
  {
    Services.ww.openWindow(null, "chrome://fireie/content/pluginNotFound.xul",
      "_blank", "chrome,centerscreen,dialog", null);
  }, null);
}

/** handle the plugin load failure events and inform user about that */
var onPluginLoadFailure = genPluginEventHandler(
function(event)
{
  loadFailureSubHandler();
});

/** Handler for receiving IE UserAgent from the plugin object */
function onIEUserAgentReceived(event)
{
  let userAgent = event.detail;
  Utils.ieUserAgent = userAgent;
  Utils.LOG("_onIEUserAgentReceived: " + userAgent);
  IECookieManager.restoreIETempDirectorySetting();
}

/**
 * Handles 'IESetCookie' event receiving from the plugin
 * Context is set to null as a fallback situation
 */
function onIESetCookie(event)
{
  let subject = null;
  let topic = "fireie-set-cookie";
  let data = event.detail;
  Services.obs.notifyObservers(subject, topic, data);
}

/**
 * Handles 'IEBatchSetCookie' event receiving from the plugin
 * Context is set to null as a fallback situation
 */
function onIEBatchSetCookie(event)
{
  let subject = null;
  let topic = "fireie-batch-set-cookie";
  let data = event.detail;
  Services.obs.notifyObservers(subject, topic, data);
}

/**
 * Listener for cookie sync pref change
 */
function onPrefChanged(pref)
{
  if (pref == "cookieSyncEnabled")
    setCookieSyncPref(UtilsPluginManager.getPlugin());
}

function setCookieSyncPref(plugin)
{
  plugin.SetCookieSyncEnabled(Prefs.cookieSyncEnabled);
}

function setDNTPref(plugin)
{
  try
  {
    let enabled = dntBranch.getBoolPref("enabled");
    plugin.SetDNTEnabled(enabled);
    Utils.LOG("DNT enabled: " + enabled);
  }
  catch (ex)
  {
    Utils.LOG("Failed to set DNT pref: " + ex);
  }
  try
  {
    let value = dntBranch.getIntPref("value");
    plugin.SetDNTValue(value);
    Utils.LOG("DNT value: " + value);
  }
  catch (ex)
  {
    Utils.LOG("Failed to set DNT value: " + ex);
  }
}

/**
 * Observer for DNT pref change
 */
let DNTObserverPrivate = {
  /**
   * nsIObserver implementation
   */
  observe: function(subject, topic, data)
  {
    if (topic == "nsPref:changed")
    {
      if (data == "enabled" || data == "value")
      {
        setDNTPref(UtilsPluginManager.getPlugin());
      }
    }
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsISupportsWeakReference, Ci.nsIObserver])

};
