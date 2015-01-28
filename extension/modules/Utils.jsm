/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

/**
 * @fileOverview Module containing a bunch of utility functions.
 */

var EXPORTED_SYMBOLS = ["Utils"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/Services.jsm");

let _addonVersion = null;
let _addonVersionCallbacks = [];

/**
 * Provides a bunch of utility functions.
 * @class
 */
var Utils = {
  _ieUserAgent: null,
  _userAgent: null,

  /** nsITimer's */
  _timers: [],
  
  /** throttled updates */
  _throttledUpdates: new WeakMap(),
  
  /**
   * Returns the add-on ID used by Fire-IE
   */
  get addonID()
  {
    return "fireie@fireie.org";
  },

  /**
   * Returns the installed Fire-IE version
   */
  get addonVersion()
  {
    return _addonVersion;
  },

  /**
   * Returns Firefox's major version
   */
  get firefoxMajorVersion()
  {
    let version = 6; // Minimum supported version
    
    try
    {
      let versionInfo = Cc["@mozilla.org/xre/app-info;1"]
        .getService(Ci.nsIXULAppInfo);

      let versionString = versionInfo.version;
      Utils.LOG("Host app version: " + versionString);
      version = parseInt(versionString, 10);
      Utils.LOG("Host app major version: " + version);
    }
    catch (e)
    {
      Utils.ERROR("Failed to get host app version: " + e);
    }
    
    Object.defineProperty(Utils, "firefoxMajorVersion", { get: function() version });
    return version;
  },
  
  /**
   * Returns IE's major version
   */
  get ieMajorVersion()
  {
    let wrk = Cc["@mozilla.org/windows-registry-key;1"].createInstance(Ci.nsIWindowsRegKey);
    let version = 6;
    try
    {
      wrk.create(wrk.ROOT_KEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Internet Explorer", wrk.ACCESS_READ);
      let versionString = wrk.readStringValue("version");
      version = parseInt(versionString, 10);
      // for IE 10, version equals to "9.10.*.*", which should be handled specially
      if (version == 9)
      {
        versionString = wrk.readStringValue("svcVersion");
        version = parseInt(versionString, 10);
      }
      Utils.LOG("IE version: " + versionString);
      Utils.LOG("IE major version: " + version);
    }
    catch (e)
    {
      Utils.LOG("Failed to get IE version from registry: " + e);
    }
    finally
    {
      wrk.close();
      wrk = null;
    }
    
    Object.defineProperty(Utils, "ieMajorVersion", { get: function() version });
    return version;
  },

  /**
   * Original ABP code. No build info available here -_-
   * Used by public API thus better not remove it.
   */
  get addonBuild()
  {
    return "";
  },

  /**
   * Returns ID of the application
   */
  get appID()
  {
    let id = Services.appinfo.ID;
    Object.defineProperty(Utils, "appID", { get: function() id });
    return id;
  },

  /**
   * Returns the user interface locale selected for fireie chrome package.
   */
  get appLocale()
  {
    let locale = "en-US";
    try
    {
      locale = Utils.chromeRegistry.getSelectedLocale("fireie");
    }
    catch (e)
    {
      Cu.reportError(e);
    }
    Object.defineProperty(Utils, "appLocale", { get: function() locale });
    return locale;
  },

  /**
   * Returns version of the Gecko platform
   */
  get platformVersion()
  {
    let platformVersion = Services.appinfo.platformVersion;
    Object.defineProperty(Utils, "platformVersion", { get: function() platformVersion });
    return platformVersion;
  },

  /**
   * Whether running in 64bit environment.
   */
  get is64bit()
  {
    return Services.appinfo.XPCOMABI.indexOf('64') != -1;
  },
  
  get isOOPP()
  {
    let ipcPrefName = "dom.ipc.plugins.enabled.npfireie" + (Utils.is64bit ? "64" : "32") + ".dll";
    return Services.prefs.getBoolPref(ipcPrefName);
  },

  get ieUserAgent()
  {
    return Utils._ieUserAgent;
  },

  set ieUserAgent(value)
  {
    Utils._ieUserAgent = value;
  },
  
  get userAgent()
  {
    return Utils._userAgent;
  },
  
  set userAgent(value)
  {
    Utils._userAgent = value;
  },
  
  get esrUserAgent()
  {
    let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);
    Cu.import(baseURL.spec + "Prefs.jsm");
    
    Object.defineProperty(Utils, "esrUserAgent", { get: function() Prefs.esr_user_agent });
    return Prefs.esr_user_agent;
  },
  
  get ieTempDir()
  {
    let dir = Services.dirsvc.get("ProfLD", Ci.nsIFile).path + "\\fireie";
    // Relocate to system temp directory if local profile & roaming profile are the same
    if (dir == Services.dirsvc.get("ProfD", Ci.nsIFile).path + "\\fireie")
      dir = Services.dirsvc.get("TmpD", Ci.nsIFile).path + "\\fireie";
    
    Object.defineProperty(Utils, "ieTempDir", { get: function() dir });
    return dir;
  },
  
  /**
   * From http://stackoverflow.com/questions/194157/c-sharp-how-to-get-program-files-x86-on-windows-vista-64-bit
   * The function below will return the x86 Program Files directory in all of these three Windows configurations:
   * * 32 bit Windows
   * * 32 bit program running on 64 bit Windows
   * * 64 bit program running on 64 bit windows
   * (C# code)
    static string ProgramFilesx86()
    {
        if( 8 == IntPtr.Size 
            || (!String.IsNullOrEmpty(Environment.GetEnvironmentVariable("PROCESSOR_ARCHITEW6432"))))
        {
            return Environment.GetEnvironmentVariable("ProgramFiles(x86)");
        }

        return Environment.GetEnvironmentVariable("ProgramFiles");
    }
   */
  /**
   * Returns the full path of x86 IE on all windows platforms
   */
  get iePath()
  {
    function getProgFx86()
    {
      let env = Cc["@mozilla.org/process/environment;1"].getService(Ci.nsIEnvironment);
      let progf = env.get(Utils.is64bit ? "ProgramFiles(x86)" : "ProgramFiles");
      if (progf) return progf;
      // fallback to mozilla solution
      return Services.dirsvc.get("ProgF", Ci.nsIFile).path;
    }
    let path = getProgFx86() + "\\Internet Explorer\\iexplore.exe";
    
    Object.defineProperty(Utils, "iePath", { get: function() path });
    return path;
  },
  
  get systemPath()
  {
    let path = Services.dirsvc.get("SysD", Ci.nsIFile).path;
    Object.defineProperty(Utils, "systemPath", { get: function() path });
    return path;
  },
  
  /**
   * Get system DPI scaling, useful for setting zoom levels
   */
  get DPIScaling()
  {
    let domWindowUtils = Utils.getChromeWindow().QueryInterface(Ci.nsIInterfaceRequestor)
                         .getInterface(Ci.nsIDOMWindowUtils);
    let scaling = domWindowUtils.screenPixelsPerCSSPixel || 1;
    
    // Will not change before user logs off...
    Object.defineProperty(Utils, "DPIScaling", { get: function() scaling });
    return scaling;
  },

  /**
   * Retrieves a string from global.properties string bundle, will throw if string isn't found.
   * 
   * @param {String} name  string name
   * @return {String}
   */
  getString: function(name)
  {
    let stringBundle = Cc["@mozilla.org/intl/stringbundle;1"].getService(Ci.nsIStringBundleService).createBundle("chrome://fireie/locale/global.properties");
    Utils.getString = function(name)
    {
      return stringBundle.GetStringFromName(name);
    }
    return Utils.getString(name);
  },

  /**
   * Shows an alert message like window.alert() but with a custom title.
   * 
   * @param {Window} parentWindow  parent window of the dialog (can be null)
   * @param {String} message  message to be displayed
   * @param {String} [title]  dialog title, default title will be used if omitted
   */
  alert: function(parentWindow, message, title)
  {
    if (!title) title = Utils.getString("default_dialog_title");
    Services.prompt.alert(parentWindow, title, message);
  },

  /**
   * Asks the user for a confirmation like window.confirm() but with a custom title.
   * 
   * @param {Window} parentWindow  parent window of the dialog (can be null)
   * @param {String} message  message to be displayed
   * @param {String} [title]  dialog title, default title will be used if omitted
   * @return {Bool}
   */
  confirm: function(parentWindow, message, title)
  {
    if (!title) title = Utils.getString("default_dialog_title");
    return Services.prompt.confirm(parentWindow, title, message);
  },

  /**
   * Retrieves the window for a document node.
   * @return {Window} will be null if the node isn't associated with a window
   */
  getWindow: function( /**Node*/ node)
  {
    if ("ownerDocument" in node && node.ownerDocument) node = node.ownerDocument;

    if ("defaultView" in node) return node.defaultView;

    return null;
  },

  /**
   * If the window doesn't have its own security context (e.g. about:blank or
   * data: URL) walks up the parent chain until a window is found that has a
   * security context.
   */
  getOriginWindow: function( /**Window*/ wnd) /**Window*/
  {
    while (wnd != wnd.parent)
    {
      let uri = Utils.makeURI(wnd.location.href);
      if (uri.spec != "about:blank" && uri.spec != "moz-safe-about:blank" && !Utils.netUtils.URIChainHasFlags(uri, Ci.nsIProtocolHandler.URI_INHERITS_SECURITY_CONTEXT))
      {
        break;
      }
      wnd = wnd.parent;
    }
    return wnd;
  },

  get containerUrl()
  {
    return "chrome://fireie/content/container.xhtml?url=";
  },

  get browserUrl()
  {
    return "chrome://browser/content/browser.xul";
  },
  
  get hiddenWindowUrl()
  {
    return "resource://gre-resources/hiddenWindow.html";
  },
  
  get switchJumperUrl()
  {
    return "chrome://fireie/content/switchJumper.xhtml?url=";
  },
  
  get fakeUrl()
  {
    return "chrome://fireie/content/fake.html?url=";
  },
  
  /** Whether url is IE engine container url */
  isIEEngine: function(url)
  {
    return Utils.startsWith(url, Utils.containerUrl);
  },
  
  isSwitchJumper: function(url)
  {
    return Utils.startsWith(url, Utils.switchJumperUrl);
  },
  
  isFake: function(url)
  {
    return Utils.startsWith(url, Utils.fakeUrl);
  },
  
  toPrefixedUrl: function(url, prefix)
  {
    url = url.trim();
    return prefix + encodeURIComponent(url);
  },

  fromPrefixedUrl: function(url, prefix)
  {
    url = url.trim();
    if (url.substr(0, prefix.length) == prefix)
      url = decodeURIComponent(url.substring(prefix.length));
    return url;
  },
  
  fromAnyPrefixedUrl: function(url)
  {
    const prefixes = [Utils.containerUrl, Utils.switchJumperUrl, Utils.fakeUrl];
    for (let i = 0, l = prefixes.length; i < l; i++)
    {
      let prefix = prefixes[i];
      if (Utils.startsWith(url, prefix))
        return Utils.fromPrefixedUrl(url, prefix);
    }
    return url;
  },
  
  isPrefixedUrl: function(url)
  {
    const prefixes = [Utils.containerUrl, Utils.switchJumperUrl, Utils.fakeUrl];
    return prefixes.some(function(prefix) Utils.startsWith(url, prefix));
  },
  
  /** Converts URL into IE Engine URL */
  toContainerUrl: function(url)
  {
    return Utils.toPrefixedUrl(url, Utils.containerUrl);
  },

  /** Get real URL from Plugin URL */
  fromContainerUrl: function(url)
  {
    return Utils.fromPrefixedUrl(url, Utils.containerUrl);
  },
  
  toSwitchJumperUrl: function(url)
  {
    return Utils.toPrefixedUrl(url, Utils.switchJumperUrl);
  },
  
  fromSwitchJumperUrl: function(url)
  {
    return Utils.fromPrefixedUrl(url, Utils.switchJumperUrl);
  },
  
  toFakeUrl: function(url)
  {
    return Utils.toPrefixedUrl(url, Utils.fakeUrl);
  },
  
  fromFakeUrl: function(url)
  {
    return Utils.fromPrefixedUrl(url, Utils.fakeUrl);
  },
  
  convertToIEURL: function(fxURL)
  {
    let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);
    Cu.import(baseURL.spec + "WinPathURI.jsm");
    
    Utils.convertToIEURL = function(fxURL)
    {
      if (!/^file:\/\/.*/.test(fxURL))
        return fxURL;
      
      let idxQ = fxURL.indexOf("?"), idxH = fxURL.indexOf("#");
      let idx = idxQ === -1 ? idxH : (idxH === -1 ? idxQ : Math.min(idxQ, idxH));
      if (idx === -1) idx = fxURL.length;
      let queryAndHash = fxURL.substring(idx);
      
      let ieURL = WinPathURI.convertToIEFileURI(fxURL.substring(0, idx));
      return ieURL && (ieURL + queryAndHash);
    };
    
    return Utils.convertToIEURL(fxURL);
  },
  
  convertToFxURL: function(ieURL)
  {
    let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);
    Cu.import(baseURL.spec + "WinPathURI.jsm");
    
    Utils.convertToFxURL = function(ieURL)
    {
      if (!/^file:\/\/.*/.test(ieURL))
        return ieURL;
      
      let idxQ = ieURL.indexOf("?"), idxH = ieURL.indexOf("#");
      let idx = idxQ === -1 ? idxH : (idxH === -1 ? idxQ : Math.min(idxQ, idxH));
      if (idx === -1) idx = ieURL.length;
      let queryAndHash = ieURL.substring(idx);
      
      let fxURL = WinPathURI.convertToFxFileURI(ieURL.substring(0, idx));
      return fxURL && fxURL + queryAndHash;
    };
    
    return Utils.convertToFxURL(ieURL);
  },

  get containerPluginId()
  {
    return "fireie-object";
  },

  get utilsPluginId()
  {
    return "fireie-utils-object";
  },

  get statusBarId()
  {
    return "xp-status-bar";
  },
  
  convertToUTF8: function(data)
  {
    try
    {
      data = decodeURI(data);
    }
    catch (e)
    {
      function getDefaultCharset()
      {
        if (Services.prefs.prefHasUserValue("intl.charset.default"))
        {
          return Services.prefs.getCharPref("intl.charset.default");
        }
        else
        {
          let strBundle = Cc["@mozilla.org/intl/stringbundle;1"].getService(Ci.nsIStringBundleService);
          var intlMess = strBundle.createBundle("chrome://global-platform/locale/intl.properties");
          try
          {
            return intlMess.GetStringFromName("intl.charset.default");
          }
          catch (e)
          {
            return null;
          }
        }
      }
      let charset = getDefaultCharset();
      if (charset)
      {
        let uc = Cc["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Ci.nsIScriptableUnicodeConverter);
        try
        {
          uc.charset = charset;
          data = uc.ConvertToUnicode(unescape(data));
          data = decodeURI(data);
        }
        catch (e)
        {
          Utils.ERROR(e);
        }
        uc.Finish();
      }
    }
    return data;
  },

  getTabAttributeJSON: function(tab, name)
  {
    let attrString = tab.getAttribute(name);
    if (!attrString)
    {
      return null;
    }

    try
    {
      let json = JSON.parse(attrString);
      return json;
    }
    catch (ex)
    {
      Utils.ERROR(ex);
    }
    return null;
  },

  setTabAttributeJSON: function(tab, name, value)
  {
    let attrString = JSON.stringify(value);
    tab.setAttribute(name, attrString);
  },

  getChromeWindow: function()
  {
    let chromeWin = Services.wm.getMostRecentWindow("navigator:browser");
    return chromeWin;
  },
  
  getChromeWindowFrom: function(window)
  {
    let mainWindow = window.QueryInterface(Ci.nsIInterfaceRequestor)
                           .getInterface(Ci.nsIWebNavigation)
                           .QueryInterface(Ci.nsIDocShellTreeItem)
                           .rootTreeItem
                           .QueryInterface(Ci.nsIInterfaceRequestor)
                           .getInterface(Ci.nsIDOMWindow); 
    return mainWindow;
  },
  
  getTabFromDocument: function(doc)
  {
    let aBrowser = Utils.getChromeWindowFrom(doc.defaultView).gBrowser;
    if (!aBrowser.getBrowserIndexForDocument) return null;
    try
    {
      let targetBrowserIndex = aBrowser.getBrowserIndexForDocument(doc);

      if (targetBrowserIndex != -1)
        return aBrowser.tabContainer.childNodes[targetBrowserIndex];
      else
        return null;
    }
    catch (err)
    {
      return null;
    }
  },
  
  getTabFromWindow: function(win)
  {
    function getRootWindow(win)
    {
      for (; win; win = win.parent)
      {
        if (!win.parent || win == win.parent || !(win.parent instanceof Ci.nsIDOMWindow)) return win;
      }

      return null;
    }
    let aWindow = getRootWindow(win);

    if (!aWindow || !aWindow.document) return null;

    return Utils.getTabFromDocument(aWindow.document);
  },
  
  isRootWindow: function(win)
  {
    return !win.parent || win == win.parent || !(win.parent instanceof Ci.nsIDOMWindow);
  },
  
  generatorFromEnumerator: function(enumerator, nsInterface)
  {
    while (enumerator.hasMoreElements())
    {
      yield enumerator.getNext().QueryInterface(nsInterface);
    }
  },
  
  getTabFromBrowser: function(browser)
  {
    function getTabFromBrowserWithinWindow(browser, window)
    {
      let gBrowser = window.gBrowser;
      if (gBrowser)
      {
        let mTabs = gBrowser.mTabContainer.childNodes;
        for (let i = 0; i < mTabs.length; i++)
        {
          if (mTabs[i].linkedBrowser === browser)
          {
            return mTabs[i];
          }
        }
      }
      return null;
    }
    
    let windows = Utils.generatorFromEnumerator(Services.wm.getEnumerator("navigator:browser"),
      Ci.nsIDOMWindow);
    for (let window in windows)
    {
      let tab = getTabFromBrowserWithinWindow(browser, window);
      if (tab) return tab;
    }
    return null;
  },

  /** Check whether URL is firefox-only
   *  e.g. about:config chrome://xxx
   */
  isFirefoxOnly: function(url)
  {
    url = url.trim();
    return (url &&
      (
       Utils.startsWith(url, 'about:') ||
       Utils.startsWith(url, 'view-source:') ||
       Utils.startsWith(url, 'jar:') ||
       Utils.startsWith(url, 'chrome://') ||
       Utils.startsWith(url, 'resource://') ||
       Utils.startsWith(url, 'wyciwyg://')
      ));
  },
  
  /**
   * Check whether URL in Firefox has chrome privilege
   * This is to prevent potential XCS privilege escalation
   */
  urlHasChromePrivilege: function(url)
  {
    url = url.trim();
    return (url &&
      (
       Utils.startsWith(url, 'about:') ||
       Utils.startsWith(url, 'jar:') ||
       Utils.startsWith(url, 'chrome://') ||
       Utils.startsWith(url, 'resource://')
      ));
  },

  /**
   * If a protocol using nested URIs like jar: is used - retrieves innermost
   * nested URI.
   */
  unwrapURL: function( /**nsIURI or String*/ url) /**nsIURI*/
  {
    if (!(url instanceof Ci.nsIURI)) url = Utils.makeURI(url);

    if (url instanceof Ci.nsINestedURI) return url.innermostURI;
    else return url;
  },

  /**
   * Translates a string URI into its nsIURI representation, will return null for
   * invalid URIs.
   */
  makeURI: function( /**String*/ url, /**Boolean*/ silent) /**nsIURI*/
  {
    try
    {
      url = url.trim();
      if (!/^[\w\-]+:/.test(url))
      {
        url = "http://" + url;
      }
      return Services.io.newURI(url, null, null);
    }
    catch (e)
    {
      if (!silent)
        Utils.ERROR(e + ": " + url);
      return null;
    }
  },

  isValidUrl: function(url)
  {
    return !!url && Utils.makeURI(url, true) != null;
  },

  isValidDomainName: function(domainName)
  {
    return /^[0-9a-zA-Z]+[0-9a-zA-Z\.\_\-]*\.[0-9a-zA-Z\_\-]+$/.test(domainName);
  },
  
  urlCanHandle: function(url)
  {
    // A URL can be handled if it is
    // 1. a valid URL
    // 2. if consists only of host, must be a valid domain name
    // 3. not firefox only
    if (Utils.isFirefoxOnly(url))
      return false;

    let uri = Utils.makeURI(url, true);
    if (!uri)
      return false;
    
    return url !== uri.host || Utils.isValidDomainName(url);
  },

  fuzzyUrlCompare: function(url1, url2)
  {
    let uri1 = Utils.makeURI(url1, true);
    let uri2 = Utils.makeURI(url2, true);
    return (uri1 && uri2 && uri1.specIgnoringRef === uri2.specIgnoringRef);
  },
  
  escapeURLForCSS: function(url)
  {
    return url.replace(/[(),\s'"]/g, "\$&");
  },

  /**
   * Extracts the hostname from a URL (might return null).
   */
  getHostname: function( /**String*/ url) /**String*/
  {
    try
    {
      url = url.replace(/^\s+/g, "").replace(/\s+$/g, "");
      if (!/^[\w\-]+:/.test(url))
      {
        url = "http://" + url;
      }
      return Utils.unwrapURL(url).host;
    }
    catch (e)
    {
      return null;
    }
  },
  getEffectiveHost: function( /**String*/ url) /**String*/
  {
    // Cache the eTLDService if this is our first time through
    var _eTLDService = Cc["@mozilla.org/network/effective-tld-service;1"].getService(Ci.nsIEffectiveTLDService);
    var _IDNService = Cc["@mozilla.org/network/idn-service;1"].getService(Ci.nsIIDNService);
    this.getEffectiveHost = function(u)
    {
      let hostname = this.getHostname(u);
      try {
        let baseDomain = _eTLDService.getBaseDomainFromHost(hostname);
        return _IDNService.convertToDisplayIDN(baseDomain, {});
      } catch (e) {
        // If something goes wrong (e.g. hostname is an IP address) just fail back
        // to the full domain.
        return hostname;
      }
    };
    return this.getEffectiveHost(url);
  },
  startsWith: function(s, prefix)
  {
    if (s) return s.substring(0, prefix.length) == prefix;
    else return false;
  },
  endsWith: function(s, suffix)
  {
    if (s) return s.substring(s.length - suffix.length) == suffix;
    else return false;
  },

  /**
   * Posts an action to the event queue of the current thread to run it
   * asynchronously. Any additional parameters to this function are passed
   * as parameters to the callback.
   */
  runAsync: function( /**Function*/ callback, /**Object*/ thisPtr)
  {
    let params = Array.prototype.slice.call(arguments, 2);
    let runnable = {
      run: function()
      {
        callback.apply(thisPtr, params);
      }
    };
    Services.tm.currentThread.dispatch(runnable, Ci.nsIEventTarget.DISPATCH_NORMAL);
  },
  
  /**
   * Posts an action to the event queue of the current thread to run it
   * asynchronously, after a specified timeout. (Just like setTimeout)
   * Any additional parameters to this function are passed as parameters
   * to the callback.
   */
  runAsyncTimeout: function( /**Function*/ callback, /**Object*/ thisPtr, /**Number*/ timeout) /**nsITimer*/
  {
    let params = Array.prototype.slice.call(arguments, 3);
    let event = {
      notify: function(timer)
      {
        this.removeOneItem(this._timers, timer);
        callback.apply(thisPtr, params);
      }.bind(this)
    };
    let timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    timer.initWithCallback(event, timeout, Ci.nsITimer.TYPE_ONE_SHOT);
    this._timers.push(timer);
    return timer;
  },
  
  /**
   * Cancels previous runAsyncTimeout operation
   */
  cancelAsyncTimeout: function( /**nsITimer*/ timer)
  {
    if (timer)
    {
      timer.cancel();
      this.removeOneItem(this._timers, timer);
    }
  },

  /**
   * Gets the DOM window associated with a particular request (if any).
   */
  getRequestWindow: function( /**nsIChannel*/ channel) /**nsIDOMWindow*/
  {
    try
    {
      if (channel.notificationCallbacks) return channel.notificationCallbacks.getInterface(Ci.nsILoadContext).associatedWindow;
    }
    catch (e)
    {}

    try
    {
      if (channel.loadGroup && channel.loadGroup.notificationCallbacks) return channel.loadGroup.notificationCallbacks.getInterface(Ci.nsILoadContext).associatedWindow;
    }
    catch (e)
    {}

    return null;
  },
  
  /**
   * Gets the XUL <browser> associated with a particular request (if any).
   */
  getRequestBrowser: function( /**nsIChannel*/ channel) /**nsIDOMWindow*/
  {
    try
    {
      let loadContext = null;
      if (channel.notificationCallbacks) 
        loadContext = channel.notificationCallbacks.getInterface(Ci.nsILoadContext);
      else if (channel.loadGroup && channel.loadGroup.notificationCallbacks)
        loadContext = channel.loadGroup.notificationCallbacks.getInterface(Ci.nsILoadContext);
      
      if (loadContext)
      {
        if (loadContext.topFrameElement && loadContext.topFrameElement.localName === "browser")
          return loadContext.topFrameElement;
        
        let window = loadContext.associatedWindow;
        return Utils.getTabFromWindow(window).linkedBrowser;
      }
    }
    catch (e)
    {}

    return null;
  },

  /**
   * Retrieves the platform-dependent line break string.
   */
  getLineBreak: function()
  {
    // HACKHACK: Gecko doesn't expose NS_LINEBREAK, try to determine
    // plattform's line breaks by reading prefs.js
    let lineBreak = "\n";
    try
    {
      let prefFile = Services.dirsvc.get("PrefF", Ci.nsIFile);
      let inputStream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
      inputStream.init(prefFile, 0x01, 0444, 0);

      let scriptableStream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
      scriptableStream.init(inputStream);
      let data = scriptableStream.read(1024);
      scriptableStream.close();

      if (/(\r\n?|\n\r?)/.test(data)) lineBreak = RegExp.$1;
    }
    catch (e)
    {}

    Utils.getLineBreak = function() lineBreak;
    return lineBreak;
  },

  /**
   * Generates rule subscription checksum.
   *
   * @param {Array of String} lines rule subscription lines (with checksum line removed)
   * @return {String} checksum or null
   */
  generateChecksum: function(lines)
  {
    let stream = null;
    try
    {
      // Checksum is an MD5 checksum (base64-encoded without the trailing "=") of
      // all lines in UTF-8 without the checksum line, joined with "\n".
      let converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Ci.nsIScriptableUnicodeConverter);
      converter.charset = "UTF-8";
      stream = converter.convertToInputStream(lines.join("\n"));

      let hashEngine = Cc["@mozilla.org/security/hash;1"].createInstance(Ci.nsICryptoHash);
      hashEngine.init(hashEngine.MD5);
      hashEngine.updateFromStream(stream, stream.available());
      return hashEngine.finish(true).replace(/=+$/, "");
    }
    catch (e)
    {
      return null;
    }
    finally
    {
      if (stream) stream.close();
    }
  },

  /**
   * Opens rule preferences dialog or focuses an already open dialog.
   * @param {Rule} [rule]  rule to be selected
   */
  openRulesDialog: function(rule)
  {
    var dlg = Services.wm.getMostRecentWindow("fireie:rules");
    if (dlg)
    {
      try
      {
        dlg.focus();
      }
      catch (e)
      {}
      dlg.SubscriptionActions.selectRule(rule);
    }
    else
    {
      Services.ww.openWindow(null, "chrome://fireie/content/rules.xul", "_blank", "chrome,centerscreen,resizable,dialog=no", {
        wrappedJSObject: rule
      });
    }
  },
  
  /**
   * Opens Fire IE options dialog or focuses an already open dialog.
   */
  openOptionsDialog: function()
  {
    let wnd = Services.wm.getMostRecentWindow("fireie:options");
    if (wnd) wnd.focus();
    else
    {
      Services.ww.openWindow(null, "chrome://fireie/content/options2.xul", "_blank", "chrome,titlebar,toolbar,centerscreen,dialog=yes", {
        wrappedJSObject: {
          openFromUtils: true
        }
      });
    }
  },
    
  /**
   * Attempts to find a browser window for opening a URL
   */
  findAnyBrowserWindow: function()
  {
    let enumerator = Services.wm.getZOrderDOMWindowEnumerator(null, true);
    while (enumerator.hasMoreElements())
    {
      let window = enumerator.getNext();
      if (window.gBrowser && window.gBrowser.addTab)
      {
        return window;
      }
    }
    return null;
  },
  
  /**
   * Attempts to find a browser object for opening a URL
   */
  findAnyBrowser: function()
  {
    let window = Utils.findAnyBrowserWindow();
    if (window)
      return window.gBrowser;
    return null;
  },

  /**
   * Opens a URL in the browser window. If browser window isn't passed as parameter,
   * this function attempts to find a browser window.
   */
  loadInBrowser: function( /**String*/ url, /**Browser*/ browser)
  {
    let gBrowser = browser || Utils.findAnyBrowser();

    if (gBrowser)
    {
      gBrowser.selectedTab = gBrowser.addTab(url);
    }
    else
    {
      // open a new window and try again
      win = Services.ww.openWindow(null, Utils.browserUrl, null, null, null);
      win.addEventListener("load", function()
      {
        Utils.runAsyncTimeout(Utils.loadInBrowser, Utils, 100, url, win.gBrowser);
      });
    }
  },

  /**
   * Opens a pre-defined documentation link in the browser window. This will
   * send the UI language to fireie.org so that the correct language
   * version of the page can be selected.
   */
  loadDocLink: function( /**String*/ linkID, /**Browser*/ browser)
  {
    let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);
    Cu.import(baseURL.spec + "Prefs.jsm");

    let availableLanguages = JSON.parse(Prefs.doc_link_languages);
    let link = Prefs.documentation_link.replace(/%LINK%/g, linkID).replace(/%LANG%/g,
      Utils.appLocale in availableLanguages ? availableLanguages[Utils.appLocale]
                                            : availableLanguages["default"]);
    Utils.loadInBrowser(link, browser);
  },
  
  /**
   * Opens the Add-ons Manager to the specified addons:// URL. If browser window isn't
   * passed as parameter, this function attempts to find a browser window.
   */
  openAddonsMgr: function( /**String*/ url, /**BrowserWindow*/ window)
  {
    let win = window || Utils.findAnyBrowserWindow();
    
    if (win)
    {
      win.BrowserOpenAddonsMgr(url);
    }
    else
    {
      // open a new window and try again
      win = Services.ww.openWindow(null, Utils.browserUrl, null, null, null);
      win.addEventListener("load", function()
      {
        Utils.runAsyncTimeout(Utils.openAddonsMgr, Utils, 100, url, win);
      });
    }
  },

  /**
   * Formats a unix time according to user's locale.
   * @param {Integer} time  unix time in milliseconds
   * @return {String} formatted date and time
   */
  formatTime: function(time)
  {
    try
    {
      let date = new Date(time);
      return Utils.dateFormatter.FormatDateTime("", Ci.nsIScriptableDateFormat.dateFormatShort, Ci.nsIScriptableDateFormat.timeFormatNoSeconds, date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds());
    }
    catch (e)
    {
      // Make sure to return even on errors
      Cu.reportError(e);
      return "";
    }
  },

  /**
   * Tries to interpret a file path as an absolute path or a path relative to
   * user's profile. Returns a file or null on failure.
   */
  resolveFilePath: function( /**String*/ path) /**nsIFile*/
  {
    if (!path) return null;

    try
    {
      // Assume an absolute path first
      let file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(path);
      return file;
    }
    catch (e)
    {}

    try
    {
      // Try relative path now
      let profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile);
      let file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.setRelativeDescriptor(profileDir, path);
      return file;
    }
    catch (e)
    {}

    return null;
  },

  /**
   * Checks whether any of the prefixes listed match the application locale,
   * returns matching prefix if any.
   */
  checkLocalePrefixMatch: function( /**String*/ prefixes) /**String*/
  {
    if (!prefixes) return null;

    let appLocale = Utils.appLocale;
    for each(let prefix in prefixes.split(/,/))
    if (new RegExp("^" + prefix + "\\b").test(appLocale)) return prefix;

    return null;
  },

  /**
   * Chooses the best rule subscription for user's language.
   */
  chooseRuleSubscription: function( /**NodeList*/ subscriptions) /**Node*/
  {
    let selectedItem = null;
    let selectedPrefix = null;
    let matchCount = 0;
    for (let i = 0; i < subscriptions.length; i++)
    {
      let subscription = subscriptions[i];
      if (!selectedItem) selectedItem = subscription;

      let prefix = Utils.checkLocalePrefixMatch(subscription.getAttribute("prefixes"));
      if (prefix)
      {
        if (!selectedPrefix || selectedPrefix.length < prefix.length)
        {
          selectedItem = subscription;
          selectedPrefix = prefix;
          matchCount = 1;
        }
        else if (selectedPrefix && selectedPrefix.length == prefix.length)
        {
          matchCount++;

          // If multiple items have a matching prefix of the same length:
          // Select one of the items randomly, probability should be the same
          // for all items. So we replace the previous match here with
          // probability 1/N (N being the number of matches).
          if (Math.random() * matchCount < 1)
          {
            selectedItem = subscription;
            selectedPrefix = prefix;
          }
        }
      }
    }
    return selectedItem;
  },
  // runs the callback function after the addon version is obtained
  fireWithAddonVersion: function(callback)
  {
    if (_addonVersion != null)
      callback(_addonVersion);
    else
      _addonVersionCallbacks.push(callback);
  },
  // truncate string if it's too long
  saturateString: function(str, length)
  {
    if (str.length > length)
      str = str.substring(0, length - 3) + "...";
    return str;
  },
  /**
   * Use the hidden window for utils plugin
   */
  getHiddenWindow: function()
  {
    let hiddenWindow = Cc["@mozilla.org/appshell/appShellService;1"]
               .getService(Ci.nsIAppShellService)
               .hiddenDOMWindow;
    this.getHiddenWindow = function() hiddenWindow;
    return hiddenWindow;
  },
  
  // Removes the first occurance of item in arr
  removeOneItem: function(arr, item)
  {
    let idx = arr.indexOf(item);
    if (idx != -1)
      arr.splice(idx, 1);
  },
  
  // Removes all occurances of item in arr
  removeAllItems: function(arr, item)
  {
    let idx = arr.indexOf(item);
    while (idx != -1)
    {
      arr.splice(idx, 1);
      idx = arr.indexOf(item);
    }
  },
  
  shouldLoadInBackground: function()
  {
    try
    {
      return Services.prefs.getBoolPref("browser.tabs.loadInBackground");
    }
    catch (ex)
    {
      return true;
    }
  },
  
  addVisitHistory: function(url, title)
  {
    // See http://hg.mozilla.org/mozilla-central/annotate/81dd97739fa1/browser/base/content/test/head.js#l200
    var asyncHistory = Cc["@mozilla.org/browser/history;1"].getService(Ci.mozIAsyncHistory);
    this.addVisitHistory = function(url, title)
    {
      let placeInfo = {
        uri: this.makeURI(url),
        title: (title || url),
        visits: [{
          transitionType: Ci.nsINavHistoryService.TRANSITION_LINK,
          visitDate: Date.now() * 1000,
          refererURI: null
        }]
      };
      asyncHistory.updatePlaces(placeInfo);
    };
    return this.addVisitHistory(url, title);
  },
  
  _doThrottledUpdate: function(update, updateFunc, thisPtr)
  {
    update.delaying = false;
    if (update.scheduled)
    {
      update.scheduled = false;
      update.updating = true;
      try
      {
        updateFunc.call(thisPtr);
      }
      finally
      {
        update.updating = false;
        update.delaying = true;
        update.scheduled = false;
        Utils.runAsyncTimeout(this._doThrottledUpdate, this, 100,
                              update, updateFunc, thisPtr);
      }
    }
  },
  
  // Schedule throttled (no 2 updates shall happen in 100 ms) updates
  scheduleThrottledUpdate: function(updateFunc, thisPtr)
  {
    // Fetch the corresponding update object
    let thisPtrUpdates = this._throttledUpdates.get(thisPtr);
    if (!thisPtrUpdates)
      this._throttledUpdates.set(thisPtr, thisPtrUpdates = new WeakMap());
    let update = thisPtrUpdates.get(updateFunc);
    if (!update)
      thisPtrUpdates.set(updateFunc, update = {});
    
    // Do schedule
    if (update.updating || update.scheduled)
      return;
    
    update.scheduled = true;
    if (!update.delaying)
      Utils.runAsync(this._doThrottledUpdate, this,
                     update, updateFunc, thisPtr);
  },
  
  // launch process with specified arguments
  launchProcess: function(exePath, args, description)
  {
    description = description || exePath;
    var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(exePath);
    if (!file.exists()) {
      Utils.ERROR("Cannot launch " + description + ", file not found: " + exePath);
      return;
    }
    var process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
    try {
      process.init(file);
      process.runw(false, args, args.length);
    }
    catch (ex) {
      Utils.ERROR("Cannot launch " + description + ", process creation failed: " + ex);
    }
  },
  
  // create an object with the desired prototype and own enumerable properties
  createObjectWithPrototype: function(proto, props)
  {
    let obj = Object.create(proto);
    [].forEach.call(Object.keys(props), function(key)
    {
      let desc = Object.getOwnPropertyDescriptor(props, key);
      if (desc !== undefined)
        Object.defineProperty(obj, key, desc);
    });
    return obj;
  }
};

/**
 * Set the value of preference "extensions.logging.enabled" to false to hide
 * Utils.LOG message
 */
["LOG", "WARN", "ERROR"].forEach(function(aName)
{
  XPCOMUtils.defineLazyGetter(Utils, aName, function()
  {
    let jsm = {};
    try
    {
      Cu.import("resource://gre/modules/AddonLogging.jsm", jsm);
      if (!jsm.LogManager)
        throw "LogManager not found in resource://gre/modules/AddonLogging.jsm";
    }
    catch (e)
    {
      // Nightly 20140225
      Cu.import("resource://gre/modules/addons/AddonLogging.jsm", jsm);
      if (!jsm.LogManager)
        throw "LogManager not found in resource://gre/modules/(addons/)AddonLogging.jsm";
    }
    let logger = {};
    jsm.LogManager.getLogger("[fireie]", logger);
    return logger[aName];
  });
});

// Get the addon's version
AddonManager.getAddonByID(Utils.addonID, function(addon)
{
  _addonVersion = addon.version;
  _addonVersionCallbacks.forEach(function(callback)
  {
    callback(_addonVersion);
  });
  _addonVersionCallbacks = null;
});

XPCOMUtils.defineLazyServiceGetter(Utils, "clipboard", "@mozilla.org/widget/clipboard;1", "nsIClipboard");
XPCOMUtils.defineLazyServiceGetter(Utils, "clipboardHelper", "@mozilla.org/widget/clipboardhelper;1", "nsIClipboardHelper");
XPCOMUtils.defineLazyServiceGetter(Utils, "categoryManager", "@mozilla.org/categorymanager;1", "nsICategoryManager");
XPCOMUtils.defineLazyServiceGetter(Utils, "chromeRegistry", "@mozilla.org/chrome/chrome-registry;1", "nsIXULChromeRegistry");
XPCOMUtils.defineLazyServiceGetter(Utils, "netUtils", "@mozilla.org/network/util;1", "nsINetUtil");
XPCOMUtils.defineLazyServiceGetter(Utils, "dateFormatter", "@mozilla.org/intl/scriptabledateformat;1", "nsIScriptableDateFormat");
