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

/**
 * Provides a bunch of utility functions.
 * @class
 */
var Utils = {
  _ieUserAgent: null,

  /**
   * Returns the add-on ID used by Adblock Plus
   */
  get addonID()
  {
    return "fireie@yxl.name";
  },

  /**
   * Returns the installed Fire-IE version
   */
  get addonVersion()
  {
    return _addonVersion;
  },

  /**
   * Returns the VCS revision used for this Adblock Plus build
   */
  get addonBuild()
  {
    let build = "3394";
    return (build[0] == "{" ? "" : build);
  },

  /**
   * Returns ID of the application
   */
  get appID()
  {
    let id = Services.appinfo.ID;
    Utils.__defineGetter__("appID", function() id);
    return Utils.appID;
  },

  /**
   * Returns the user interface locale selected for adblockplus chrome package.
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
    Utils.__defineGetter__("appLocale", function() locale);
    return Utils.appLocale;
  },

  /**
   * Returns version of the Gecko platform
   */
  get platformVersion()
  {
    let platformVersion = Services.appinfo.platformVersion;
    Utils.__defineGetter__("platformVersion", function() platformVersion);
    return Utils.platformVersion;
  },

  get ieUserAgent()
  {
    return Utils._ieUserAgent;
  },

  set ieUserAgent(value)
  {
    Utils._ieUserAgent = value;
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

  /** 将URL转换为IE Engine URL */
  toContainerUrl: function(url)
  {
    if (Utils.startsWith(url, Utils.containerUrl)) return url;
    if (/^file:\/\/.*/.test(url))
    {
      try
      {
        url = decodeURI(url).replace(/\|/g, ":");
      }
      catch (e)
      {}
    }
    return Utils.containerUrl + encodeURI(url);
  },

  /** 从Plugin URL中提取实际访问的URL */
  fromContainerUrl: function(url)
  {
    if (url && url.length > 0)
    {
      url = url.replace(/^\s+/g, "").replace(/\s+$/g, "");
      if (/^file:\/\/.*/.test(url)) url = url.replace(/\|/g, ":");
      if (url.substr(0, Utils.containerUrl.length) == Utils.containerUrl)
      {
        url = decodeURI(url.substring(Utils.containerUrl.length));

        if (!/^[\w]+:/.test(url))
        {
          url = "http://" + url;
        }
      }
    }
    return url;
  },

  get containerPluginId()
  {
    return "fireie-object";
  },

  get cookiePluginId()
  {
    return "fireie-cookie-object";
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
          let strBundle = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService);
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
        let uc = Cc["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
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

  getTabFromDocument: function(doc)
  {
    let aBrowser = Utils.getChromeWindow().gBrowser;
    if (!aBrowser.getBrowserIndexForDocument) return null;
    try
    {
      let tab = null;
      let targetBrowserIndex = aBrowser.getBrowserIndexForDocument(doc);

      if (targetBrowserIndex != -1)
      {
        tab = aBrowser.tabContainer.childNodes[targetBrowserIndex];
        return tab;
      }
    }
    catch (err)
    {
      Utils.ERROR(err);
    }
    return null;
  },

  getTabFromWindow: function(win)
  {
    function getRootWindow(win)
    {
      for (; win; win = win.parent)
      {
        if (!win.parent || win == win.parent || !(win.parent instanceof Components.interfaces.nsIDOMWindow)) return win;
      }

      return null;
    }
    let aWindow = getRootWindow(win);

    if (!aWindow || !aWindow.document) return null;

    return Utils.getTabFromDocument(aWindow.document);
  },

  /** 检查URL地址是否是火狐浏览器特有
   *  例如 about:config chrome://xxx
   */
  isFirefoxOnly: function(url)
  {
    url = url.trim();
    return (url && (url.length > 0) && ((Utils.startsWith(url, 'about:') && url != "about:blank") || Utils.startsWith(url, 'chrome://')));
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
  makeURI: function( /**String*/ url) /**nsIURI*/
  {
    //try
    {
      return Services.io.newURI(url, null, null);
    }
    //catch (e)
    {
      Utils.ERROR(e + ": " + url);
      return null;
    }
  },

  isValidUrl: function(url)
  {
    return Utils.makeURI(url) != null;
  },

  isValidDomainName: function(domainName)
  {
    return /^[0-9a-zA-Z]+[0-9a-zA-Z\.\_\-]*\.[0-9a-zA-Z\_\-]+$/.test(domainName);
  },

  /**
   * Extracts the hostname from a URL (might return null).
   */
  getHostname: function( /**String*/ url) /**String*/
  {
    try
    {
      return Utils.unwrapURL(url).host;
    }
    catch (e)
    {
      return null;
    }
  },

  startsWith: function(s, prefix)
  {
    if (s) return ((s.substring(0, prefix.length) == prefix));
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
    var dlg = Services.wm.getMostRecentWindow("abp:rules");
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
      Services.ww.openWindow(null, "chrome://adblockplus/content/ui/rules.xul", "_blank", "chrome,centerscreen,resizable,dialog=no", {
        wrappedJSObject: rule
      });
    }
  },

  /**
   * Opens a URL in the browser window. If browser window isn't passed as parameter,
   * this function attempts to find a browser window. If an event is passed in
   * it should be passed in to the browser if possible (will e.g. open a tab in
   * background depending on modifiers keys).
   */
  loadInBrowser: function( /**String*/ url)
  {
    let window = null;

    let enumerator = Services.wm.getZOrderDOMWindowEnumerator(null, true);
    while (enumerator.hasMoreElements())
    {
      window = enumerator.getNext().QueryInterface(Ci.nsIDOMWindow);
      let cookieObject = window.document.getElementById(Utils.cookiePluginId);
      if (cookieObject)
      {
        window.focus();
        break;
      }
    }

    if (window)
    {
      window.addTab(url);
    }
    else
    {
      let protocolService = Cc["@mozilla.org/uriloader/external-protocol-service;1"].getService(Ci.nsIExternalProtocolService);
      protocolService.loadURI(Utils.makeURI(url), null);
    }
  },

  /**
   * Opens a pre-defined documentation link in the browser window. This will
   * send the UI language to adblockplus.org so that the correct language
   * version of the page can be selected.
   */
  loadDocLink: function( /**String*/ linkID)
  {
    let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);
    Cu.import(baseURL.spec + "Prefs.jsm");

    let link = Prefs.documentation_link.replace(/%LINK%/g, linkID).replace(/%LANG%/g, Utils.appLocale);
    Utils.loadInBrowser(link);
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
      let file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
      file.initWithPath(path);
      return file;
    }
    catch (e)
    {}

    try
    {
      // Try relative path now
      let profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile);
      let file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
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
    Components.utils.import("resource://gre/modules/AddonLogging.jsm");
    let logger = {};
    LogManager.getLogger("[fireie]", logger);
    return logger[aName];
  });
});

// Get the addon's version
AddonManager.getAddonByID(Utils.addonID, function(addon)
{
  _addonVersion = addon.version;
});

XPCOMUtils.defineLazyServiceGetter(Utils, "clipboard", "@mozilla.org/widget/clipboard;1", "nsIClipboard");
XPCOMUtils.defineLazyServiceGetter(Utils, "clipboardHelper", "@mozilla.org/widget/clipboardhelper;1", "nsIClipboardHelper");
XPCOMUtils.defineLazyServiceGetter(Utils, "categoryManager", "@mozilla.org/categorymanager;1", "nsICategoryManager");
XPCOMUtils.defineLazyServiceGetter(Utils, "chromeRegistry", "@mozilla.org/chrome/chrome-registry;1", "nsIXULChromeRegistry");
XPCOMUtils.defineLazyServiceGetter(Utils, "netUtils", "@mozilla.org/network/util;1", "nsINetUtil");
XPCOMUtils.defineLazyServiceGetter(Utils, "dateFormatter", "@mozilla.org/intl/scriptabledateformat;1", "nsIScriptableDateFormat");