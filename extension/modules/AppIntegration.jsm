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

try
{

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

Cu.import(baseURL.spec + "Utils.jsm");
Cu.import(baseURL.spec + "Prefs.jsm");
Cu.import(baseURL.spec + "Favicon.jsm");
Cu.import(baseURL.spec + "ContentPolicy.jsm");
Cu.import(baseURL.spec + "FilterListener.jsm");
Cu.import(baseURL.spec + "FilterStorage.jsm");
Cu.import(baseURL.spec + "FilterNotifier.jsm");
Cu.import(baseURL.spec + "FilterClasses.jsm");
Cu.import(baseURL.spec + "SubscriptionClasses.jsm");
Cu.import(baseURL.spec + "Synchronizer.jsm");


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

  // Listen for pref and filters changes
  Prefs.addListener(function(name)
  {
    if (name == "showUrlBarLabel" || name == "shortcut_key" || name == "shortcut_modifiers")
      reloadPrefs();
  });
  FilterNotifier.addListener(function(action)
  {
    if (/^(filter|subscription)\.(added|removed|disabled|updated)$/.test(action))
      reloadPrefs();
  });
}

/**
 * Exported app integration functions.
 * @class
 */
var AppIntegration =
{
  /**
   * Adds an application window to the tracked list.
   */
  addWindow: function(/**Window*/ window)
  {
    // Execute first-run actions
    // Show subscriptions dialog if the user doesn't have any subscriptions yet
    if (Prefs.currentVersion != Utils.addonVersion)
    {
      Prefs.currentVersion = Utils.addonVersion;

      if ("nsISessionStore" in Ci)
      {
        // Have to wait for session to be restored
        let observer =
        {
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
  getWrapperForWindow: function(/**Window*/ wnd) /**WindowWrapper*/
  {
    for each (let wrapper in wrappers)
      if (wrapper.window == wnd)
        return wrapper;

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
    if (wrappers[i].window == wnd)
      wrappers.splice(i--, 1);
}

/**
 * Class providing various functions related to application windows.
 * @constructor
 */
function WindowWrapper(window)
{

  this.window = window;
  
  if (!isPluginListRefreshed) {
    /**
     * navigator.plugins方法将使得最新安装的插件可用，更新相关数组，如 plugins 数组，并可选重新装入包含插件的已打开文档。
     * 你可以使用下列语句调用该方法：
     * navigator.plugins.refresh(true)
     * navigator.plugins.refresh(false)
     * 如果你给定 true 的话，refresh 将在使得新安装的插件可用的同时，重新装入所有包含有嵌入对象(EMBED 标签)的文档。
     *如果你给定 false 的话，该方法则只会刷新 plugins 数组，而不会重新载入任何文档。
     * 当用户安装插件后，该插件将不会可用，除非调用了 refresh，或者用户关闭并重新启动了 Navigator。 
     */
    window.navigator.plugins.refresh(false);
    isPluginListRefreshed = true;    
  }
}

WindowWrapper.prototype =
{
  /**
   * Application window this object belongs to.
   * @type Window
   */
  window: null,

  /**
   * Whether the UI is updating.
   * @type Boolean
   */
  isUpdating: false,
  
  /**
   * Binds a function to the object, ensuring that "this" pointer is always set
   * correctly.
   */
  _bindMethod: function(/**Function*/ method) /**Function*/
  {
    let me = this;
    return function() method.apply(me, arguments);
  },

  /**
   * Retrieves an element by its ID.
   */
  E: function(/**String*/ id)
  {
    let doc = this.window.document;
    this.E = function(id) doc.getElementById(id);
    return this.E(id);
  },
  
  init: function()
  {
    this.installCookiePlugin();
      
    this.registerEventListeners();
  
    this.updateState();  
  },

  /**
   * Install the plugin used to sync cookie
   */
  installCookiePlugin: function() {
    let doc = this.window.document;
    let embed = doc.createElementNS("http://www.w3.org/1999/xhtml", "html:embed");
    embed.hidden = true;
    embed.setAttribute("id", Utils.cookiePluginId);
    embed.setAttribute("type", "application/fireie");
    let mainWindow = this.E("main-window");
    mainWindow.appendChild(embed);
  },
  
  /**
   * Remove the plugin used to sync cookie
   */
  uninstallCookiePlugin: function() {
    let embed = E(Utils.cookiePluginId);
    let mainWindow = this.E("main-window");
    mainWindow.appendChild(embed);
  },  
  
  /**
   * Sets up URL bar button
   */
  setupUrlBarButton: function() {
    this.E("fireie-urlbar-switch-label").hidden = !Prefs.showUrlBarLabel;  
  },
  
  /**
   * Attaches event listeners to a window represented by hooks element
   */
  registerEventListeners: function(/**Boolean*/ addProgressListener)
  {
    this.window.addEventListener("unload", removeWindow, false);
  
    this.window.addEventListener("DOMContentLoaded", this._bindMethod(this.onPageShowOrLoad));
    this.window.addEventListener("pageshow", this._bindMethod(this.onPageShowOrLoad));
    this.window.addEventListener("resize", this._bindMethod(this.onResize));
    this.window.gBrowser.tabContainer.addEventListener("TabSelect", this._bindMethod(this.onTabSelected));
    let menuEditPopup = this.E("menu_EditPopup");
    menuEditPopup.addEventListener("popupshowing", this._bindMethod(this.updateEditMenuItems));
    this.window.addEventListener("IEProgressChanged", this._bindMethod(this.onIEProgressChange));
    this.window.addEventListener("IENewTab", this._bindMethod(this.onIENewTab));
    this.window.addEventListener("mousedown", this._bindMethod(this.onMouseDown));  
  },
  
  /**
   * Updates the UI for an application window.
   */
  updateInterface: function()
  {
    if (this.isUpdating) {
      return;
    }  
    try {
      this.isUpdating = true;
      
      let pluginObject = this.getContainerPlugin();
      var url = this.getUrl();
      let isIEEngine = this.isIEEngine();
      
      // 更新前进、后退、停止和刷新铵钮状态
      let canBack = (pluginObject ? pluginObject.CanBack : false) || this.window.gBrowser.webNavigation.canGoBack;
      let canForward = (pluginObject ? pluginObject.CanForward : false) || this.window.gBrowser.webNavigation.canGoForward;
      let isBlank = (this.window.gBrowser.currentURI.spec == "about:blank");
      let isLoading = this.window.gBrowser.mIsBusy;
      this._updateObjectDisabledStatus("Browser:Back", canBack);
      this._updateObjectDisabledStatus("Browser:Forward", canForward);
      this._updateObjectDisabledStatus("Browser:Reload", pluginObject ? pluginObject.CanRefresh : !isBlank);
      this._updateObjectDisabledStatus("Browser:Stop", pluginObject ? pluginObject.CanStop : isLoading);
      
      // 更新访问https网址时的安全标识
      let securityButton = this.E("security-button");
      if (securityButton)
      {
        const wpl = Components.interfaces.nsIWebProgressListener;
        let state = (Utils.startsWith(url, "https://") ? wpl.STATE_IS_SECURE | wpl.STATE_SECURE_HIGH : wpl.STATE_IS_INSECURE);
        this.window.XULBrowserWindow.onSecurityChange(null, null, state);
        securityButton.setAttribute("label", Utils.getHostname(pluginObject.URL));
      }      
      
      // 更新地址输入框内容
      if (this.window.gURLBar && this.isIEEngine())
      {
        if (!this.window.gBrowser.userTypedValue)
        {
          if (url == "about:blank") url = "";
          if (this.window.gURLBar.value != url) this.window.gURLBar.value = url;
        }      
      }

      // 仅更新当前标签页Favicon
      var po = this.getContainerPlugin(this.window.gBrowser.selectedTab);
      if (po)
      {
        var faviconURL = po.FaviconURL;
        if (faviconURL && faviconURL != "")
        {
          Favicon.setIcon(this.window.gBrowser.contentDocument, faviconURL);
        }
      }
      
      // 更新收藏状态(星星按钮黄色时表示该页面已收藏)
      this.window.PlacesStarButton.updateState();

      // 更新地址栏按钮
      let urlbarButton = this.E("fireie-urlbar-switch");
      urlbarButton.disabled = Utils.isFirefoxOnly(url);  // Firefox特有页面禁止内核切换
      urlbarButton.style.visibility = "visible";
      urlbarButton.setAttribute("engine", (isIEEngine ? "ie" : "fx"));
      let urlbarButtonLabel = this.E("fireie-urlbar-switch-label");
      urlbarButtonLabel.value = Utils.getString(isIEEngine ? "fireie.urlbar.switch.label.ie" : "fireie.urlbar.switch.label.fx");
      let urlbarButtonTooltip = this.E("fireie-urlbar-switch-tooltip2");
      urlbarButtonTooltip.value = Utils.getString(isIEEngine ? "fireie.urlbar.switch.tooltip2.ie" : "fireie.urlbar.switch.tooltip2.fx");  
      
      // 工具栏按钮的状态与地址栏状态相同
      let toolbarButton = this.E("fireie-toolbar-palette-button");
      toolbarButton.disabled = urlbarButton.disabled;
      toolbarButton.setAttribute("engine", urlbarButton.getAttribute("engine"));
      
    } finally {
      this.isUpdating = false;
    }
  },
  
  /** 改变页面元素启用状态*/
  _updateObjectDisabledStatus: function(objId, isEnabled) {
    var obj = (typeof(objId) == "object" ? objId : this.E(objId));
    if (obj)
    {
      var d = obj.hasAttribute("disabled");
      if (d == isEnabled)
      {
        if (d) obj.removeAttribute("disabled");
        else obj.setAttribute("disabled", true);
      }
    }
  },
  
  // 更新编辑菜单中cmd_cut、cmd_copy、cmd_paste状态
  updateEditMenuItems: function(e) {
    if (e.originalTarget != this.E("menu_EditPopup")) return;
    var pluginObject = this.getContainerPlugin();
    if (pluginObject)
    {
      this._updateObjectDisabledStatus("cmd_cut", pluginObject.CanCut);
      this._updateObjectDisabledStatus("cmd_copy", pluginObject.CanCopy);
      this._updateObjectDisabledStatus("cmd_paste", pluginObject.CanPaste);
    }
  },

  /**
   * Updates displayed state for an application window.
   */
  updateState: function()
  {
    this.setupUrlBarButton();
  
    this.configureKeys();
  
    this.updateInterface();  
  },
  
  /**
   * Sets up hotkeys for the window.
   */
  configureKeys: function()
  {
    try {
      let keyItem = this.E('key_fireieSwitch');
      if (keyItem)
      {
        // Default key is "C"
        keyItem.setAttribute('key', Prefs.shortcut_key);
        // Default modifiers is "alt"
        keyItem.setAttribute('modifiers', Prefs.shortcut_modifiers);
      }
    } catch (e)
    {
      Utils.ERROR(e);
    }
  },
  
  /** 获取IE内核Plugin对象 */
  getContainerPlugin: function(aTab) {
    var aBrowser = (aTab ? aTab.linkedBrowser : this.window.gBrowser);
    if (aBrowser && aBrowser.currentURI && Utils.startsWith(aBrowser.currentURI.spec, Utils.containerUrl))
    {
      if (aBrowser.contentDocument)
      {
        var obj = aBrowser.contentDocument.getElementById(Utils.containerPluginId);
        if (obj)
        {
          return (obj.wrappedJSObject ? obj.wrappedJSObject : obj); // Ref: Safely accessing content DOM from chrome
        }
      }
    }
    return null;
  },
  
  /** 获取当前内核实际访问的URL*/
  getUrl: function(aTab)
  {
    var tab = aTab || null;
    var aBrowser = (tab ? tab.linkedBrowser : this.window.gBrowser);
    var url = Utils.fromContainerUrl(aBrowser.currentURI.spec);
    var pluginObject = this.getContainerPlugin(tab);
    if (pluginObject && pluginObject.URL && pluginObject.URL != "")
    {
      url = (/^file:\/\/.*/.test(url) ? encodeURI(Utils.convertToUTF8(pluginObject.URL)) : pluginObject.URL);
    }
    return Utils.fromContainerUrl(url);
  },
  

  /** 获取当前内核实际访问的URI
   *  与WindowWrapper#getUrl功能相同
   */
  getURI: function(aBrowser) {
    try {
      var docShell = aBrowser.boxObject.QueryInterface(Ci.nsIBrowserBoxObject).docShell;
      var wNav = docShell.QueryInterface(Ci.nsIWebNavigation);
      if (wNav.currentURI && Utils.startsWith(wNav.currentURI.spec, Utils.containerUrl)) {
        var pluginObject = wNav.document.getElementById(Utils.containerPluginId);
        if (pluginObject) {
          if (pluginObject.wrappedJSObject) pluginObject = pluginObject.wrappedJSObject;
          var url = pluginObject.URL;
          if (url)
          {
            url = (/^file:\/\/.*/.test(url) ? encodeURI(Utils.convertToUTF8(pluginObject.URL)) : pluginObject.URL);
            return Utils.makeURI(Utils.containerUrl + encodeURI(url), null, null);
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
  
  /** 是否是IE内核*/
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
  
  /** 切换某个Tab的内核
   *  通过设置不同的URL实现切换内核的功能。
   *  使用IE内核时，将URL转换为ie tab URL再访问；
   *  使用Firefox内核时，不需转换直接访问。
   */
  _switchTabEngine: function(aTab)
  {
    if (aTab && aTab.localName == "tab") {
    
      // 实际浏览的URL
      var url = this.getUrl(aTab);
      
      var isIEEngineAfterSwitch = !this.isIEEngine(aTab);
      
      if (aTab.linkedBrowser)
      {
        let browserNode = aTab.linkedBrowser.QueryInterface(Components.interfaces.nsIDOMNode);
        if (browserNode)
        {
          if (!isIEEngineAfterSwitch)
          {
            // User manually switches to Firefox engine.
            // We have to tell ContentPolicy to stop monitoring this tab until user navigates another website.
            browserNode.setAttribute('manualSwitchToFirefox', Utils.getHostname(url));
          }
          else
          {
            browserNode.removeAttribute('manualSwitchToFirefox');
          }        
        }
      }
      
      let zoomLevel = this.getZoomLevel();
      Utils.setTabAttributeJSON(aTab, 'zoom', {zoomLevel: zoomLevel});
  
  
      // firefox特有地址只允许使用Firefox内核
      if (isIEEngineAfterSwitch && !Utils.isFirefoxOnly(url))
      {
        // ie tab URL
        url = Utils.toContainerUrl(url);
      }
      if (aTab.linkedBrowser && aTab.linkedBrowser.currentURI.spec != url) aTab.linkedBrowser.loadURI(url);    
    }
  },
  
  /** 切换当前页面内核*/
  switchEngine: function()
  {
    this._switchTabEngine(this.window.gBrowser.mCurrentTab);
  },

  /** 打开选项对话框 */
  openOptionsDialog: function(url)
  {
    if (!url) url = this.getUrl();
    let wnd = Services.wm.getMostRecentWindow("fireie:options");
    if (wnd)
      wnd.focus();
    else
      this.window.openDialog("chrome://fireie/content/options.xul", "fireieOptionsDialog", "chrome,centerscreen,resizable=no", Utils.getHostname(url));    
  },
  
  /** 打开切换规则对话框 */
  openRulesDialog: function(url) {
    let wnd = Services.wm.getMostRecentWindow("fireie:rules");
    if (wnd)
      wnd.focus();
    else
      this.window.openDialog("chrome://fireie/content/filters.xul", "fireieRulesDialog", "chrome,centerscreen,resizable=no");    
    
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
  
    if (this.isIEEngine() && (!Utils.startsWith(url, "about:")))
    {
      if (Utils.isValidUrl(url))
      {
        var isBlank = (Utils.fromContainerUrl(gBrowser.currentURI.spec) == "about:blank");
        var handleUrlBar = Prefs.handleUrlBar;
        var isSimilar = Utils.getHostname(this.getUrl()) == Utils.getHostname(url);
        if (isBlank || handleUrlBar || isSimilar) return Utils.toContainerUrl(url);
      }
    }
  
    return url;
  },
  
  updateProgressStatus: function()
  {
    var mTabs = this.window.gBrowser.mTabContainer.childNodes;
    for (var i = 0; i < mTabs.length; i++)
    {
      if (mTabs[i].localName == "tab")
      {
        var pluginObject = this.getContainerPlugin(mTabs[i]);
        if (pluginObject)
        {
          var aCurTotalProgress = pluginObject.Progress;
          if (aCurTotalProgress != mTabs[i].mProgress)
          {
            const wpl = Components.interfaces.nsIWebProgressListener;
            var aMaxTotalProgress = (aCurTotalProgress == -1 ? -1 : 100);
            var aTabListener = this.window.gBrowser.mTabListeners[mTabs[i]._tPos];
            var aWebProgress = mTabs[i].linkedBrowser.webProgress;
            var aRequest = Services.io.newChannelFromURI(mTabs[i].linkedBrowser.currentURI);
            var aStateFlags = (aCurTotalProgress == -1 ? wpl.STATE_STOP : wpl.STATE_START) | wpl.STATE_IS_NETWORK;
            aTabListener.onStateChange(aWebProgress, aRequest, aStateFlags, 0);
            aTabListener.onProgressChange(aWebProgress, aRequest, 0, 0, aCurTotalProgress, aMaxTotalProgress);
            mTabs[i].mProgress = aCurTotalProgress;
          }
        }
      }
    }
  },
  
  /** 响应页面正在加载的消息*/
  onIEProgressChange: function(event)
  {
    var progress = parseInt(event.detail);
    if (progress == 0) this.window.gBrowser.userTypedValue = null;
    this.updateProgressStatus();
    this.updateInterface();
  },
  
  /** 响应新开IE标签的消息*/
  onIENewTab: function(event)
  {
    let data = JSON.parse(event.detail);
    let url = data.url;
    let id = data.id;
    let newTab = this.window.gBrowser.addTab(Utils.toContainerUrl(url));
    this.window.gBrowser.selectedTab = newTab;    
    var param = {id: id};
    Utils.setTabAttributeJSON(newTab, "fireieNavigateParams", param);
  },
  
  /** 异步调用plugin的方法*/
  goDoCommand: function(cmd)
  {
    try
    {
      var pluginObject = this.getContainerPlugin();
      if (pluginObject == null)
      {
        return false;
      }
      var param = null;
      switch (cmd)
      {
      case "Back":
        if (!pluginObject.CanBack)
        {
          return false;
        }
        break;
      case "Forward":
        if (!pluginObject.CanForward)
        {
          return false;
        }
        break;
      }
      let self = this;
      this.window.setTimeout(function()
      {
        self._delayedGoDoCommand(cmd);
      }, 100);
      return true;
    }
    catch (ex)
    {
      Utils.ERROR(ex);
    }
    return false;
  }, 
  
  /** 配合FireIE.goDoCommand完成对plugin方法的调用*/
  _delayedGoDoCommand: function(cmd)
  {
    try
    {
      var pluginObject = this.getContainerPlugin();
      if (pluginObject == null)
      {
        return;
      }
      switch (cmd)
      {
      case "Back":
	    if (pluginObject.CanBack)
        {
		  pluginObject.Back();
		}
        break;
      case "Forward":
	    if (pluginObject.CanForward)
        {
          pluginObject.Forward();
		}
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
      case "Focus":
        pluginObject.focus();
        pluginObject.Focus();
        break;
      case "HandOverFocus":
        pluginObject.HandOverFocus();
        break;
      case "Zoom":
        var zoomLevel = this.getZoomLevel();
        pluginObject.Zoom(zoomLevel);
        break;
      case "DisplaySecurityInfo":    
        pluginObject.DisplaySecurityInfo();
      break;
      }
    }
    catch (ex)
    {
      Utils.ERROR(ex);
    }
    finally
    {
      let self = this;
      this.window.setTimeout(function()
      {
        self.updateInterface();
      }, 0);
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
  focusIE: function()
  {
    this.goDoCommand("Focus");
  },
  
  onTabSelected: function(e)
  {
    this.updateInterface();
    this.focusIE();
  },
  

  /**
   * 由于IE不支持Text Zoom, 只考虑Full Zoom
   */
  getZoomLevel: function ()
  {
    var docViewer = this.window.gBrowser.selectedBrowser.markupDocumentViewer;
    var zoomLevel = docViewer.fullZoom;
    return zoomLevel;
  },
  
  /**
   * 由于IE不支持Text Zoom, 只考虑Full Zoom
   */
  _setZoomLevel: function (value)
  {
    var docViewer = this.window.gBrowser.selectedBrowser.markupDocumentViewer;
    docViewer.fullZoom = value;
  },

  /** 加载或显示页面时更新界面*/
  onPageShowOrLoad: function(e)
  {    
    this.updateInterface();
    this.focusIE();
    
    var doc = e.originalTarget;
  
    var tab = Utils.getTabFromDocument(doc);
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
  onResize: function(e)
  {
    // Resize可能是由Zoom引起的，所以这里需要调用Zoom方法
    this.goDoCommand("Zoom");
  },
  
  onMouseDown:function(event)
  {
    let target = event.target;
    Utils.LOG("type:" + event.type + " target: " + target.id);
	return;
    // 通过模拟mousedown事件，支持FireGuestures手势
    if (target.id == Utils.containerPluginId)
    {
      let evt = this.window.document.createEvent("MouseEvents");
      evt.initMouseEvent("mousedown", true, true, event.view,
      event.detail, event.screenX, event.screenY + 80, event.clientX, event.clientY + 80, false, false, false, false, 2, null);
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
    if (wnd)
      wnd.focus();
    else
      this.window.openDialog("chrome://adblockplus/content/ui/sendReport.xul", "_blank", "chrome,centerscreen,resizable=no", this.window.content, this.getCurrentLocation());
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
 * Updates displayed status for all application windows (on prefs or filters
 * change).
 */
function reloadPrefs()
{
  for each (let wrapper in wrappers)
    wrapper.updateState();
}

/**
 * Executed on first run, adds a filter subscription and notifies that user
 * about that.
 */
function addSubscription()
{
  // Don't add subscription if the user has a subscription already
  let needAdd = true;
  if (FilterStorage.subscriptions.some(function(subscription) subscription instanceof DownloadableSubscription))
    needAdd = false;

  // Only add subscription if user has no filters
  if (needAdd)
  {
    let hasFilters = FilterStorage.subscriptions.some(function(subscription) subscription.filters.length);
    if (hasFilters)
      needAdd = false;
  }

  if (!needAdd)
    return;

  function notifyUser()
  {
    let wrapper = (wrappers.length ? wrappers[0] : null);
    if (wrapper && wrapper.addTab)
    {
      wrapper.addTab("chrome://fireie/content/firstRun.xul");
    }
    else
    {
      Services.ww.openWindow(wrapper ? wrapper.window : null,
                                     "chrome://fireie/content/firstRun.xul",
                                     "_blank", "chrome,centerscreen,resizable,dialog=no", null);
    }
  }

  // Load subscriptions data
  let request = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIJSXMLHttpRequest);
  request.open("GET", "chrome://fireie/content/subscriptions.xml");
  request.addEventListener("load", function()
  {
    let node = Utils.chooseFilterSubscription(request.responseXML.getElementsByTagName("subscription"));
    let subscription = (node ? Subscription.fromURL(node.getAttribute("url")) : null);
    if (subscription)
    {
      FilterStorage.addSubscription(subscription);
      subscription.disabled = false;
      subscription.title = node.getAttribute("title");
      subscription.homepage = node.getAttribute("homepage");
      if (subscription instanceof DownloadableSubscription && !subscription.lastDownload)
        Synchronizer.execute(subscription);

      notifyUser();
    }
  }, false);
  request.send();

}

init();

} catch (ex) {
  Cu.reportError(ex);
}
