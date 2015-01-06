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
 * @fileOverview Manages ABP support and observes ABP preferences
 */

let EXPORTED_SYMBOLS = ["ABPObserver", "ABPStatus"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");

Cu.import(baseURL.spec + "UtilsPluginManager.jsm");
Cu.import(baseURL.spec + "Utils.jsm");
Cu.import(baseURL.spec + "Prefs.jsm");

let abp = {};

let adblockerMap = (function generateAdblockers()
{
  function requireGeneric(/**String*/ module, /**String*/ topic)
  {
    let result = {};
    result.wrappedJSObject = result;
    Services.obs.notifyObservers(result, topic, module);
    if(!result.exports)
    {
      return null;
    }
    return result.exports;
  }
  
  let adblockersArray = [{
    name: "Adblock Plus",
    id: "{d10d0bf8-f5b5-c8b4-a8b2-2b9879e08c5d}",
    prefsBranch: "extensions.adblockplus.",
    filterFilePath: "adblockplus/patterns.ini",
    priority: 100,
    getFilterNotifier: function()
    {
      // ABP 2.0 and older
      let ABPPrivate = Cc["@adblockplus.org/abp/private;1"];
      if (ABPPrivate)
      {
        let abpURL = ABPPrivate.getService(Ci.nsIURI);
        try
        {
          let obj = {};
          Cu.import(abpURL.spec + "FilterNotifier.jsm", obj);
          return obj.FilterNotifier;
        }
        catch (ex) {}
      }

      // ABP 2.1+
      try
      {
        let { FilterNotifier } = requireGeneric("filterNotifier", "adblockplus-require");
        if (FilterNotifier)
        {
          return FilterNotifier;
        }
      }
      catch (ex) {}
    }
  }, {
    name: "Adblock Edge",
    id: "{fe272bd1-5f76-4ea4-8501-a05d35d823fc}",
    prefsBranch: "extensions.adblockedge.",
    filterFilePath: "adblockedge/patterns.ini",
    priority: 50,
    getFilterNotifier: function()
    {
      // ABP 2.1+
      try
      {
        let { FilterNotifier } = requireGeneric("filterNotifier", "adblockedge-require");
        if (FilterNotifier)
        {
          return FilterNotifier;
        }
      }
      catch (ex) {}
    }
  }, {
    name: "Adblock Latitude",
    id: "{016acf6d-e5c0-4768-9376-3763d1ad1978}",
    prefsBranch: "extensions.adblockplus.",
    filterFilePath: "adblockplus/patterns.ini",
    priority: 75,
    getFilterNotifier: function()
    {
      // ABP 2.1+
      try
      {
        let { FilterNotifier } = requireGeneric("filterNotifier", "adblockplus-require");
        if (FilterNotifier)
        {
          return FilterNotifier;
        }
      }
      catch (ex) {}
    }
  }, {
    name: "Pan",
    id: "{A065A84F-95B6-433A-A0C8-4C040B77CE8A}",
    prefsBranch: "extensions.pan.",
    filterFilePath: "pan/patterns.ini",
    priority: 25,
    getFilterNotifier: function()
    {
      // ABP 2.1+
      try
      {
        let { FilterNotifier } = requireGeneric("filterNotifier", "pan-require");
        if (FilterNotifier)
        {
          return FilterNotifier;
        }
      }
      catch (ex) {}
    },
    options: {
      excludedSubscriptionsRegex: "/^\\[proxy\\]/"
    }
  }];
  
  let map = {};
  adblockersArray.forEach(function(adblocker)
  {
    map[adblocker.id] = adblocker;
  });
  
  return map;
})();

/**
 * Current adblocker in use
 */
let adblocker = null;

/**
 * Queries the FilterNotifier Object used to trigger reloads on "save" events
 */
function queryFilterNotifier()
{
  if (adblocker)
    abp.FilterNotifier = adblocker.getFilterNotifier();
}

let abpAdditionalFilters = [
  // Compatibility filters for IE
  "[Subscription]",
  "[Subscription filters]",
  "#@#.like_share.left" // Issue #112
].join("\r\n");

let ABPStatus = {
  NotDetected: 0,
  Enabled: 1,
  Disabled: 2,
  Loading: 3,
  LoadFailed: 4
};

let ABPObserver = {

  _abpInstalled: false,
  
  _abpBranch: null,
  
  /**
   * Whether init() has been called
   */
  _isInitCalled: false,
  
  /**
   * Whether there's any pending updateState calls during filter loading
   */
  _pendingUpdate: false,
  
  /**
   * Whether a reload is needed for the current updateState call
   */
  _needReload: false,
  
  /**
   * Whether there's scheduled (runAsync) updateState calls
   */
  _scheduledUpdate: false,
  
  /**
   * ABP status
   */
  _status: ABPStatus.NotDetected,
  
  /**
   * Listeners of ABPObserver
   */
  _listeners: [],
  
  /**
   * Timer for clearing the loaded ABP filters
   */
  _clearTimer: null,
  
  /**
   * Anything loaded (including cache)?
   */
  _cleared: true,
  
  /**
   * Lazy initialization on first browser window creation. See Bootstrap.jsm
   */
  lazyStartup: function()
  {
    this.init();
  },
  
  init: function()
  {
    if (this._isInitCalled) return;
    this._isInitCalled = true;
    
    UtilsPluginManager.fireAfterInit(function()
    {
      // Apply a retry sequence to avoid the reported "Not Detected" bug
      this._detectABP();
      Utils.runAsyncTimeout(this._detectABP, this, 5000);
      Utils.runAsyncTimeout(this._detectABP, this, 30000);
            
      this._registerListeners();
      
      UtilsPluginManager.addPrefSetter(this._setAdditionalFilters.bind(this));
      UtilsPluginManager.addPrefSetter(this.updateState.bind(this));
    }, this, []);
  },
  
  shutdown: function()
  {
    if (!this._isInitCalled) return;
    UtilsPluginManager.fireAfterInit(function()
    {
      this._listeners = [];
      this._abpBranch = null;
      this._unregisterListeners();
      
      // unload all filters if possible
      try
      {
        UtilsPluginManager.getPlugin().ABPClear();
      }
      catch (e) {}
      
      this._cancelClearTimer();
    }, this, []);
  },
  
  isInstalled: function()
  {
    return this._abpInstalled;
  },
  
  getStatus: function()
  {
    return this._status;
  },
  
  getAdblockerName: function()
  {
    return adblocker.localizedName || adblocker.name;
  },
  
  addListener: function(listener)
  {
    this._listeners.push(listener);
  },
  
  removeListener: function(listener)
  {
    Utils.removeOneItem(this._listeners, listener);
  },
  
  _onABPEnable: function()
  {
    if (this._abpInstalled) return;
    
    this._abpInstalled = true;
    Utils.LOG("[ABP] " + adblocker.name + " detected.");
    
    this._abpBranch = Services.prefs.getBranch(adblocker.prefsBranch);
    if (this._abpBranch)
    {
      this._abpBranch.QueryInterface(Ci.nsIPrefBranch2);
      this._abpBranch.addObserver("", ABPObserverPrivate, false);
    }

    if (!abp.FilterNotifier)
      queryFilterNotifier();
    this._setStatus(ABPStatus.Disabled);

    try
    {
      abp.FilterNotifier.removeListener(onABPFilterNotify);
      abp.FilterNotifier.addListener(onABPFilterNotify);
    }
    catch (ex)
    {
      Utils.LOG("[ABP] Failed to add listener to FilterNotifier: " + ex);
    }
    
    this._needReload = true;
    this.updateState();
  },
  
  _onABPDisable: function()
  {
    if (!this._abpInstalled) return;

    this._abpInstalled = false;
    Utils.LOG("[ABP] " + adblocker.name + " disabled or removed.");

    if (this._abpBranch)
    {
      this._abpBranch.removeObserver("", ABPObserverPrivate);
      this._abpBranch = null;    
    }
    
    try
    {
      abp.FilterNotifier.removeListener(onABPFilterNotify);
    }
    catch (ex) {}

    this.updateState();

    abp = {};
    this._setStatus(ABPStatus.NotDetected);
    
    // In-case there're other adblockers available
    this._detectABP();
  },
  
  _detectABP: function()
  {
    if (this._abpInstalled) return;
    
    Utils.LOG("[ABP] Detecting adblockers...");
    
    let idArray = [];
    for (let id in adblockerMap)
    {
      idArray.push(id);
    }
    // Sort detection order by adblocker priority
    idArray.sort(function(id1, id2)
    {
      let priority1 = adblockerMap[id1].priority;
      let priority2 = adblockerMap[id2].priority;
      return priority2 - priority1;
    });
    let self = this;
    function detectAddon(index)
    {
      if (index >= idArray.length) return;
      let id = idArray[index];
      AddonManager.getAddonByID(id, function(addon)
      {
        let installed = (addon != null && addon.isActive);
        if (installed)
        {
          adblocker = adblockerMap[id];
          // Record localized name
          adblocker.localizedName = addon.name;
          self._onABPEnable();
          return;
        }
        detectAddon(index + 1);
      });
    }
    detectAddon(0);
  },
  
  _setStatus: function(status)
  {
    this._status = status;
    this._triggerClearTimers();
    this._triggerListeners("statusChanged", status);
  },
  
  _triggerClearTimers: function()
  {
    switch (this._status)
    {
    case ABPStatus.NotDetected:
    case ABPStatus.Disabled:
    case ABPStatus.LoadFailed:
      this._setClearTimer();
      break;
    case ABPStatus.Loading:
    case ABPStatus.Enabled:
      this._cancelClearTimer();
      break;
    }
  },
  
  _triggerListeners: function(topic, data)
  {
    this._listeners.forEach(function(listener)
    {
      try { listener(topic, data); } catch (ex) {}
    });
  },
  
  /**
   * Non-throwing pref accessors for abp branch
   */
  _getABPCharPref: function(name)
  {
    try
    {
      return this._abpBranch.getCharPref(name);
    }
    catch (e)
    {
      return null;
    }
  },
  _getABPBoolPref: function(name)
  {
    try
    {
      return this._abpBranch.getBoolPref(name);
    }
    catch (e)
    {
      return null;
    }
  },

  /**
   * Whether we should enable ABP support?
   */
  _canEnable: function()
  {
    return this._abpInstalled && Prefs.abpSupportEnabled && this._getABPBoolPref("enabled");
  },
  
  /**
   * Returns the filter file pathname
   */
  _getFilterFile: function()
  {
    let file = null;
    let pref = this._getABPCharPref("patternsfile");
    if (pref)
    {
      // Override in place, use it instead of placing the file in the regular data dir
      file = Utils.resolveFilePath(pref);
    }
    if (!file)
    {
      // Place the file in the data dir
      pref = this._getABPCharPref("data_directory")
      if (pref)
      {
        file = Utils.resolveFilePath(pref);
        if (file)
          file.append("patterns.ini");
      }
    }
    if (!file)
    {
      // Data directory pref misconfigured? Try the default value
      try
      {
        file = Utils.resolveFilePath(Services.prefs.getDefaultBranch(adblocker.prefsBranch).getCharPref("data_directory"));
        if (file)
          file.append("patterns.ini");
      } catch (ex) {}
    }
    if (!file)
    {
      // Still no good? Try the hard-coded path
      try
      {
        file = Utils.resolveFilePath(adblocker.filterFilePath);
      } catch (ex) {}
    }
    let pathname = file ? file.path : null;
    return pathname;
  },
  
  _loadFilters: function()
  {
    let pathname = this._getFilterFile();
    if (pathname)
    {
      try
      {
        UtilsPluginManager.getPlugin().ABPLoad(pathname, UtilsPluginManager.convertObject(
          adblocker.options || {}));
        this._setStatus(ABPStatus.Loading);
        Utils.LOG("[ABP] Loading filters from \"" + pathname + "\"...");
      }
      catch (ex)
      {
        this._setStatus(ABPStatus.LoadFailed);
        Utils.ERROR("[ABP] Failed to load filters from \"" + pathname + "\": " + ex);
      }
    }
    this._needReload = false;
  },
  
  /**
   * Enable ABP support
   */
  _enable: function()
  {
    try
    {
      UtilsPluginManager.getPlugin().ABPEnable();
      this._setStatus(ABPStatus.Enabled);
      Utils.LOG("[ABP] Enabled.");
    }
    catch (ex)
    {
      this._setStatus(ABPStatus.Disabled);
      Utils.ERROR("[ABP] Cannot enable ABP support: " + ex);
    }
  },
  
  /**
   * Disable ABP support
   */
  _disable: function()
  {
    try
    {
      UtilsPluginManager.getPlugin().ABPDisable();
      this._setStatus(this._abpInstalled ? ABPStatus.Disabled : ABPStatus.NotDetected);
      Utils.LOG("[ABP] Disabled.");
    }
    catch (ex)
    {
      this._setStatus(ABPStatus.Disabled);
      Utils.ERROR("[ABP] Cannot disable ABP support: " + ex);
    }
  },
  
  /**
   * Update plugin state according to current prefs.
   * Core updateState function.
   */
  _updateStateCore: function()
  {
    Utils.LOG("[ABP] updateState() called.");
    this._scheduledUpdate = false;
    
    // updates the plugin state
    let plugin = UtilsPluginManager.getPlugin();
    if (plugin)
    {
      // Don't do anything while filters are loading
      // We'll handle later in the Loaded/LoadFailure event handlers
      if (plugin.ABPIsLoading)
      {
        this._pendingUpdate = true;
        return;
      }
      
      let enabled = plugin.ABPIsEnabled;
      let pathname = plugin.ABPLoadedFile;
      
      if (enabled)
      {
        if (!this._canEnable())
          this._disable();
        else if (this._needReload || pathname != this._getFilterFile())
          this._loadFilters();
      }
      else
      {
        if (this._canEnable())
        {
          if (this._needReload || pathname != this._getFilterFile())
            this._loadFilters();
          else this._enable();
        }
        else
        {
          this._triggerClearTimers();
        }
      }
    }
    this._pendingUpdate = false;
  },
  
  /**
   * Update plugin state according to current prefs.
   * Just schedules calls to the core function.
   */
  updateState: function()
  {
    if (this._scheduledUpdate) return;
    this._scheduledUpdate = true;
    Utils.runAsync(this._updateStateCore, this);
  },
  
  /**
   * Update plugin state according to current prefs.
   * Just schedules calls to the core function.
   * This version always forces a reload
   */
  reloadUpdate: function()
  {
    Utils.LOG("[ABP] Reloading filters...");
    this._needReload = true;
    this.updateState();
  },
  
  _registerListeners: function()
  {
    let window = UtilsPluginManager.getWindow();
    window.addEventListener("IEABPFilterLoaded", onABPFilterLoaded, false);
    window.addEventListener("IEABPLoadFailure", onABPLoadFailure, false);
    Prefs.addListener(onFireIEPrefChanged);
    AddonManager.addAddonListener(ABPAddonListener);
  },
  
  _unregisterListeners: function()
  {
    let window = UtilsPluginManager.getWindow();
    window.removeEventListener("IEABPFilterLoaded", onABPFilterLoaded, false);
    window.removeEventListener("IEABPLoadFailure", onABPLoadFailure, false);
    Prefs.removeListener(onFireIEPrefChanged);
    AddonManager.removeAddonListener(ABPAddonListener);
  },
  
  _onPrefChanged: function()
  {
    // do not take actions on pref change when abp is not detected
    if (!this._abpInstalled)
      return;
    this.updateState();
    if (!this._canEnable())
      this._setStatus(ABPStatus.Disabled);
  },
  
  _setClearTimer: function()
  {
    if (this._clearTimer || this._cleared) return;
    this._clearTimer = Utils.runAsyncTimeout(function()
    {
      UtilsPluginManager.getPlugin().ABPClear();
      this._clearTimer = null;
      this._cleared = true;
      Utils.LOG("[ABP] Cleared.");
    }, this, 60000);
    Utils.LOG("[ABP] Scheduled to clear in 60 seconds.");
  },
  
  _cancelClearTimer: function()
  {
    if (!this._clearTimer) return;
    Utils.cancelAsyncTimeout(this._clearTimer);
    this._clearTimer = null;
    Utils.LOG("[ABP] Canceled previous clear schedule.");
  },
  
  _setAdditionalFilters: function()
  {
    let plugin = UtilsPluginManager.getPlugin();
    if (!plugin) return;
    let additionalFilters = Prefs.abpAdditionalFiltersEnabled ? abpAdditionalFilters : "";
    plugin.ABPSetAdditionalFilters(additionalFilters);
  }
};

/**
 * Filter load handler: enables ABP support if necessary
 */
function onABPFilterLoaded(e)
{
  try
  {
    let detailObj = { number: "unknown", ticks: "unknown" };
    detailObj = JSON.parse(e.detail);
    Utils.LOG("[ABP] Filters loaded: " + detailObj.number + " active filter(s) in " + detailObj.ticks + " ms.");
  }
  catch (ex)
  {
    Utils.LOG("[ABP] Filters loaded.");
  }
  // enable ABP support
  let self = ABPObserver;
  self._cleared = false;
  if (self._pendingUpdate)
    self.updateState();
  else
    self._enable();
}

/**
 * Filter load failure handler
 */
function onABPLoadFailure(e)
{
  let self = ABPObserver;
  self._setStatus(ABPStatus.LoadFailed);
  Utils.LOG("[ABP] Failed to load filters.");
  Utils.ERROR("[ABP] Failed to load filters.");
  if (self._pendingUpdate)
    self.updateState();
}

function onFireIEPrefChanged(name)
{
  if (name == "abpSupportEnabled")
  {
    let self = ABPObserver;
    self._onPrefChanged();
  }
  else if (name == "abpAdditionalFiltersEnabled")
  {
    let self = ABPObserver;
    self._setAdditionalFilters();
    self.reloadUpdate();
  }
}

function onABPFilterNotify(action, item, newValue, oldValue)
{
  if (action == "save")
    ABPObserver.reloadUpdate();
}

/**
 * Observer for ABP pref change
 */
let ABPObserverPrivate = {
  /**
   * nsIObserver implementation
   */
  observe: function(subject, topic, data)
  {
    if (topic == "nsPref:changed" && data == "enabled")
    {
      ABPObserver._onPrefChanged();
    }
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsISupportsWeakReference, Ci.nsIObserver])

};

/**
 * Listen for addon changes
 */
let ABPAddonListener = {
  onEnabled: function(/* in Addon */addon)
  {
    let blocker = adblockerMap[addon.id];
    if (blocker && !ABPObserver.isInstalled())
    {
      adblocker = blocker;
      // Record localized name
      adblocker.localizedName = addon.name;
      Utils.runAsync(function()
      {
        ABPObserver._onABPEnable();
      }, this);
    }
  },
  
  onDisabled: function(/* in Addon */addon)
  {
    let blocker = adblockerMap[addon.id];
    if (blocker && ABPObserver.isInstalled() && adblocker === blocker)
    {
      Utils.runAsync(function()
      {
        ABPObserver._onABPDisable();
      }, this);
    }
  },
  
  onInstalled: function(/* in Addon */addon)
  {
    this.onEnabled(addon);
  },
  
  onUninstalled: function(/* in Addon */addon)
  {
    this.onDisabled(addon);
  }
};
