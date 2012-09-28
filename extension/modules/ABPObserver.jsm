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

let EXPORTED_SYMBOLS = ["ABPObserver"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

Cu.import(baseURL.spec + "UtilsPluginManager.jsm");
Cu.import(baseURL.spec + "Utils.jsm");
Cu.import(baseURL.spec + "Prefs.jsm");

let abp = {};

/**
 * Detect whether abp exists and fill object abp with essential stuff
 * Returns whether abp is detected
 */
function detectABP()
{
  let installed = false;

  // ABP 2.0 and older
  let ABPPrivate = Cc["@adblockplus.org/abp/private;1"];
  if (ABPPrivate)
  {
    let abpURL = ABPPrivate.getService(Ci.nsIURI);
    try
    {
      Cu.import(abpURL.spec + "FilterNotifier.jsm", abp);
    }
    catch(e) { }

    installed = true;
  }

  if (!installed)
  {
    // ABP 2.1+
    function require(/**String*/ module)
    {
      let result = {};
      result.wrappedJSObject = result;
      Services.obs.notifyObservers(result, "adblockplus-require", module);
      if(!result.exports)
      {
        return null;
      }
      return result.exports;
    }

    try
    {
      let {FilterNotifier} = require("filterNotifier");
      if (FilterNotifier)
      {
        abp.FilterNotifier = FilterNotifier;
        installed = true;
      }
    }
    catch (e) { }
  }

  if (installed)
  {
    installed = typeof(abp.FilterNotifier) === "object" && typeof(abp.FilterNotifier.addListener) === "function";
  }

  return installed;
}

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
  
  init: function()
  {
    if (this._isInitCalled) return;
    this._isInitCalled = true;
    
    UtilsPluginManager.fireAfterInit(function()
    {
      this._abpInstalled = detectABP();
      if (!this._abpInstalled) return;
      
      Utils.LOG("Adblock Plus detected.");
      
      this._abpBranch = Services.prefs.getBranch("extensions.adblockplus.");
      
      if (this._abpBranch)
      {
        this._abpBranch.QueryInterface(Ci.nsIPrefBranch2);
        this._abpBranch.addObserver("", ABPObserverPrivate, false);
      }
      
      this._registerListeners();
      this.updateState();
    }, this, []);
  },
  
  isInstalled: function()
  {
    return this._abpInstalled;
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
    return Prefs.abpSupportEnabled && this._getABPBoolPref("enabled");
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
        file = Utils.resolveFilePath(Services.prefs.getDefaultBranch("extensions.adblockplus.").getCharPref("data_directory"));
        if (file)
          file.append("patterns.ini");
      } catch(e) {}
    }
    let pathname = file ? file.path : null;
    Utils.LOG("Resolved ABP patterns.ini path: " + pathname);
    return pathname;
  },
  
  _loadFilters: function()
  {
    let pathname = this._getFilterFile();
    if (pathname)
      UtilsPluginManager.getPlugin().ABPLoad(pathname);
    this._needReload = false;
  },
  
  /**
   * Enable ABP support
   */
  _enable: function()
  {
    UtilsPluginManager.getPlugin().ABPEnable();
    Utils.LOG("ABP support enabled.")
  },
  
  /**
   * Disable ABP support
   */
  _disable: function()
  {
    UtilsPluginManager.getPlugin().ABPDisable();
    Utils.LOG("ABP support disabled.")
  },
  
  /**
   * Update plugin state according to current prefs.
   * Core updateState function.
   */
  _updateStateCore: function()
  {
    Utils.LOG("ABP updateState() called.");
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
    Utils.LOG("Reloading filters...");
    this._needReload = true;
    this.updateState();
  },
  
  _registerListeners: function()
  {
    let window = UtilsPluginManager.getWindow();
    window.addEventListener("IEABPFilterLoaded", this._onFilterLoaded.bind(this), false);
    window.addEventListener("IEABPLoadFailure", this._onLoadFailure.bind(this), false);
    Prefs.addListener(function(name)
    {
      if (name == "abpSupportEnabled")
        this.updateState();
    }.bind(this));
    abp.FilterNotifier.addListener(function(action, item, newValue, oldValue)
    {
      if (action == "save")
        this.reloadUpdate();
    }.bind(this));
  },
  
  /**
   * Filter load handler: enables ABP support if necessary
   */
  _onFilterLoaded: function(e)
  {
    Utils.LOG("ABP filters loaded: " + e.detail + " active filter(s).");
    // enable ABP support by simply calling updateState()
    this.updateState();
  },
  
  /**
   * Filter load failure handler
   */
  _onLoadFailure: function(e)
  {
    Utils.LOG("Failed to load ABP filters.");
    Utils.ERROR("Failed to load ABP filters.");
    if (this._pendingUpdate)
      this.updateState();
  }
};

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
    ABPObserver.updateState();
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsISupportsWeakReference, Ci.nsIObserver])

};

