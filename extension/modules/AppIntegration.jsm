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
 * @fileOverview Application integration module, will keep track of application
 * windows and handle the necessary events.
 */

var EXPORTED_SYMBOLS = ["AppIntegration"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/ctypes.jsm");

Cu.import(baseURL.spec + "Utils.jsm");
Cu.import(baseURL.spec + "Prefs.jsm");
Cu.import(baseURL.spec + "Favicon.jsm");
Cu.import(baseURL.spec + "ContentPolicy.jsm");
Cu.import(baseURL.spec + "RuleListener.jsm");
Cu.import(baseURL.spec + "RuleStorage.jsm");
Cu.import(baseURL.spec + "RuleNotifier.jsm");
Cu.import(baseURL.spec + "RuleClasses.jsm");
Cu.import(baseURL.spec + "SubscriptionClasses.jsm");
Cu.import(baseURL.spec + "Synchronizer.jsm");
Cu.import(baseURL.spec + "LightweightTheme.jsm");
Cu.import(baseURL.spec + "EasyRuleCreator.jsm");
Cu.import(baseURL.spec + "UtilsPluginManager.jsm");

/**
 * Wrappers for tracked application windows.
 * @type Array of WindowWrapper
 */
let wrappers = [];

/**
 * Whether to refresh plugin list. The plugin list should be refreshed when the
 * first browser window opens.
 */
let isPluginListRefreshed = false;

/**
 * Initializes app integration module
 */
function init()
{
  // Process preferences
  reloadPrefs();

  // Listen for pref and rules changes
  Prefs.addListener(function(name)
  {
    if (name == "showUrlBarLabel" || name == "hideUrlBarButton" || name == "showTooltipText"
      || name == "shortcut_key" || name == "shortcut_modifiers" || name == "shortcutEnabled"
      || name == "currentTheme" || name == "fxLabel" || name == "ieLabel")
    {
      reloadPrefs();
    }
    if (name == "showSiteFavicon")
    {
      updateFavicons();
    }
    if (name == "showStatusText")
    {
      wrappers.forEach(function(wrapper)
      {
        wrapper.updateIEStatusText();
      });
    }
  });
  RuleNotifier.addListener(function(action)
  {
    if (/^(rule|subscription)\.(added|removed|disabled|updated)$/.test(action)) reloadPrefs();
  });
  
  // observer to listen to the "fireie-reload-prefs" notification
  let reloadObserver = {
    QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver]),
    
    observe: function(subject, topic, data)
    {
      if (topic == "fireie-reload-prefs")
        reloadPrefs();
    }
  };
  
  Services.obs.addObserver(reloadObserver, "fireie-reload-prefs", false);
}

/**
 * Exported app integration functions.
 * @class
 */
let AppIntegration = {
  /**
   * Adds an application window to the tracked list.
   */
  addWindow: function( /**Window*/ window) /**WindowWrapper*/
  {
    // Execute first-run actions
    // Show subscriptions dialog if the user doesn't have any subscriptions yet
    Utils.fireWithAddonVersion(function(addonVersion)
    {
      if (Prefs.currentVersion != addonVersion)
      {
        Prefs.currentVersion = addonVersion;
        
        refreshRuleCache();

        if ("nsISessionStore" in Ci)
        {
          // Have to wait for session to be restored
          let observer = {
            QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver]),
            observe: function(subject, topic, data)
            {
              observerService.removeObserver(observer, "sessionstore-windows-restored");
              timer.cancel();
              timer = null;
              addSubscription();
            }
          };

          let observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
          observerService.addObserver(observer, "sessionstore-windows-restored", false);

          // Just in case, don't wait more than two seconds
          let timer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
          timer.init(observer, 2000, Ci.nsITimer.TYPE_ONE_SHOT);
        }
        else
        {
          addSubscription();
        }
      }
    });

    let wrapper = new WindowWrapper(window);
    wrappers.push(wrapper);
    
    return wrapper;
  },

  /**
   * Retrieves the wrapper object corresponding to a particular application window.
   */
  getWrapperForWindow: function( /**Window*/ wnd) /**WindowWrapper*/
  {
    for each(let wrapper in wrappers)
      if (wrapper.window == wnd) return wrapper;

    return null;
  },

  /**
   * Retrieves any available utils plugin object
   */
  getAnyUtilsPlugin: function()
  {
    return UtilsPluginManager.getPlugin();
  },

  /**
   * Determines whether we should handle status messages ourselves
   */
  shouldShowStatusOurselves: function()
  {
    let plugin = this.getAnyUtilsPlugin();
    if (plugin)
    {
      let ret = plugin.ShouldShowStatusOurselves;
      if (typeof(ret) != "undefined") // in case utility plugin not fully loaded yet
      {
        this.shouldShowStatusOurselves = function() ret;
        return ret;
      }
    }
    return false;
  },

  /**
   * Determines whether we should prevent status messages from causing pages to flash
   */
  shouldPreventStatusFlash: function()
  {
    let plugin = this.getAnyUtilsPlugin();
    if (plugin)
    {
      let ret = plugin.ShouldPreventStatusFlash;
      if (typeof(ret) != "undefined") // in case utility plugin not fully loaded yet
      {
        this.shouldPreventStatusFlash = function() ret;
        return ret;
      }
    }
    return false;
  },
  
  /**
   * Retrieves the name of the process where the plugin sits
   */
  getPluginProcessName: function()
  {
    return UtilsPluginManager.getPluginProcessName();
  }
};

/**
 * Removes an application window from the tracked list.
 */
function removeWindow()
{
  let wnd = this;

  for (let i = 0; i < wrappers.length; i++)
  if (wrappers[i].window == wnd) wrappers.splice(i--, 1);
}

/**
 * Class providing various functions related to application windows.
 * @constructor
 */
function WindowWrapper(window)
{

  this.window = window;
  this.Utils = Utils;
  Utils.userAgent = window.navigator.userAgent;
  
  this._genCE();

  if (!isPluginListRefreshed)
  {
    /**
     * The plugins array has its own method, refresh. This method makes newly
     * installed plug-ins available, updates related arrays such as the plugins
     * array, and optionally reloads open documents that contain plug-ins. You
     * call this method with one of the following statements:
     *
     *   navigator.plugins.refresh(true)
     *   navigator.plugins.refresh(false)
     *
     * If you supply true, refresh refreshes the plugins array to make newly
     * installed plug-ins available and reloads all open documents that contain
     * embedded objects (EMBED tag). If you supply false, it refreshes the
     * plugins array, but does not reload open documents.
     *
     * When the user installs a plug-in, that plug-in is not available until
     * refresh is called or the user closes and restarts Navigator.
     */
    window.navigator.plugins.refresh(false);
    isPluginListRefreshed = true;
  }
}

WindowWrapper.prototype = {
  /**
   * Application window this object belongs to.
   * @type Window
   */
  window: null,

  Utils: null,

  /**
   * Reference to the progress listener
   */
  _progressListener: null,

  /**
   * Resuming from private browsing warning
   */
  _pbwResume: false,
  
  /**
   * ID of the delayed focus plugin timeout
   */
  _delayedFocusPluginTimer: null,
  
  /**
   * Binds a function to the object, ensuring that "this" pointer is always set
   * correctly.
   */
  _bindMethod: function( /**Function*/ method) /**Function*/
  {
    let me = this;
    return function() method.apply(me, arguments);
  },

  /**
   * Retrieves an element by its ID.
   */
  E: function( /**String*/ id)
  {
    let doc = this.window.document;
    this.E = function(id) doc.getElementById(id);
    return this.E(id);
  },
  
  /**
   * Shorthand for document.createElementNS
   */
  _genCE: function()
  {
    let doc = this.window.document;
    this.CE = function(tag) doc.createElementNS(
      "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", tag);
    return this.CE;
  },

  init: function()
  {
    Services.obs.notifyObservers(null, "fireie-lazy-init", null);

    this._registerEventListeners();

    this.updateState();
  },

  /**
   * Sets up URL bar button
   */
  _setupUrlBarButton: function()
  {
    this.E("fireie-urlbar-switch-label").hidden = !Prefs.showUrlBarLabel;
    this.E("fireie-urlbar-switch").hidden = Prefs.hideUrlBarButton;
    this.E("fireie-urlbar-switch-tooltip").hidden = !Prefs.showTooltipText;
  },

  /**
   * Attaches event listeners to a window represented by hooks element
   */
  _registerEventListeners: function( /**Boolean*/ addProgressListener)
  {
    // Must keep a reference to the progress listener!
    this._progressListener = new ProgressListener(this);
    this.window.gBrowser.addProgressListener(this._progressListener);
    
    this.window.addEventListener("unload", removeWindow, false);

    this.window.addEventListener("DOMContentLoaded", this._bindMethod(this._onPageShowOrLoad), false);
    this.window.addEventListener("pageshow", this._bindMethod(this._onPageShowOrLoad), false);
    this.window.addEventListener("resize", this._bindMethod(this._onResize), false);
    this.window.gBrowser.tabContainer.addEventListener("TabSelect", this._bindMethod(this._onTabSelected), false);
    this.E("menu_EditPopup").addEventListener("popupshowing", this._bindMethod(this._updateEditMenuItems), false);
    this.window.addEventListener("mousedown", this._bindMethod(this._onMouseDown), true);
    this.E("urlbar-reload-button").addEventListener("click", this._bindMethod(this._onClickInsideURLBar), false);
    this.E("urlbar-stop-button").addEventListener("click", this._bindMethod(this._onClickInsideURLBar), false);
    this.E("star-button").addEventListener("click", this._bindMethod(this._onClickInsideURLBar), false);
    this.window.gURLBar.addEventListener("input", this._bindMethod(this.updateButtonStatus), false);
    
    // Listen to plugin events
    this.window.addEventListener("IEContentPluginInitialized", this._bindMethod(this._onIEContentPluginInitialized), false);
    this.window.addEventListener("IEProgressChanged", this._bindMethod(this._onIEProgressChange), false);
    this.window.addEventListener("IENewTab", this._bindMethod(this._onIENewTab), false);
    this.window.addEventListener("IESetSecureLockIcon", this._bindMethod(this._onIESetSecureLockIcon), false);
    this.window.addEventListener("IEStatusChanged", this._bindMethod(this._onIEStatusChanged), false);
    this.window.addEventListener("IESetCookie", this._bindMethod(this._onIESetCookie), false);
    this.window.addEventListener("IEBatchSetCookie", this._bindMethod(this._onIEBatchSetCookie), false);

    // Listen for theme related events that bubble up from content
    this.window.document.addEventListener("InstallBrowserTheme", this._bindMethod(this._onInstallTheme), false, true);
    this.window.document.addEventListener("PreviewBrowserTheme", this._bindMethod(this._onPreviewTheme), false, true);
    this.window.document.addEventListener("ResetBrowserThemePreview", this._bindMethod(this._onResetThemePreview), false, true);
  },
 
  // security check, do not let malicious sites send fake events
  _checkEventOrigin: function(event)
  {
    let target = event.target;
    if (!target) return false;
    let doc = target.ownerDocument;
    if (!doc) return false;
    let allow = Utils.isIEEngine(doc.location.href);
    if (!allow) Utils.LOG("Blocked content event: " + event.type);
    return allow;
  },
  
  /**
   * Update favicon for the specified tab
   */
  _updateFaviconForTab: function(tab)
  {
    let pluginObject = this.getContainerPlugin(tab);
    if (pluginObject)
    {
      // udpate current tab's favicon
      let faviconURL = Prefs.showSiteFavicon ?
        pluginObject.FaviconURL : LightweightTheme.ieIconUrl;
      if (faviconURL && faviconURL != "")
      {
        let browser = tab ? tab.linkedBrowser : this.window.gBrowser;
        Favicon.setIcon(browser.contentDocument, faviconURL);
      }
    }
  },
  
  /**
   * Update favicons for every tab
   */
  updateFavicons: function()
  {
    let mTabs = this.window.gBrowser.mTabContainer.childNodes;
    for (let i = 0; i < mTabs.length; i++)
      if (mTabs[i].localName == "tab")
        this._updateFaviconForTab(mTabs[i]);
  },
  
  updateButtonStatus: function()
  {
    Utils.scheduleThrottledUpdate(this._updateButtonStatusCore, this);
  },
  
  _updateButtonStatusCore: function()
  {
    // Only update when we are on a firefox-only page
    let url = this.getURL();
    if (!Utils.isFirefoxOnly(url))
      return;
    
    // disable engine switch for firefox-only urls
    let urlbarButton = this.E("fireie-urlbar-switch");
    urlbarButton.disabled = !Utils.isValidUrl(this.window.gURLBar.value) ||
                            Utils.isFirefoxOnly(this.window.gURLBar.value);

    let tooltip = this.E("fireie-urlbar-switch-tooltip");
    tooltip.className = urlbarButton.disabled ? "btndisabled" : "";

    // If there exists a tool button of FireIE, make it's status the same with that on the URL bar.
    let toolbarButton = this.E("fireie-toolbar-palette-button");
    if (toolbarButton)
      toolbarButton.disabled = urlbarButton.disabled;
  },
  
  /**
   * Updates the UI for an application window.
   * Note that UI is not immediately updated until the scheduled update code is run,
   * so don't rely on any UI state after the update
   */
  updateInterface: function() { this._updateInterface(); },
  _updateInterface: function()
  {
    Utils.scheduleThrottledUpdate(this._updateInterfaceCore, this);
  },
  _updateInterfaceCore: function()
  {
    try
    {
      this._isUpdating = true;

      let pluginObject = this.getContainerPlugin();
      let url = this.getURL();
      let isIEEngine = this.isIEEngine();

      // Update the enable status of back, forward, reload and stop buttons.
      let canBack = (pluginObject ? pluginObject.CanBack : false) || this.window.gBrowser.webNavigation.canGoBack;
      let canForward = (pluginObject ? pluginObject.CanForward : false) || this.window.gBrowser.webNavigation.canGoForward;
      let isBlank = (this.window.gBrowser.currentURI.spec == "about:blank");
      let isLoading = this.window.gBrowser.mIsBusy;
      this._updateObjectDisabledStatus("Browser:Back", canBack);
      this._updateObjectDisabledStatus("Browser:Forward", canForward);
      this._updateObjectDisabledStatus("Browser:Reload", pluginObject ? pluginObject.CanRefresh : !isBlank);
      this._updateObjectDisabledStatus("Browser:Stop", pluginObject ? pluginObject.CanStop : isLoading);

      // Update the content of the URL bar.
      if (this.window.gURLBar && isIEEngine)
      {
        if (!this.window.gBrowser.userTypedValue)
        {
          if (url == "about:blank") url = "";
          if (this.window.gURLBar.value != url) {
            this.window.gURLBar.value = url;
          }
        }
      }

      if (pluginObject)
      {
        // udpate current tab's favicon
        this._updateFaviconForTab();
        // update current tab's secure lock info
        this.checkIdentity();
        // update status text
        this.updateIEStatusText();
        // update current tab's title
        let title = pluginObject.Title;
        if (title && title != "")
          this.window.gBrowser.contentDocument.title = title;
      }

      // Update the star button indicating whether current page is bookmarked.
      if (this.window.PlacesStarButton && this.window.PlacesStarButton.updateState)
        this.window.PlacesStarButton.updateState();
      else if (this.window.BookmarksMenuButton && this.window.BookmarksMenuButton.updateStarState)
        this.window.BookmarksMenuButton.updateStarState();
      else if (this.window.BookmarkingUI && this.window.BookmarkingUI.updateStarState)
        this.window.BookmarkingUI.updateStarState();

      function escapeURLForCSS(url)
      {
        return url.replace(/[(),\s'"]/g, "\$&");
      }

      // Update the engine button on the URL bar
      let urlbarButton = this.E("fireie-urlbar-switch");
      // disable engine switch for firefox-only urls
      urlbarButton.disabled = Utils.isFirefoxOnly(url) &&
        (!Utils.isValidUrl(this.window.gURLBar.value) || Utils.isFirefoxOnly(this.window.gURLBar.value));
      urlbarButton.style.visibility = "visible";
      let tooltip = this.E("fireie-urlbar-switch-tooltip");
      tooltip.className = urlbarButton.disabled ? "btndisabled" : "";
      let fxURL = LightweightTheme.fxIconUrl;
      let ieURL = LightweightTheme.ieIconUrl;
      let engineIconCSS = 'url("' + escapeURLForCSS(isIEEngine ? ieURL : fxURL) + '")';
      this.E("fireie-urlbar-switch").style.listStyleImage = engineIconCSS;
      this.E("fireie-urlbar-switch-image").style.listStyleImage = engineIconCSS;
      let urlbarButtonLabel = this.E("fireie-urlbar-switch-label");
      urlbarButtonLabel.value = isIEEngine ? (Prefs.ieLabel || Utils.getString("fireie.urlbar.switch.label.ie"))
                                           : (Prefs.fxLabel || Utils.getString("fireie.urlbar.switch.label.fx"));
      let urlbarButtonTooltip = this.E("fireie-urlbar-switch-tooltip2");
      urlbarButtonTooltip.value = Utils.getString(isIEEngine ? "fireie.urlbar.switch.tooltip2.ie" : "fireie.urlbar.switch.tooltip2.fx");

      // If there exists a tool button of FireIE, make it's status the same with that on the URL bar.
      let toolbarButton = this.E("fireie-toolbar-palette-button");
      if (toolbarButton)
      {
        toolbarButton.disabled = urlbarButton.disabled;
        toolbarButton.style.listStyleImage = engineIconCSS;
      }
    }
    catch (e)
    {
      Utils.ERROR(e);
    }
  },

  /** chang the disable status of specified DOM object*/
  _updateObjectDisabledStatus: function(objId, isEnabled)
  {
    let obj = (typeof(objId) == "object" ? objId : this.E(objId));
    if (obj)
    {
      let d = obj.hasAttribute("disabled");
      if (d == isEnabled)
      {
        if (d) obj.removeAttribute("disabled");
        else obj.setAttribute("disabled", true);
      }
    }
  },

  // update the disabled status of cmd_cut, cmd_copy and cmd_paste menu items in the main menu
  _updateEditMenuItems: function(e)
  {
    if (e.originalTarget != this.E("menu_EditPopup")) return;
    let pluginObject = this.getContainerPlugin();
    if (pluginObject)
    {
      this._updateObjectDisabledStatus("cmd_cut", pluginObject.CanCut);
      this._updateObjectDisabledStatus("cmd_copy", pluginObject.CanCopy);
      this._updateObjectDisabledStatus("cmd_paste", pluginObject.CanPaste);
      this._updateObjectDisabledStatus("cmd_selectAll", pluginObject.CanSelectAll);
      this._updateObjectDisabledStatus("cmd_undo", pluginObject.CanUndo);
      this._updateObjectDisabledStatus("cmd_redo", pluginObject.CanRedo);
    }
  },

  /**
   * Updates displayed state for an application window.
   */
  updateState: function()
  {
    this._setupTheme();

    this._setupUrlBarButton();

    this._configureKeys();

    this._updateInterface();
  },


  /**
   * Setup up the theme
   */
  _setupTheme: function()
  {
    this._applyTheme(LightweightTheme.currentTheme);
  },

  /**
   * Sets up hotkeys for the window.
   */
  _configureKeys: function()
  {
    /*
      <key id="key_fireieSwitch" command="cmd_fireieSwitch" modifiers="alt"
      key="C" />
    */
    try
    {
      let isFirst = false;
      let keyItem = this.E("key_fireieSwitch");
      if (!keyItem)
      {
        keyItem = this.CE("key")
        keyItem.setAttribute("id", "key_fireieSwitch");
        keyItem.setAttribute("command", "cmd_fireieSwitch");
        this.E("mainKeyset").appendChild(keyItem);
        isFirst = true;
      }

      // Modifying shortcut keys & modifiers requires a restart,
      // while modifying the disabled state does not.
      if (isFirst)
      {
        // Default key is "C"
        let shortcut_key = Prefs.shortcut_key;
        // Normalize to VK_* keycode
        if (Utils.startsWith(shortcut_key, "VK_"))
        {
          keyItem.setAttribute("keycode", shortcut_key);
          keyItem.removeAttribute("key");
        }
        else
        {
          keyItem.setAttribute("key", shortcut_key);
          keyItem.removeAttribute("keycode");
        }

        // Default modifiers is "alt"
        let shortcut_modifiers = Prefs.shortcut_modifiers;
        keyItem.setAttribute("modifiers", shortcut_modifiers);
      }

      if (Prefs.shortcutEnabled)
      {
        keyItem.removeAttribute("disabled");
      }
      else
      {
        keyItem.setAttribute("disabled", "true");
      }
    }
    catch (e)
    {
      Utils.ERROR(e);
    }
  },

  /** Get the IE engine plugin object */
  getContainerPlugin: function(aTab)
  {
    let aBrowser = (aTab ? aTab.linkedBrowser : this.window.gBrowser);
    if (aBrowser && aBrowser.currentURI && Utils.isIEEngine(aBrowser.currentURI.spec))
    {
      return this.getContainerPluginFromBrowser(aBrowser);
    }
    return null;
  },
  
  /** Get the IE engine plugin object */
  getContainerPluginFromBrowser: function(aBrowser)
  {
    if (aBrowser.contentDocument)
    {
      let obj = aBrowser.contentDocument.getElementById(Utils.containerPluginId);
      if (obj)
      {
        return (obj.wrappedJSObject ? obj.wrappedJSObject : obj); // Ref: Safely accessing content DOM from chrome
      }
    }
    return null;
  },

  /** Get the status bar element */
  getStatusBar: function(aTab)
  {
    let aBrowser = (aTab ? aTab.linkedBrowser : this.window.gBrowser);
    if (aBrowser && aBrowser.currentURI && Utils.isIEEngine(aBrowser.currentURI.spec))
    {
      if (aBrowser.contentDocument)
      {
        let obj = aBrowser.contentDocument.getElementById(Utils.statusBarId);
        if (obj)
        {
          return (obj.wrappedJSObject ? obj.wrappedJSObject : obj); // Ref: Safely accessing content DOM from chrome
        }
      }
    }
    return null;
  },

  /** Get current navigation URL with current engine.*/
  getURL: function(aTab)
  {
    let tab = aTab || null;
    let aBrowser = (tab ? tab.linkedBrowser : this.window.gBrowser);
    let url = aBrowser.currentURI.spec;
        
    // Is it an IE engine container url?
    let pluginObject = this.getContainerPlugin(tab);
    let pluginURL = pluginObject ? pluginObject.URL : null;
    if (pluginURL && pluginURL != "")
    {
      url = (/^file:\/\/.*/.test(url) ? encodeURI(Utils.convertToUTF8(pluginURL)) : pluginURL);
      return Utils.fromContainerUrl(url);
    }
    
    return Utils.fromAnyPrefixedUrl(url);
  },


  /**
   *  Get current navigation URI with current engine.
   *  It's of the same function with WindowWrapper#getURL.
   */
  getURI: function(aBrowser)
  {
    try
    {
      let docShell = aBrowser.boxObject.QueryInterface(Ci.nsIBrowserBoxObject).docShell;
      let wNav = docShell.QueryInterface(Ci.nsIWebNavigation);
      if (wNav.currentURI && Utils.isIEEngine(wNav.currentURI.spec))
      {
        let pluginObject = wNav.document.getElementById(Utils.containerPluginId);
        if (pluginObject)
        {
          if (pluginObject.wrappedJSObject) pluginObject = pluginObject.wrappedJSObject;
          let pluginURL = pluginObject.URL;
          if (pluginURL)
          {
            return Utils.makeURI(Utils.containerUrl + encodeURI(pluginURL));
          }
        }
      }
    }
    catch (e)
    {
      Utils.ERROR(e);
    }
    return null;
  },
  
  /** Check whether we should switch back to Firefox engine */
  shouldSwitchBack: function(url)
  {
    return Prefs.autoswitch_enabled && Prefs.autoSwitchBackEnabled && Policy.checkEngineExceptionalRule(url);
  },
  
  /** Check whether current engine is IE.*/
  isIEEngine: function(aTab)
  {
    let tab = aTab || this.window.gBrowser.mCurrentTab;
    let aBrowser = (aTab ? aTab.linkedBrowser : this.window.gBrowser);
    if (aBrowser && aBrowser.currentURI && Utils.isIEEngine(aBrowser.currentURI.spec))
    {
      return true;
    }
    return false;
  },
  
  /** Check whether current page is a switch jumper.*/
  isSwitchJumper: function(aTab)
  {
    let tab = aTab || this.window.gBrowser.mCurrentTab;
    let aBrowser = (aTab ? aTab.linkedBrowser : this.window.gBrowser);
    if (aBrowser && aBrowser.currentURI && Utils.isSwitchJumper(aBrowser.currentURI.spec))
    {
      return true;
    }
    return false;
  },
  
  _addNewTab: function(where, related)
  {
    var gBrowser = this.window.gBrowser;
    // it is highly probable that the new tab is related to current
    let newTab = gBrowser.addTab("about:blank",
      { relatedToCurrent: related === undefined || related });

    let loadInBackground = Utils.shouldLoadInBackground();
    
    switch (where)
    {
    case "window":
      gBrowser.hideTab(newTab);
      Utils.runAsync(function()
      {
        gBrowser.replaceTabWithWindow(newTab);
      });
      break;
    case "current":
      gBrowser.selectedTab = newTab;
      break;
    case "tabshifted":
      loadInBackground = !loadInBackground;
      // fall through
    case "tab":
    default:
      if (!loadInBackground)
        gBrowser.selectedTab = newTab;
      // otherwise, A background tab has been opened, nothing else to do here.
      break;
    }
    
    return newTab;
  },

  /**
   *  Switch the engine of specified tab.
   */
  _switchTabEngine: function(aTab, automatic, overrideUrl)
  {
    if (aTab && aTab.localName == "tab")
    {
      // getURL retrieves the actual URL from, maybe, container url
      let url = overrideUrl || this.getURL(aTab);

      let isIEEngineAfterSwitch = !this.isIEEngine(aTab);

      let unprefixedUrl = url;
      // firefox-only urls can only be handled by firefox(gecko) engine
      if (isIEEngineAfterSwitch && !Utils.isFirefoxOnly(url))
        url = Utils.toContainerUrl(url);
      
      if (!aTab.linkedBrowser || aTab.linkedBrowser.currentURI.spec == url)
        return;

      let browserNode = aTab.linkedBrowser.QueryInterface(Components.interfaces.nsIDOMNode);
      if (browserNode)
      {
        if (!automatic)
        {
          // User manually switch engine.
          // We have to tell ContentPolicy to stop monitoring this tab until user navigates to another website.
          Policy.setManuallySwitched(browserNode, unprefixedUrl);
        }
        else
        {
          // prevent automatic switching on manuallySwitched tabs, until user navigates to another website.
          if (Policy.isManuallySwitched(browserNode, unprefixedUrl))
            return;
        }
      }

      let zoomLevel = this.getZoomLevel(aTab.linkedBrowser);
      Utils.setTabAttributeJSON(aTab, 'zoom', {
        zoomLevel: zoomLevel
      });

      if (isIEEngineAfterSwitch)
      {
        let flags = Ci.nsIWebNavigation.LOAD_FLAGS_STOP_CONTENT;
        aTab.linkedBrowser.loadURIWithFlags(url, flags);
      }
      else
      {
        // Stop loading and hide the IE plugin if we switch to Firefox engine
        let pluginObject = this.getContainerPlugin(aTab);
        if (pluginObject)
        {
          pluginObject.style.visibility = "hidden";
          this.goDoCommand("Stop");
        }

        // Switch to Firefox engine by loading the switch jumper page
        let flags = Ci.nsIWebNavigation.LOAD_FLAGS_STOP_CONTENT;
        if (aTab.linkedBrowser)
          aTab.linkedBrowser.loadURIWithFlags(Utils.toSwitchJumperUrl(url), flags);
      }
      
      if (aTab === this.window.gBrowser.selectedTab)
        this.window.gURLBar.value = url;
      this._updateInterface();
    }
  },
  
  _openInCurrentTab: function(url, isIEEngine)
  {
    if (this.isIEEngine() != isIEEngine)
      this._switchTabEngine(this.window.gBrowser.mCurrentTab, false, url);
    else
    {
      if (isIEEngine && !Utils.isFirefoxOnly(url))
        url = Utils.toContainerUrl(url);
      
      let tab = this.window.gBrowser.mCurrentTab;
      if (tab.linkedBrowser.currentURI.spec == url)
        return;

      // should load actual url after setting the manuallyswitched flag
      this._setManuallySwitchFlag(tab, url);
      
      let flags = Ci.nsIWebNavigation.LOAD_FLAGS_STOP_CONTENT;
      try
      {
        tab.linkedBrowser.loadURIWithFlags(url, flags);
        this.window.gURLBar.value = url;
        this._updateInterface();
      }
      catch (ex) {}
    }
  },
  
  _openInEngine: function(url, isIEEngine, where)
  {
    if (where == "current")
      this._openInCurrentTab(url, isIEEngine);
    else
    {
      let gBrowser = this.window.gBrowser;
      if (isIEEngine && !Utils.isFirefoxOnly(url))
        url = Utils.toContainerUrl(url);

      // should load actual url after setting the manuallyswitched flag
      let newTab = this._addNewTab(where, true);

      // first set manual switch flags
      this._setManuallySwitchFlag(newTab, url);

      // and then load the actual url
      let flags = Ci.nsIWebNavigation.LOAD_FLAGS_STOP_CONTENT;
      try
      {
        if (!isIEEngine)
        {
          // switch back, use the jumper instead
          url = Utils.toSwitchJumperUrl(url);
        }
        newTab.linkedBrowser.loadURIWithFlags(url, flags);
      }
      catch (ex) {}
    }
  },

  /**
   *  Indicate that the tab is manually switched
   *  (i.e. do not do auto switch on this tab)
   *  or not :)
   */
  _setManuallySwitchFlag: function(aTab, url)
  {
    if (aTab.linkedBrowser)
    {
      let browserNode = aTab.linkedBrowser.QueryInterface(Components.interfaces.nsIDOMNode);
      if (browserNode)
      {
        if (Utils.isIEEngine(url)) url = Utils.fromContainerUrl(url);
        // User manually switch engine.
        // We have to tell ContentPolicy to stop monitoring this tab until user navigates another website.
        Policy.setManuallySwitched(browserNode, url);
      }
    }
  },
  
  // Check user-typed URL to get a switchable one, if possible
  _getSwitchableUrl: function()
  {
    let url = this.getURL();
    if (Utils.isFirefoxOnly(url))
    {
      url = this.window.gURLBar.value;
      if (Utils.isFirefoxOnly(url) || !Utils.isValidUrl(url))
        return null;
    }
    return url;
  },

  /** Switch the specified tab's engine, or current tab's engine if tab is not provided*/
  /** If the switch is not initiated by the user, use automatic = true */
  /** Override new url by providing the 3rd argument */
  switchEngine: function(tab, automatic, overrideUrl)
  {
    // Switch engine on current tab, must check user-typed URL
    if (!overrideUrl && (!tab || tab === this.window.gBrowser.mCurrentTab))
    {
      let url = this._getSwitchableUrl();
      if (!url)
        return;
      overrideUrl = url;
    }
    this._switchTabEngine(tab || this.window.gBrowser.mCurrentTab, automatic, overrideUrl);
  },

  /** Show the options dialog */
  openOptionsDialog: function(url)
  {
    if (!url) url = this.getURL();
    let wnd = Services.wm.getMostRecentWindow("fireie:options");
    if (wnd) wnd.focus();
    else this.window.openDialog("chrome://fireie/content/options2.xul", "fireieOptionsDialog", "chrome,titlebar,toolbar,centerscreen,dialog=yes", Utils.getHostname(url));
  },

  /** Show the rules dialog */
  openRulesDialog: function(url)
  {
    Utils.openRulesDialog();
  },

  /**
   * Show IE's Internet Properties dialog.
   * ShellExecuteW(NULL, "open", "rundll32.exe", "shell32.dll,Control_RunDLL inetcpl.cpl", "", SW_SHOW);
   */
  openInternetPropertiesDialog: function()
  {
    /**
     * http://forums.mozillazine.org/viewtopic.php?f=23&t=2059667
     * anfilat2: 
     * ctypes.winapi_abi works in Firefox 32bit version only and it don't works in
     * 64bit.
     */
    let WinABI = ctypes.winapi_abi;
    if (ctypes.size_t.size == 8)
    {
      WinABI = ctypes.default_abi;
    }
    try
    {

      let lib = ctypes.open("shell32.dll");
      const SW_SHOW = 5;
      const NULL = 0;
      let ShellExecuteW = lib.declare("ShellExecuteW", WinABI, ctypes.int32_t, /* HINSTANCE (return) */
      ctypes.int32_t, /* HWND hwnd */
      ctypes.jschar.ptr, /* LPCTSTR lpOperation */
      ctypes.jschar.ptr, /* LPCTSTR lpFile */
      ctypes.jschar.ptr, /* LPCTSTR lpParameters */
      ctypes.jschar.ptr, /* LPCTSTR lpDirectory */
      ctypes.int32_t /* int nShowCmd */ );
      ShellExecuteW(NULL, "open", "rundll32.exe", "shell32.dll,Control_RunDLL inetcpl.cpl", "", SW_SHOW);
      lib.close();
    }
    catch (e)
    {
      Utils.ERROR(e);
    }
  },
  
  openInIE: function()
  {
    var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
    file.initWithPath(Utils.iePath);
    if (!file.exists()) {
      Utils.ERROR("Cannot launch IE, file not found: " + Utils.iePath);
      return;
    }
    var process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
    try {
      var url = this.getURL();
      // file:// urls should be decoded, otherwise IE won't recognize
      if (/^file:\/\/.*/.test(url))
        url = decodeURI(url);
      var args = [url];
      process.init(file);
      // Use runw to pass utf-16 arguments (for file:// URIs, specifically)
      process.runw(false, args, args.length);
    }
    catch (ex) {
      Utils.ERROR("Cannot launch IE, process creation failed: " + Utils.iePath);
    }
  },

  getHandledURL: function(url, isModeIE)
  {
    url = url.trim();

    // When accessing firefox-only urls, only allow firefox(gecko) engine
    if (Utils.isFirefoxOnly(url))
    {
      return url;
    }

    if (isModeIE) return Utils.toContainerUrl(url);

    if (this.isIEEngine() && !Utils.startsWith(url, "about:"))
    {
      if (Utils.isValidUrl(url) || Utils.isValidDomainName(url))
      {
        let originalURL = this.getURL();
        let isBlank = (originalURL == "about:blank");
        let handleUrlBar = Prefs.handleUrlBar;
        let isSimilar = Utils.getEffectiveHost(originalURL) == Utils.getEffectiveHost(url);
        if (isBlank || handleUrlBar || isSimilar) return Utils.toContainerUrl(url);
      }
    }

    return url;
  },

  _updateProgressStatus: function()
  {
    let mTabs = this.window.gBrowser.mTabContainer.childNodes;
    for (let i = 0; i < mTabs.length; i++)
    {
      if (mTabs[i].localName == "tab")
      {
        let pluginObject = this.getContainerPlugin(mTabs[i]);
        if (pluginObject)
        {
          let aCurTotalProgress = pluginObject.Progress;
          if (aCurTotalProgress != mTabs[i].mProgress)
          {
            const wpl = Ci.nsIWebProgressListener;
            let aMaxTotalProgress = (aCurTotalProgress == -1 ? -1 : 100);
            let aTabListener = this.window.gBrowser.mTabListeners[mTabs[i]._tPos];
            let aWebProgress = mTabs[i].linkedBrowser.webProgress;
            let aRequest = Services.io.newChannelFromURI(mTabs[i].linkedBrowser.currentURI);
            let aStateFlags = (aCurTotalProgress == -1 ? wpl.STATE_STOP : wpl.STATE_START) | wpl.STATE_IS_NETWORK;
            aTabListener.onStateChange(aWebProgress, aRequest, aStateFlags, 0);
            aTabListener.onProgressChange(aWebProgress, aRequest, 0, 0, aCurTotalProgress, aMaxTotalProgress);
            mTabs[i].mProgress = aCurTotalProgress;
          }
        }
      }
    }
  },
  
  _focusPlugin: function()
  {
    let plugin = this.getContainerPlugin();
    // Don't call the SPO method Focus! Instead, let the focus handler do the trick.
    if (plugin)
      plugin.focus();
  },
  
  /** Focus current content plugin after a specific delay */
  _delayedFocusPlugin: function()
  {
    // Schedules calls to the _focusPlugin function
    if (this._delayedFocusPluginTimer)
      Utils.cancelAsyncTimeout(this._delayedFocusPluginTimer);
    this._delayedFocusPluginTimer = Utils.runAsyncTimeout(function()
    {
      this._focusPlugin();
      this._delayedFocusPluginTimer = null;
    }, this, 100);
  },
  
  /** Handler for IE content plugin init event */
  _onIEContentPluginInitialized: function(event)
  {
    let plugin = event.target;
    
    // Check if the tab is currently selected
    let tab = Utils.getTabFromDocument(plugin.ownerDocument);
    if (tab === this.window.gBrowser.selectedTab)
    {
      // Focus the plugin after its creation
      this._delayedFocusPlugin();
    }
  },

  /** Handler for IE progress change event */
  _onIEProgressChange: function(event)
  {
    if (!this._checkEventOrigin(event)) return;
    
    let progress = parseInt(event.detail, 10);
    if (progress == 0) this.window.gBrowser.userTypedValue = null;
    this._updateProgressStatus();
    if (progress >= 100 || progress == -1)
      this._updateInterface();
  },

  /** Handler for IE new tab event*/
  _onIENewTab: function(event)
  {
    if (!this._checkEventOrigin(event)) return;
    
    let data = JSON.parse(event.detail);
    let url = data.url;
    let id = data.id;

    let shift = data.shift;
    let ctrl = data.ctrl;
    // shift  ctrl  value  where
    //    0     0     0    current
    //    0     1     1    tab
    //    1     0     2    window
    //    1     1     3    tabshifted
    let where = shift ? (ctrl ? "tabshifted" : "window") : (ctrl ? "tab" : "current");

    let newTab = this._addNewTab(where, true);
    
    let param = {
      id: id
    };
    Utils.setTabAttributeJSON(newTab, "fireieNavigateParams", param);
    
    // load URI outside of addTab() to supress potential load error message caused by switch back
    let flags = Ci.nsIWebNavigation.LOAD_FLAGS_STOP_CONTENT;
    try
    {
      newTab.linkedBrowser.loadURIWithFlags(Utils.toContainerUrl(url), flags);
    }
    catch (ex) {}
  },

  _onIESetSecureLockIcon: function(event)
  {
    this.checkIdentity();
  },
  /**
   * Sets the secure info icon
   */
  _setSecureLockIcon: function(info)
  {
    let self = this.gIdentityHandler;
    if (!self || !self._identityBox) return;

    let classname = null;
    let tooltip = "";
    let icon_label = "";
    switch (info)
    {
    case "Unsecure":
      classname = self.IDENTITY_MODE_UNKNOWN;
      tooltip = Utils.getString("fireie.security.notEntrypted");
      break;
    case "Mixed":
      classname = self.IDENTITY_MODE_MIXED_CONTENT;
      tooltip = Utils.getString("fireie.security.partiallyEncrypted");
      break;
    default:
      classname = self.IDENTITY_MODE_DOMAIN_VERIFIED;
      tooltip = Utils.getString("fireie.security.encrypted");
      switch (info)
      {
      case "Secure40Bit":
        tooltip += "40 " + Utils.getString("fireie.security.encryption.bit");
        break;
      case "Secure56Bit":
        tooltip += "56 " + Utils.getString("fireie.security.encryption.bit");
        break;
      case "Secure128Bit":
        tooltip += "128 " + Utils.getString("fireie.security.encryption.bit");
        break;
      case "SecureFortezza":
        tooltip += "Fortezza";
        break;
      default:
        tooltip += Utils.getString("fireie.security.encryption.unknown");
        break;
      }
      icon_label = this.getEffectiveHost();
      break;
    }

    let identityBox = self._identityBox;
    let identityIconLabel = self._identityIconLabel;
    let identityIconCountryLabel = self._identityIconCountryLabel;

    identityBox.className = classname;
    identityBox.tooltipText = tooltip;
    // Firefox 14+ uses a new site identity UI,
    // we should not attempt to set the identity label
    // as it's only for Extended Validation
    if (Utils.firefoxMajorVersion < 14) {
      identityIconLabel.value = icon_label;
      identityIconCountryLabel.value = "";
      identityIconLabel.crop = "center";
      identityIconLabel.parentNode.style.direction = "ltr";
      identityIconLabel.parentNode.collapsed = icon_label ? false : true;
    } else {
      identityIconLabel.parentNode.collapsed = true;
    }

    self._mode = classname;
  },

  /**
   * Sets the status text (for XP/2003 only)
   */
  _onIEStatusChanged: function(event)
  {
    this.updateIEStatusText();
  },

  updateIEStatusText: function()
  {
    try
    {
      if (!AppIntegration.shouldShowStatusOurselves()) return;
      
      let pluginObject = this.getContainerPlugin();
      if (!pluginObject) return;
      
      let statusBar = this.getStatusBar();
      if (!statusBar) return;
      
      if (Prefs.showStatusText)
      {
        let event = this.window.gBrowser.contentDocument.createEvent("DataContainerEvent");
        event.initEvent("SetStatusText", false, false);
        event.setData("statusText", pluginObject.StatusText);
        event.setData("preventFlash", AppIntegration.shouldPreventStatusFlash());
        statusBar.dispatchEvent(event);
      }
      else if (!statusBar.hidden && !Prefs.showStatusText)
      {
        // event to notify content doc to hide status text
        let event = this.window.gBrowser.contentDocument.createEvent("DataContainerEvent");
        event.initEvent("SetStatusText", false, false);
        event.setData("statusText", "");
        event.setData("preventFlash", AppIntegration.shouldPreventStatusFlash());
        statusBar.dispatchEvent(event);
      }
    }
    catch (ex)
    {
      Utils.ERROR("updateIEStatusText: " + ex);
    }
  },
  
  /**
   * Handles 'IESetCookie' event receiving from the plugin.
   * Here we have context information, which differs from UtilsPluginManager's handler.
   */
  _onIESetCookie: function(event)
  {
    let subject = this.window;
    let topic = "fireie-set-cookie";
    let data = event.detail;
    Services.obs.notifyObservers(subject, topic, data);
  },
  
  /**
   * Handles 'IEBatchSetCookie' event receiving from the plugin.
   * Here we have context information, which differs from UtilsPluginManager's handler.
   */
  _onIEBatchSetCookie: function(event)
  {
    let subject = this.window;
    let topic = "fireie-batch-set-cookie";
    let data = JSON.stringify(JSON.parse(event.detail).cookies);
    Services.obs.notifyObservers(subject, topic, data);
  },

  // do not allow intalling themes on sites other than fireie.org
  _checkThemeSite: function(node)
  {
    if (!node) return false;
    let doc = node.ownerDocument;
    if (!doc) return false;
    let url = doc.location.href;
    let host = Utils.getEffectiveHost(url);
    let allow = JSON.parse(Prefs.allowedThemeHosts).some(function(h) h == host);
    if (!allow) Utils.LOG("Blocked theme request: untrusted site (" + host + ")");
    return allow;
  },

  /**
   * Install the theme specified by a web page via a InstallBrowserTheme event.
   *
   * @param event   {Event}
   *        the InstallBrowserTheme DOM event
   */
  _onInstallTheme: function(event)
  {
    // Get the theme data from the DOM node target of the event.
    let node = event.target;
    
    if (!this._checkThemeSite(node)) return;
    
    let themeData = this._getThemeDataFromNode(node);

    if (themeData != null)
    {
      LightweightTheme.installTheme(themeData);
    }
  },

  /**
   * Get the theme data from node attribute of 'data-fireietheme'.
   * @returns {object} JSON object of the theme data if succeeded. Otherwise returns null.
   */
  _getThemeDataFromNode: function(node)
  {
    let defValue = null;
    if (!node.hasAttribute("data-fireietheme")) return defValue;
    let themeData = defValue;
    try
    {
      themeData = JSON.parse(node.getAttribute("data-fireietheme"));
    }
    catch (e)
    {
      Utils.ERROR(e);
      return defValue;
    }
    return themeData;
  },

  /**
   * Preview the theme specified by a web page via a PreviewBrowserTheme event.
   *
   * @param   event   {Event}
   *          the PreviewBrowserTheme DOM event
   */
  _onPreviewTheme: function(event)
  {
    // Get the theme data from the DOM node target of the event.
    let node = event.target;

    if (!this._checkThemeSite(node)) return;
    
    let themeData = this._getThemeDataFromNode(node);
    if (themeData != null)
    {
      this._applyTheme(themeData);
    }
  },

  /**
   * Reset the theme as specified by a web page via a ResetBrowserThemePreview event.
   *
   * @param event   {Event}
   *        the ResetBrowserThemePreview DOM event
   */
  _onResetThemePreview: function(event)
  {
    if (!this._checkThemeSite(event.target)) return;
    this._applyTheme(LightweightTheme.currentTheme);
  },

  /**
   * Reset to default theme.
   */
  changeToDefaultTheme: function()
  {
    LightweightTheme.changeToDefaultTheme();
  },

  /**
   * Change the appearance specified by the theme data
   */
  _applyTheme: function(themeData)
  {
    if (themeData.id == LightweightTheme.appliedThemeId)
      return;
      
    // Style URL bar engie button
    let urlbarButton = this.E("fireie-urlbar-switch");

    // Cache theme icon URLs to URL bar button attributes
    let images = LightweightTheme.getThemeImages(themeData);
    if (images && images.fxURL && images.ieURL)
    {
      urlbarButton.setAttribute("fx-icon-url", images.fxURL);
      urlbarButton.setAttribute("ie-icon-url", images.ieURL);
    }
    
    LightweightTheme.setAppliedTheme({
      id: themeData.id,
      fxURL: images.fxURL,
      ieURL: images.ieURL,
      textcolor: themeData.textcolor
    });

    // Style the text color.
    let urlbarButtonLabel = this.E("fireie-urlbar-switch-label");
    if (themeData.textcolor)
    {
      urlbarButtonLabel.style.color = themeData.textcolor;
    }
    else
    {
      urlbarButtonLabel.style.color = "";
    }

    this._updateInterface();
    this.updateFavicons();
  },

  // whether we should handle textbox commands, e.g. cmd_paste
  _shouldHandleTextboxCommand: function()
  {
    let focused = this.window.document.commandDispatcher.focusedElement;
    if (focused == null) return true;
    let localName = focused.localName.toLowerCase();
    return localName != "input" && localName != "textarea";
  },
  /** Generate a method that calls plugin functions according to the given command */
  _genDoPluginCommandFunc: function(funcName, commands, successCallback)
  {
    this[funcName] = function(cmd)
    {
      try
      {
        let pluginObject = this.getContainerPlugin();
        if (pluginObject == null)
        {
          return false;
        }
        let func = commands[cmd];
        if (func)
        {
          let ret = func.call(this, pluginObject);
          if (successCallback && ret)
          {
            successCallback.call(this);
          }
          return ret;
        }
        else return false;
      }
      catch (ex)
      {
        Utils.ERROR(funcName + "(" + cmd + "): " + ex);
        return false;
      }
    };
  },
  /** calls plugin methods */
  goDoCommand: function(cmd)
  {
    let funcName = "goDoCommand";
    this._genDoPluginCommandFunc(funcName,
    {
      "Back": function(pluginObject)
      {
        if (!pluginObject.CanBack)
        {
          return false;
        }
        pluginObject.Back();
        return true;
      },
      "Forward": function(pluginObject)
      {
        if (!pluginObject.CanForward)
        {
          return false;
        }
        pluginObject.Forward();
        return true;
      },
      "Stop": function(pluginObject)
      {
        pluginObject.Stop();
        return true;
      },
      "Refresh": function(pluginObject)
      {
        pluginObject.Refresh();
        return true;
      },
      "SaveAs": function(pluginObject)
      {
        pluginObject.SaveAs();
        return true;
      },
      "Print": function(pluginObject)
      {
        pluginObject.Print();
        return true;
      },
      "PrintSetup": function(pluginObject)
      {
        pluginObject.PrintSetup();
        return true;
      },
      "PrintPreview": function(pluginObject)
      {
        pluginObject.PrintPreview();
        return true;
      },
      "Find": function(pluginObject)
      {
        pluginObject.Find();
        return true;
      },
      "cmd_cut": function(pluginObject)
      {
        if (!this._shouldHandleTextboxCommand())
          return false;
        pluginObject.Cut();
        return true;
      },
      "cmd_copy": function(pluginObject)
      {
        if (!this._shouldHandleTextboxCommand())
          return false;
        pluginObject.Copy();
        return true;
      },
      "cmd_paste": function(pluginObject)
      {
        if (!this._shouldHandleTextboxCommand())
          return false;
        pluginObject.Paste();
        return true;
      },
      "cmd_selectAll": function(pluginObject)
      {
        if (!this._shouldHandleTextboxCommand())
          return false;
        pluginObject.SelectAll();
        return true;
      },
      "cmd_undo": function(pluginObject)
      {
        if (!this._shouldHandleTextboxCommand())
          return false;
        pluginObject.Undo();
        return true;
      },
      "cmd_redo": function(pluginObject)
      {
        if (!this._shouldHandleTextboxCommand())
          return false;
        pluginObject.Redo();
        return true;
      },
      "cmd_scrollTop": function(pluginObject)
      {
        pluginObject.ScrollTop();
        return true;
      },
      "cmd_scrollBottom": function(pluginObject)
      {
        pluginObject.ScrollBottom();
        return true;
      },
      "cmd_scrollPageUp" : function(pluginObject)
      {
        pluginObject.PageUp();
        return true;
      },
      "cmd_scrollPageDown" : function(pluginObject)
      {
        pluginObject.PageDown();
        return true;
      },
      "cmd_scrollLineUp" : function(pluginObject)
      {
        pluginObject.LineUp();
        return true;
      },
      "cmd_scrollLineDown" : function(pluginObject)
      {
        pluginObject.LineDown();
        return true;
      },
      "Focus": function(pluginObject)
      {
        pluginObject.Focus();
        return true;
      },
      "HandOverFocus": function(pluginObject)
      {
        pluginObject.HandOverFocus();
        return true;
      },
      "Zoom": function(pluginObject)
      {
        let zoomLevel = this.getZoomLevel();
        pluginObject.Zoom(zoomLevel);
        return true;
      },
      "DisplaySecurityInfo": function(pluginObject)
      {
        pluginObject.DisplaySecurityInfo();
        return true;
      },
      "ViewPageSource": function(pluginObject)
      {
        pluginObject.ViewPageSource();
        return true;
      },
      "FindAgain": function(pluginObject)
      {
        pluginObject.FBFindAgain();
        return true;
      },
      "FindPrevious": function(pluginObject)
      {
        pluginObject.FBFindPrevious();
        return true;
      },
      "ToggleHighlightOn": function(pluginObject)
      {
        pluginObject.FBToggleHighlight(true);
        return true;
      },
      "ToggleHighlightOff": function(pluginObject)
      {
        pluginObject.FBToggleHighlight(false);
        return true;
      },
      "ToggleCaseOn": function(pluginObject)
      {
        pluginObject.FBToggleCase(true);
        return true;
      },
      "ToggleCaseOff": function(pluginObject)
      {
        pluginObject.FBToggleCase(false);
        return true;
      },
      "PageUp": function(pluginObject)
      {
        pluginObject.PageUp();
        return true;
      },
      "PageDown": function(pluginObject)
      {
        pluginObject.PageDown();
        return true;
      },
      "LineUp": function(pluginObject)
      {
        pluginObject.LineUp();
        return true;
      },
      "LineDown": function(pluginObject)
      {
        pluginObject.LineDown();
        return true;
      }
    },
    this._updateInterface);
    return this[funcName](cmd);
  },

  /* FireGestures commands */
  goDoFGCommand: function(cmd)
  {
    let funcName = "goDoFGCommand";
    this._genDoPluginCommandFunc(funcName,
    {
      "FireGestures:ScrollTop": function(pluginObject)
      {
        pluginObject.ScrollTop();
        pluginObject.Focus();
        return true;
      },
      "FireGestures:ScrollBottom": function(pluginObject)
      {
        pluginObject.ScrollBottom();
        pluginObject.Focus();
        return true;
      },
      "FireGestures:ScrollPageUp": function(pluginObject)
      {
        pluginObject.PageUp();
        pluginObject.Focus();
        return true;
      },
      "FireGestures:ScrollPageDown": function(pluginObject)
      {
        pluginObject.PageDown();
        pluginObject.Focus();
        return true;
      }
    },
    this._updateInterface);
    return this[funcName](cmd);
  },
  /* MouseGesturesRedox commands */
  goDoMGRCommand: function(cmd)
  {
    let funcName = "goDoMGRCommand";
    this._genDoPluginCommandFunc(funcName,
    {
      "mgW_ScrollUp": function(pluginObject)
      {
        pluginObject.PageUp();
        pluginObject.Focus();
        return true;
      },
      "mgW_ScrollDown": function(pluginObject)
      {
        pluginObject.PageDown();
        pluginObject.Focus();
        return true;
      },
      "mgW_ScrollLeft": function(pluginObject)
      {
        pluginObject.ScrollLeft();
        pluginObject.Focus();
        return true;
      },
      "mgW_ScrollRight": function(pluginObject)
      {
        pluginObject.ScrollRight();
        pluginObject.Focus();
        return true;
      }
    },
    this._updateInterface);
    return this[funcName](cmd);
  },
  /* All-in-One Gestrues commands */
  goDoAiOGCommand: function(cmd, args)
  {
    try
    {
      let pluginObject = this.getContainerPlugin();
      if (pluginObject == null)
      {
        return false;
      }
      switch (cmd)
      {
      case "vscroll":
        if (args[0])
        {
          if (args[1] > 0)
            pluginObject.PageDown();
          else if (args[1] < 0)
            pluginObject.PageUp();
        }
        else
        {
          if (args[1] > 0)
            pluginObject.ScrollBottom();
          else
            pluginObject.ScrollTop();
        }
        pluginObject.Focus();
        break;
      default:
        return false;
      }
    }
    catch (ex)
    {
      Utils.ERROR("goDoAiOGCommand(" + cmd + "): " + ex);
      return false;
    }
    this._updateInterface();
    return true;
  },
  /* called when original findbar issues a find */
  findText: function(text)
  {
    try
    {
      let pluginObject = this.getContainerPlugin();
      if (pluginObject == null)
      {
        return false;
      }
      pluginObject.FBFindText(text);
      return true;
    }
    catch (ex)
    {
      Utils.ERROR("findText(" + text + "): " + ex);
      return false;
    }
  },
  /* called when find bar is closed */
  endFindText: function()
  {
    try
    {
      let pluginObject = this.getContainerPlugin();
      if (pluginObject == null)
      {
        return false;
      }
      pluginObject.FBEndFindText();
      return true;
    }
    catch (ex)
    {
      Utils.ERROR("endFindText(): " + ex);
      return false;
    }
  },
/* since plugin find state may not sync with firefox, we 
  transfer those params to the plugin object after user brings up
  the find bar */
  setFindParams: function(text, highlight, cases)
  {
    try
    {
      let pluginObject = this.getContainerPlugin();
      if (pluginObject == null)
      {
        return false;
      }
      pluginObject.FBToggleCase(cases);
      pluginObject.FBToggleHighlight(highlight);
      pluginObject.FBSetFindText(text);
      return true;
    }
    catch (ex)
    {
      Utils.ERROR("setFindParams(): " + ex);
      return false;
    }
  },
  setFindText: function(text)
  {
    try
    {
      let pluginObject = this.getContainerPlugin();
      if (pluginObject == null)
      {
        return false;
      }
      pluginObject.FBSetFindText(text);
      return true;
    }
    catch (ex)
    {
      Utils.ERROR("setFindText(): " + ex);
      return false;
    }
  },
  updateFindBarUI: function(findbar)
  {
    try
    {
      let pluginObject = this.getContainerPlugin();
      if (pluginObject == null)
      {
        return false;
      }
      if (findbar._findMode != findbar.FIND_NORMAL)
        findbar._setFindCloseTimeout();
      let text = findbar.getElement('findbar-textbox').value;
      findbar._enableFindButtons(text.length != 0);
      if (text.length == 0)
      {
        findbar._updateStatusUI(findbar.nsITypeAheadFind.FIND_FOUND);
        return true;
      }
      let status = pluginObject.FBLastFindStatus;
      switch (status)
      {
      case "notfound":
        if (findbar.hidden) // should bring up findbar if not found
          findbar.startFind();
        findbar._updateStatusUI(findbar.nsITypeAheadFind.FIND_NOTFOUND);
        break;
      case "found":
        findbar._updateStatusUI(findbar.nsITypeAheadFind.FIND_FOUND);
        break;
      case "crosshead":
        findbar._updateStatusUI(findbar.nsITypeAheadFind.FIND_WRAPPED, true);
        break;
      case "crosstail":
        findbar._updateStatusUI(findbar.nsITypeAheadFind.FIND_WRAPPED, false);
        break;
      }
      return true;
    }
    catch (ex)
    {
      Utils.ERROR("updateFindBarUI(): " + ex);
      return false;
    }
  },
  resetFindBarUI: function(findbar)
  {
    try
    {
      let pluginObject = this.getContainerPlugin();
      if (pluginObject == null)
      {
        return false;
      }
      let text = findbar.getElement('findbar-textbox').value;
      findbar._enableFindButtons(text.length != 0);
      findbar._updateStatusUI(findbar.nsITypeAheadFind.FIND_FOUND);
      return true;
    }
    catch (ex)
    {
      Utils.ERROR("resetFindBarUI(): " + ex);
      return false;
    }
  },
  // extract selection text from plugin object
  getSelectionText: function(selectionMaxLen, rawWhitespace)
  {
    try
    {
      let pluginObject = this.getContainerPlugin();

      if (pluginObject == null)
      {
        return null;
      }
      var selText = pluginObject.SelectionText;
      if (selText && selText.length > 0)
      {
        // selections of more than 1000 characters aren't useful
        const kMaxSelectionLen = 1000;
        const charLen = Math.min(selectionMaxLen || kMaxSelectionLen, kMaxSelectionLen);

        // Process our text to get rid of unwanted characters
        if (selText.length > charLen)
        {
          var pattern = new RegExp("^(?:\\s*.){0," + charLen + "}");
          pattern.test(selText);
          selText = RegExp.lastMatch;
        }
        if (rawWhitespace)
          return selText.substr(0, charLen);
        else
          return selText.replace(/^\s+/, "").replace(/\s+$/, "").replace(/\s+/g, " ").substr(0, charLen);
      }
      else
      {
        return "";
      }
    }
    catch (ex)
    {
      Utils.ERROR("getSelectionText(): " + ex);
      return null;
    }
  },
  checkIdentity: function()
  {
    try
    {
      if (this.isSwitchJumper())
      {
        this._setSecureLockIcon("Unsecure");
        return true;
      }
      
      let pluginObject = this.getContainerPlugin();
      if (pluginObject == null)
      {
        return false;
      }
      this._setSecureLockIcon(pluginObject.SecureLockInfo);
      return true;
    }
    catch (ex)
    {
      Utils.ERROR("checkIdentity(): " + ex);
      return false;
    }
  },
  getEffectiveHost: function()
  {
    try
    {
      let pluginObject = this.getContainerPlugin();
      if (pluginObject == null)
      {
        return null;
      }
      let url = pluginObject.URL;
      return Utils.getEffectiveHost(url);
    }
    catch (ex)
    {
      Utils.ERROR("getEffectiveHost(): " + ex);
      return null;
    }
  },
  getIdentityData: function()
  {
    try
    {
      let pluginObject = this.getContainerPlugin();
      if (pluginObject == null)
      {
        return null;
      }
      throw "Not Implemented";
    }
    catch (ex)
    {
      Utils.ERROR("getIdentityData(): " + ex);
      return null;
    }
  },
  toggleAutoSwitch: function()
  {
    Prefs.autoswitch_enabled = !Prefs.autoswitch_enabled;
    this.setAutoSwitchMenuItem();
  },
  setAutoSwitchMenuItem: function()
  {
    this.E("fireie-menu-item-autoswitch-disabled").setAttribute("checked", !Prefs.autoswitch_enabled);
  },
  fireAfterInit: function(callback, self, args)
  {
    UtilsPluginManager.fireAfterInit(callback, self, args);
  },
  // Handler for click event on engine switch button
  clickSwitchButton: function(e)
  {
    if (e.button == 2)
    {
      this.E("fireie-switch-button-context-menu").openPopup(e.target, "after_start", 0, 0, true, false);
    }
    else
    {
      // Must check user-typed URL
      let url = this._getSwitchableUrl();
      if (!url)
        return;

      // switch behavior similar to the reload button
      let where = this.window.whereToOpenLink(e, false, true);
      this._openInEngine(url, !this.isIEEngine(), where);
    }
    
    e.preventDefault();
    e.stopPropagation();
  },
  
  // process click events inside the URL bar (mainly to stop propagation
  // in order to resolve multiple-caret problems)
  _onClickInsideURLBar: function(e)
  {
    let pluginObject = this.getContainerPlugin();
    if (pluginObject != null)
    {
      e.stopPropagation();
      // the focus handler does window focus transfer for us (do not call Focus!!)
      pluginObject.focus();
    }
  },

  _onTabSelected: function(e)
  {
    this._updateInterface();
    // Focus the content plugin on TabSelect
    this._delayedFocusPlugin();
  },
  
  _shouldHandleDrop: function(e)
  {
    let dt = e.dataTransfer;
    let mozUrl = dt.getData("text/x-moz-url");
    if (mozUrl)
    {
      let urls = mozUrl.split("\n");
      for (let i = 0; i < urls.length; i += 2)
      {
        let url = urls[i];
        if (Utils.isValidUrl(url) && !Utils.isFirefoxOnly(url))
          return true;
      }
    }
    let uriList = dt.getData("text/uri-list");
    if (uriList)
    {
      let urls = uriList.split("\n");
      for (let i = 0; i < urls.length; i++)
      {
        let url = urls[i].trim();
        if (url[0] != "#" && Utils.isValidUrl(url) && !Utils.isFirefoxOnly(url))
          return true;
      }
    }
    let text = dt.getData("text/plain");
    if (text)
    {
      let urls = text.split("\n");
      for (let i = 0, l = urls.length; i < l; i++)
      {
        let url = urls[i].trim();
        if (Utils.isValidUrl(url) && !Utils.isFirefoxOnly(url))
          return true;
      }
    }
    return false;
  },
  
  _getDropUrls: function(e)
  {
    let out = [];
    let dt = e.dataTransfer;
    let mozUrl = dt.getData("text/x-moz-url");
    if (mozUrl)
    {
      let urls = mozUrl.split("\n");
      for (let i = 0, l = urls.length; i < l; i += 2)
      {
        let url = urls[i].trim();
        if (Utils.isValidUrl(url) && !Utils.isFirefoxOnly(url))
          out.push(url);
      }
      return out;
    }
    let uriList = dt.getData("text/uri-list");
    if (uriList)
    {
      let urls = uriList.split("\n");
      for (let i = 0, l = urls.length; i < l; i++)
      {
        let url = urls[i].trim();
        if (url[0] != "#" && Utils.isValidUrl(url) && !Utils.isFirefoxOnly(url))
          out.push(url);
      }
      return out;
    }
    let text = dt.getData("text/plain");
    if (text)
    {
      let urls = text.split("\n");
      for (let i = 0, l = urls.length; i < l; i++)
      {
        let url = urls[i].trim();
        if (Utils.isValidUrl(url) && !Utils.isFirefoxOnly(url))
          out.push(url);
      }
      return out;
    }
    return out;
  },

  onDragOver: function(e)
  {
    if (this._shouldHandleDrop(e))
    {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  },
  
  _openDropUrl: function(url, isIEEngine, where)
  {
    try
    {
      this.window.urlSecurityCheck(url,
        this.window.gBrowser.contentPrincipal,
        Ci.nsIScriptSecurityManager.DISALLOW_INHERIT_PRINCIPAL);
    }
    catch (ex)
    {
      Utils.LOG("[Drag'n'Drop] Security check for URL failed: " + url + "\n" + ex);
      return;
    }
    this._openInEngine(url, isIEEngine, where);
  },
  
  onDrop: function(e)
  {
    let urls = this._getDropUrls(e);
    if (urls.length)
    {
      e.stopImmediatePropagation();
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      
      let where = Utils.shouldLoadInBackground() ? "tab" : "tabshifted";
      let isIEEngine = true;

      for (let i = 0, l = urls.length; i < l; i++)
      {
        // Add http:// if not present
        let url = Utils.makeURI(urls[i]).spec;
        this._openDropUrl(url, isIEEngine, where);
      }
    }
  },

  /**
   * Since IE don't support Text-Only Zoom, consider only Full Zoom
   */
  getZoomLevel: function(aBrowser)
  {
    let browser = aBrowser || this.window.gBrowser.selectedBrowser
    let docViewer = browser.markupDocumentViewer;
    let zoomLevel = docViewer.fullZoom;
    return zoomLevel;
  },

  /**
   * Since IE don't support Text-Only Zoom, consider only Full Zoom
   */
  _setZoomLevel: function(value, aBrowser)
  {
    let browser = aBrowser || this.window.gBrowser.selectedBrowser;
    let docViewer = browser.markupDocumentViewer;
    docViewer.fullZoom = value;
  },

  /** Update interface on IE page show/load */
  _onPageShowOrLoad: function(e)
  {
    this._updateInterface();

    let doc = e.originalTarget;
    
    // e.originalTarget may not always be a HTMLDocument
    if (!doc.defaultView) return;

    let tab = Utils.getTabFromDocument(doc);
    if (!tab) return;

    let url = doc.defaultView.location.href;
    if (url == "about:blank" || Utils.isSwitchJumper(url))
    {
      // might be the switch jumper from IE to FF, ignore zooming on this page
      return;
    }
    
    if (this.isPrivateBrowsing() && Prefs.privatebrowsingwarning && !this.isResumeFromPBW()
      && this.isIEEngine(tab) && !this.getContainerPlugin(tab))
    {
      // should be the private browsing warning page, ignore zooming
      return;
    }
    
    //
    // Check if we have to set ZoomLevel
    //  
    let zoomLevelParams = Utils.getTabAttributeJSON(tab, 'zoom');
    if (zoomLevelParams)
    {
      this._setZoomLevel(zoomLevelParams.zoomLevel, tab.linkedBrowser);
      tab.removeAttribute('zoom');
    }
  },

  /**
   * Handler for the resize event of the window
   */
  _onResize: function(e)
  {
    // Resize may be caused by Zoom
    this.goDoCommand("Zoom");
  },

  _onMouseDown: function(event)
  {
    // Simulate mousedown events to support gesture extensions like FireGuestures
    if (event.originalTarget.id == Utils.containerPluginId)
    {
      if (!this._checkEventOrigin(event)) return;

      let evt = this.window.document.createEvent("MouseEvents");
      evt.initMouseEvent("mousedown", true, true, event.view, event.detail, event.screenX, event.screenY, event.clientX, event.clientY, false, false, false, false, event.button, null);
      let pluginObject = this.getContainerPlugin();
      if (pluginObject)
      {
        event.preventDefault();
        event.stopPropagation();
        let container = pluginObject.parentNode;
        container.dispatchEvent(evt);
      }
    }
  },

  /**
   * Opens report wizard for the current page.
   */
  openReportDialog: function()
  {
  /* TODO: Implement our own
    let wnd = Services.wm.getMostRecentWindow("abp:sendReport");
    if (wnd) wnd.focus();
    else this.window.openDialog("chrome://adblockplus/content/ui/sendReport.xul", "_blank", "chrome,centerscreen,resizable=no", this.window.content, this.getCurrentLocation());
    */
  },

  /**
   * Opens our contribution page.
   */
  openMoreThemesPage: function()
  {
    Utils.loadDocLink("skins");
  },

  /**
   * Opens our contribution page.
   */
  openContributePage: function()
  {
    Utils.loadDocLink("contribute");
  },
  
  /**
   * Update menu items of URL bar icon
   */
  setMenuItems: function()
  {
    this.setAutoSwitchMenuItem();
    EasyRuleCreator.setPopupMenuItems(
      this.CE,
      this.E("fireie-switch-button-context-menu"),
      this.getURL()
    );
    // Hide "open-in-ie" button for firefox-only urls
    this.E("fireie-menu-item-open-in-ie").hidden = Utils.isFirefoxOnly(this.getURL());
  },

  /**
   * Firefox 20 introduced per-window private browsing mode, in which private information that
   * should be stored is accessible concurrently with public information.
   * https://developer.mozilla.org/en-US/docs/Supporting_per-window_private_browsing
   */
  isPrivateBrowsing: function()
  {
    return Prefs.isPrivateBrowsingWindow(this.window);
  },
  
  /**
   * Sets the pbwResume flag
   */
  setResumeFromPBW: function()
  {
    this._pbwResume = true;
  },
  
  /**
   * Returns the pbwResume flag
   */
  isResumeFromPBW: function()
  {
    return this._pbwResume;
  },
  
  /**
   * Clears the pbwResume flag
   */
  clearResumeFromPBW: function()
  {
    this._pbwResume = false;
  }
  
};

/**
 * Updates displayed status for all application windows (on prefs or rules
 * change).
 */
function reloadPrefs()
{
  for each(let wrapper in wrappers)
    wrapper.updateState();
}

/**
 * Updates favicons for all application windows
 */
function updateFavicons()
{
  for each (let wrapper in wrappers)
    wrapper.updateFavicons();
}

/**
 * Executed on first run, adds a rule subscription and notifies that user
 * about that.
 */
function addSubscription()
{
  // Use a one-time pref to determine whether we should add default subscription
  let needAdd = Prefs.subscriptions_defaultAdded ? false : true;
  needAdd = needAdd && RuleStorage.subscriptions.length == 0;
  if (!needAdd) return;
  Prefs.subscriptions_defaultAdded = true;

  function notifyUser()
  {
    let wrapper = (wrappers.length ? wrappers[0] : null);
    if (wrapper && wrapper.addTab)
    {
      wrapper.addTab("chrome://fireie/content/firstRun.xul");
    }
    else
    {
      Services.ww.openWindow(wrapper ? wrapper.window : null, "chrome://fireie/content/firstRun.xul", "_blank", "chrome,centerscreen,dialog", null);
    }
  }

  // Load subscriptions data
  let request = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIJSXMLHttpRequest);
  request.open("GET", "chrome://fireie/content/subscriptions.xml");
  request.addEventListener("load", function()
  {
    let node = Utils.chooseRuleSubscription(request.responseXML.getElementsByTagName("subscription"));
    let subscription = (node ? Subscription.fromURL(node.getAttribute("url")) : null);
    if (subscription)
    {
      RuleStorage.addSubscription(subscription);
      subscription.disabled = false;
      subscription.title = node.getAttribute("title");
      subscription.homepage = node.getAttribute("homepage");
      if (subscription instanceof DownloadableSubscription && !subscription.lastDownload) Synchronizer.execute(subscription);

      notifyUser();
    }
  }, false);
  request.send();

}

/**
 * Ensures that rule cache file is refreshed after version upgrade
 */
function refreshRuleCache()
{
  Rule.fromText("!dummy"); // work against trapProperty
  RuleStorage.loadFromDisk();
  RuleStorage.saveToDisk();
}

/**
 * nsIWebProgressListener implementation
 * @constructor
 */
function ProgressListener(windowWrapper) {
  this.windowWrapper = windowWrapper;
}

ProgressListener.prototype = {

  windowWrapper: null,

  QueryInterface: function(aIID)
  {
   if (aIID.equals(Ci.nsIWebProgressListener) ||
       aIID.equals(Ci.nsISupportsWeakReference) ||
       aIID.equals(Ci.nsISupports))
     return this;
   throw Cr.NS_NOINTERFACE;
  },
 
  onStateChange: function(aWebProgress, aRequest, aFlag, aStatus) {}, 
  onProgressChange: function(aWebProgress, aRequest, curSelf, maxSelf, curTot, maxTot) {},
  onStatusChange: function(aWebProgress, aRequest, aStatus, aMessage) {},
  onSecurityChange: function(aWebProgress, aRequest, aState) {},

  onLocationChange: function(aProgress, aRequest, aURI)
  {
    this.windowWrapper.updateInterface();
  }
}

init();
