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
    if (name == "showUrlBarLabel" || name == "hideUrlBarButton" || name == "shortcut_key" || name == "shortcut_modifiers" || name == "currentTheme") reloadPrefs();
  });
  RuleNotifier.addListener(function(action)
  {
    if (/^(rule|subscription)\.(added|removed|disabled|updated)$/.test(action)) reloadPrefs();
  });
}

/**
 * Exported app integration functions.
 * @class
 */
let AppIntegration = {
  /**
   * Adds an application window to the tracked list.
   */
  addWindow: function( /**Window*/ window)
  {
    // Execute first-run actions
    // Show subscriptions dialog if the user doesn't have any subscriptions yet
    if (Prefs.currentVersion != Utils.addonVersion)
    {
      Prefs.currentVersion = Utils.addonVersion;

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

    let wrapper = new WindowWrapper(window);
    wrappers.push(wrapper);

  },

  /**
   * Retrieves the wrapper object corresponding to a particular application window.
   */
  getWrapperForWindow: function( /**Window*/ wnd) /**WindowWrapper*/
  {
    for each(let wrapper in wrappers)
    if (wrapper.window == wnd) return wrapper;

    return null;
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

  if (!isPluginListRefreshed)
  {
    /**
     * navigator.plugins方法将使得最新安装的插件可用，更新相关数组，如 plugins 数组，并可选重新装入包含插件的已打开文档。
     * 你可以使用下列语句调用该方法：
     * navigator.plugins.refresh(true)
     * navigator.plugins.refresh(false)
     * 如果你给定 true 的话，refresh 将在使得新安装的插件可用的同时，重新装入所有包含有嵌入对象(EMBED 标签)的文档。
     * 如果你给定 false 的话，该方法则只会刷新 plugins 数组，而不会重新载入任何文档。
     * 当用户安装插件后，该插件将不会可用，除非调用了 refresh，或者用户关闭并重新启动了 Navigator。 
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
   * Whether the UI is updating.
   * @type Boolean
   */
  isUpdating: false,

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

  init: function()
  {
    this._installCookiePlugin();

    // Work around the bug #35: Cannot input in the address bar when starting
    // Firefox with blank page.
    this.window.setTimeout(function()
    {
      this.window.gURLBar.blur();
      this.window.gURLBar.focus();

    }, 200);

    this._registerEventListeners();

    this.updateState();
  },

  /**
   * Install the plugin used to sync cookie
   */
  _installCookiePlugin: function()
  {
    let doc = this.window.document;
    let embed = doc.createElementNS("http://www.w3.org/1999/xhtml", "html:embed");
    embed.hidden = true;
    embed.setAttribute("id", Utils.cookiePluginId);
    embed.setAttribute("type", "application/fireie");
    let mainWindow = this.E("main-window");
    mainWindow.appendChild(embed);
  },


  /**
   * Sets up URL bar button
   */
  _setupUrlBarButton: function()
  {
    this.E("fireie-urlbar-switch-label").hidden = !Prefs.showUrlBarLabel;
    this.E("fireie-urlbar-switch").hidden = Prefs.hideUrlBarButton;
  },

  /**
   * Attaches event listeners to a window represented by hooks element
   */
  _registerEventListeners: function( /**Boolean*/ addProgressListener)
  {
    this.window.addEventListener("unload", removeWindow, false);

    this.window.addEventListener("DOMContentLoaded", this._bindMethod(this._onPageShowOrLoad), false);
    this.window.addEventListener("pageshow", this._bindMethod(this._onPageShowOrLoad), false);
    this.window.addEventListener("resize", this._bindMethod(this._onResize), false);
    this.window.gBrowser.tabContainer.addEventListener("TabSelect", this._bindMethod(this._onTabSelected), false);
    this.E("menu_EditPopup").addEventListener("popupshowing", this._bindMethod(this._updateEditMenuItems), false);
    this.window.addEventListener("mousedown", this._bindMethod(this._onMouseDown), false);

    // Listen to plugin events
    this.window.addEventListener("IEProgressChanged", this._bindMethod(this._onIEProgressChange), false);
    this.window.addEventListener("IENewTab", this._bindMethod(this._onIENewTab), false);
    this.window.addEventListener("IEUserAgentReceived", this._bindMethod(this._onIEUserAgentReceived), false);
    this.window.addEventListener("IESetCookie", this._bindMethod(this._onIESetCookie), false);

    // Listen for theme related events that bubble up from content
    this.window.document.addEventListener("InstallBrowserTheme", this._bindMethod(this._onInstallTheme), false, true);
    this.window.document.addEventListener("PreviewBrowserTheme", this._bindMethod(this._onPreviewTheme), false, true);
    this.window.document.addEventListener("ResetBrowserThemePreview", this._bindMethod(this._onResetThemePreview), false, true);
  },

  /**
   * Updates the UI for an application window.
   */
  _updateInterface: function()
  {
    if (this.isUpdating)
    {
      return;
    }
    try
    {
      this.isUpdating = true;

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

      // Update the enable status of security button
      let securityButton = this.E("security-button");
      if (securityButton && pluginObject)
      {
        const wpl = Components.interfaces.nsIWebProgressListener;
        let state = (Utils.startsWith(url, "https://") ? wpl.STATE_IS_SECURE | wpl.STATE_SECURE_HIGH : wpl.STATE_IS_INSECURE);
        this.window.XULBrowserWindow.onSecurityChange(null, null, state);
        securityButton.setAttribute("label", Utils.getHostname(pluginObject.URL));
      }

      // Update the content of the URL bar.
      if (this.window.gURLBar && this.isIEEngine())
      {
        if (!this.window.gBrowser.userTypedValue)
        {
          if (url == "about:blank") url = "";
          if (this.window.gURLBar.value != url) this.window.gURLBar.value = url;
        }
        else
        {
          let self = this;
          if (this.window.gURLBar.selectionEnd != this.window.gURLBar.selectionStart) this.window.setTimeout(function()
          {
            self.window.gURLBar.blur();
            self.window.gURLBar.focus();
          }, 0);
        }
      }

      // udpate current tab's favicon
      if (pluginObject)
      {
        let faviconURL = pluginObject.FaviconURL;
        if (faviconURL && faviconURL != "")
        {
          Favicon.setIcon(this.window.gBrowser.contentDocument, faviconURL);
        }
      }

      // Update the star button indicating whether current page is bookmarked.
      this.window.PlacesStarButton.updateState();

      function escapeURLForCSS(url)
      {
        return url.replace(/[(),\s'"]/g, "\$&");
      }

      // Update the engine button on the URL bar
      urlbarButton = this.E("fireie-urlbar-switch");
      urlbarButton.disabled = Utils.isFirefoxOnly(url); // Firefox特有页面禁止内核切换
      urlbarButton.style.visibility = "visible";
      let fxURL = urlbarButton.getAttribute("fx-icon-url");
      let ieURL = urlbarButton.getAttribute("ie-icon-url");
      let engineIconCSS = 'url("' + escapeURLForCSS(isIEEngine ? ieURL : fxURL) + '")';
      this.E("fireie-urlbar-switch-image").style.listStyleImage = engineIconCSS;
      let urlbarButtonLabel = this.E("fireie-urlbar-switch-label");
      urlbarButtonLabel.value = Utils.getString(isIEEngine ? "fireie.urlbar.switch.label.ie" : "fireie.urlbar.switch.label.fx");
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
    finally
    {
      this.isUpdating = false;
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
    try
    {
      let keyItem = this.E('key_fireieSwitch');
      if (keyItem)
      {
        if (Prefs.shortcutEnabled)
        {
          // Default key is "C"
          keyItem.setAttribute('key', Prefs.shortcut_key);
          // Default modifiers is "alt"
          keyItem.setAttribute('modifiers', Prefs.shortcut_modifiers);
        }
        else
        {
          keyItem.parentNode.removeChild(keyItem);
        }
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
    if (aBrowser && aBrowser.currentURI && Utils.startsWith(aBrowser.currentURI.spec, Utils.containerUrl))
    {
      if (aBrowser.contentDocument)
      {
        let obj = aBrowser.contentDocument.getElementById(Utils.containerPluginId);
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
    let url = Utils.fromContainerUrl(aBrowser.currentURI.spec);
    let pluginObject = this.getContainerPlugin(tab);
    let pluginURL = pluginObject ? pluginObject.URL : null;
    if (pluginURL && pluginURL != "")
    {
      url = (/^file:\/\/.*/.test(url) ? encodeURI(Utils.convertToUTF8(pluginURL)) : pluginURL);
    }
    return Utils.fromContainerUrl(url);
  },


  /**
   *  Get current navigation URI with current engine.
   *  It's of the same function with 与WindowWrapper#getURL.
   */
  getURI: function(aBrowser)
  {
    try
    {
      let docShell = aBrowser.boxObject.QueryInterface(Ci.nsIBrowserBoxObject).docShell;
      let wNav = docShell.QueryInterface(Ci.nsIWebNavigation);
      if (wNav.currentURI && Utils.startsWith(wNav.currentURI.spec, Utils.containerUrl))
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

  /** Check whether current engine is IE.*/
  isIEEngine: function(aTab)
  {
    let tab = aTab || this.window.gBrowser.mCurrentTab;
    let aBrowser = (aTab ? aTab.linkedBrowser : this.window.gBrowser);
    if (aBrowser && aBrowser.currentURI && Utils.startsWith(aBrowser.currentURI.spec, Utils.containerUrl))
    {
      return true;
    }
    return false;
  },

  /**
   *  Switch the engine of specified tab.
   */
  _switchTabEngine: function(aTab)
  {
    if (aTab && aTab.localName == "tab")
    {

      // 实际浏览的URL
      let url = this.getURL(aTab);

      let isIEEngineAfterSwitch = !this.isIEEngine(aTab);

      if (aTab.linkedBrowser)
      {
        let browserNode = aTab.linkedBrowser.QueryInterface(Components.interfaces.nsIDOMNode);
        if (browserNode)
        {
          if (!isIEEngineAfterSwitch)
          {
            // User manually switches to Firefox engine.
            // We have to tell ContentPolicy to stop monitoring this tab until user navigates another website.
            browserNode.setAttribute('manuallySwitchToFirefox', Utils.getHostname(url));
          }
          else
          {
            browserNode.removeAttribute('manuallySwitchToFirefox');
          }
        }
      }

      let zoomLevel = this.getZoomLevel();
      Utils.setTabAttributeJSON(aTab, 'zoom', {
        zoomLevel: zoomLevel
      });

      // firefox特有地址只允许使用Firefox内核
      if (isIEEngineAfterSwitch && !Utils.isFirefoxOnly(url))
      {
        url = Utils.toContainerUrl(url);
      }
      if (aTab.linkedBrowser && aTab.linkedBrowser.currentURI.spec != url) aTab.linkedBrowser.loadURI(url);
    }
  },

  /** Switch current tab's engine */
  switchEngine: function()
  {
    this._switchTabEngine(this.window.gBrowser.mCurrentTab);
  },

  /** Show the options dialog */
  openOptionsDialog: function(url)
  {
    if (!url) url = this.getURL();
    let wnd = Services.wm.getMostRecentWindow("fireie:options");
    if (wnd) wnd.focus();
    else this.window.openDialog("chrome://fireie/content/options.xul", "fireieOptionsDialog", "chrome,centerscreen,resizable=no", Utils.getHostname(url));
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
    //try
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
    //catch (e)
    {
      Utils.ERROR(e);
    }
  },

  getHandledURL: function(url, isModeIE)
  {
    url = url.trim();

    // 访问firefox特有地址时, 只允许使用firefox内核
    if (Utils.isFirefoxOnly(url))
    {
      return url;
    }

    if (isModeIE) return Utils.toContainerUrl(url);

    if (this.isIEEngine() && !Utils.startsWith(url, "about:"))
    {
      if (Utils.isValidUrl(url) || Utils.isValidDomainName(url))
      {
        let isBlank = (Utils.fromContainerUrl(this.window.gBrowser.currentURI.spec) == "about:blank");
        let handleUrlBar = Prefs.handleUrlBar;
        let isSimilar = Utils.getHostname(this.getURL()) == Utils.getHostname(url);
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

  /** 响应页面正在加载的消息*/
  _onIEProgressChange: function(event)
  {
    let progress = parseInt(event.detail);
    if (progress == 0) this.window.gBrowser.userTypedValue = null;
    this._updateProgressStatus();
    this._updateInterface();
  },

  /** 响应新开IE标签的消息*/
  _onIENewTab: function(event)
  {
    let data = JSON.parse(event.detail);
    let url = data.url;
    let id = data.id;
    let newTab = this.window.gBrowser.addTab(Utils.toContainerUrl(url));
    this.window.gBrowser.selectedTab = newTab;
    let self = this;
    if (this.window.gURLBar && (url == 'about:blank')) window.setTimeout(function()
    {
      self.window.gURLBar.blur();
      self.window.gURLBar.focus();
    }, 0);

    let param = {
      id: id
    };
    Utils.setTabAttributeJSON(newTab, "fireieNavigateParams", param);
  },

  /** 响应获取到IE UserAgent的消息 */
  _onIEUserAgentReceived: function(event)
  {
    let userAgent = event.detail;
    Utils.ieUserAgent = userAgent;
    Utils.LOG("_onIEUserAgentReceived: " + userAgent);
    this._restoreIETempDirectorySetting();
  },

  /**
   * Handles 'IESetCookie' event receiving from the plugin
   */
  _onIESetCookie: function(event)
  {
    let subject = null;
    let topic = "fireie-set-cookie";
    let data = event.detail;
    Services.obs.notifyObservers(subject, topic, data);
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
    // Style URL bar engie button
    let urlbarButton = this.E("fireie-urlbar-switch");

    // First try to obtain the images from the cache
    let images = LightweightTheme.getCachedThemeImages(themeData);
    if (images && images.fxURL && images.ieURL)
    {
      urlbarButton.setAttribute("fx-icon-url", images.fxURL);
      urlbarButton.setAttribute("ie-icon-url", images.ieURL);
    }
    // Else set them from their original source
    else
    {
      urlbarButton.setAttribute("fx-icon-url", themeData.fxURL);
      urlbarButton.setAttribute("ie-icon-url", themeData.ieURL);
    }

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
  },

  _restoreIETempDirectorySetting: function()
  {
    let subject = null;
    let topic = "fireie-restoreIETempDirectorySetting";
    let data = null;
    Services.obs.notifyObservers(subject, topic, data);
  },

  /** plugin方法的调用*/
  goDoCommand: function(cmd)
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
      case "Back":
        if (!pluginObject.CanBack)
        {
          return false;
        }
        pluginObject.Back();
        break;
      case "Forward":
        if (!pluginObject.CanForward)
        {
          return false;
        }
        pluginObject.Forward();
        break;
      case "Stop":
        pluginObject.Stop();
        break;
      case "Refresh":
        pluginObject.Refresh();
        break;
      case "SaveAs":
        pluginObject.SaveAs();
        break;
      case "Print":
        pluginObject.Print();
        break;
      case "PrintSetup":
        pluginObject.PrintSetup();
        break;
      case "PrintPreview":
        pluginObject.PrintPreview();
        break;
      case "Find":
        pluginObject.Find();
        break;
      case "cmd_cut":
        pluginObject.Cut();
        break;
      case "cmd_copy":
        pluginObject.Copy();
        break;
      case "cmd_paste":
        pluginObject.Paste();
        break;
      case "cmd_selectAll":
        pluginObject.SelectAll();
        break;
      case "cmd_undo":
        pluginObject.Undo();
        break;
      case "cmd_redo":
        pluginObject.Redo();
        break;
      case "Focus":
        pluginObject.Focus();
        break;
      case "HandOverFocus":
        pluginObject.HandOverFocus();
        break;
      case "Zoom":
        let zoomLevel = this.getZoomLevel();
        pluginObject.Zoom(zoomLevel);
        break;
      case "DisplaySecurityInfo":
        pluginObject.DisplaySecurityInfo();
        break;
      case "ViewPageSource":
        pluginObject.ViewPageSource();
        break;
      case "FindAgain":
        pluginObject.FBFindAgain();
        break;
      case "FindPrevious":
        pluginObject.FBFindPrevious();
        break;
      case "ToggleHighlightOn":
        pluginObject.FBToggleHighlight(true);
        break;
      case "ToggleHighlightOff":
        pluginObject.FBToggleHighlight(false);
        break;
      case "ToggleCaseOn":
        pluginObject.FBToggleCase(true);
        break;
      case "ToggleCaseOff":
        pluginObject.FBToggleCase(false);
        break;
      case "PageUp":
        pluginObject.PageUp();
        break;
      case "PageDown":
        pluginObject.PageDown();
        break;
      case "LineUp":
        pluginObject.LineUp();
        break;
      case "LineDown":
        pluginObject.LineDown();
        break;
      default:
        throw cmd;
        break;
      }
    }
    catch (ex)
    {
      Utils.ERROR("goDoCommand(" + cmd + "): " + ex);
      return false;
    }
    this.window.setTimeout(this._bindMethod(this._updateInterface), 0);
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
    }
  },
  // 响应内核切换按钮点击事件
  clickSwitchButton: function(e)
  {
    // 左键或中键点击切换内核
    if (e.button <= 1 && !e.target.disabled)
    {
      this.switchEngine();
    }

    // 右键点击显示选项菜单
    else if (e.button == 2)
    {
      this.E("fireie-switch-button-context-menu").openPopup(e.target, "after_start", 0, 0, true, false);
    }

    e.preventDefault();
  },

  /** 将焦点设置到IE窗口上*/
  _focusIE: function()
  {
    this.goDoCommand("Focus");
  },

  _onTabSelected: function(e)
  {
    this._updateInterface();
    this._focusIE();
  },


  /**
   * 由于IE不支持Text Zoom, 只考虑Full Zoom
   */
  getZoomLevel: function()
  {
    let docViewer = this.window.gBrowser.selectedBrowser.markupDocumentViewer;
    let zoomLevel = docViewer.fullZoom;
    return zoomLevel;
  },

  /**
   * 由于IE不支持Text Zoom, 只考虑Full Zoom
   */
  _setZoomLevel: function(value)
  {
    let docViewer = this.window.gBrowser.selectedBrowser.markupDocumentViewer;
    docViewer.fullZoom = value;
  },

  /** 加载或显示页面时更新界面*/
  _onPageShowOrLoad: function(e)
  {
    this._updateInterface();

    let doc = e.originalTarget;

    let tab = Utils.getTabFromDocument(doc);
    if (!tab) return;

    //
    // 检查是否需要设置ZoomLevel
    //  
    let zoomLevelParams = Utils.getTabAttributeJSON(tab, 'zoom');
    if (zoomLevelParams)
    {
      this._setZoomLevel(zoomLevelParams.zoomLevel);
      tab.removeAttribute(tab, 'zoom');
    }
  },

  /**
   * 响应界面大小变化事件
   */
  _onResize: function(e)
  {
    // Resize可能是由Zoom引起的，所以这里需要调用Zoom方法
    this.goDoCommand("Zoom");
  },

  _onMouseDown: function(event)
  {
    let target = event.target;
    Utils.LOG("type:" + event.type + " target: " + target.id);
    return;
    // 通过模拟mousedown事件，支持FireGuestures手势
    if (target.id == Utils.containerPluginId)
    {
      let evt = this.window.document.createEvent("MouseEvents");
      evt.initMouseEvent("mousedown", true, true, event.view, event.detail, event.screenX, event.screenY + 80, event.clientX, event.clientY + 80, false, false, false, false, 2, null);
      let container = this.getContainerPlugin().parentNode;
      this.window.setTimeout(function()
      {
        container.dispatchEvent(evt);
        Utils.LOG("container event fired!");
      }, 200);
    }
  },

  /**
   * Opens report wizard for the current page.
   */
  openReportDialog: function()
  {
    let wnd = Services.wm.getMostRecentWindow("abp:sendReport");
    if (wnd) wnd.focus();
    else this.window.openDialog("chrome://adblockplus/content/ui/sendReport.xul", "_blank", "chrome,centerscreen,resizable=no", this.window.content, this.getCurrentLocation());
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
 * Executed on first run, adds a rule subscription and notifies that user
 * about that.
 */
function addSubscription()
{
  // Don't add subscription if the user has a subscription already
  let needAdd = true;
  if (RuleStorage.subscriptions.some(function(subscription) subscription instanceof DownloadableSubscription)) needAdd = false;

  // Only add subscription if user has no rules
  if (needAdd)
  {
    let hasRules = RuleStorage.subscriptions.some(function(subscription) subscription.rules.length);
    if (hasRules) needAdd = false;
  }

  if (!needAdd) return;

  function notifyUser()
  {
    let wrapper = (wrappers.length ? wrappers[0] : null);
    if (wrapper && wrapper.addTab)
    {
      wrapper.addTab("chrome://fireie/content/firstRun.xul");
    }
    else
    {
      Services.ww.openWindow(wrapper ? wrapper.window : null, "chrome://fireie/content/firstRun.xul", "_blank", "chrome,centerscreen,resizable,dialog=no", null);
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

init();