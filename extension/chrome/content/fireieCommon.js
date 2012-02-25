/* ***** BEGIN LICENSE BLOCK *****
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 * ***** END LICENSE BLOCK ***** */
 
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://fireie/fireieUtils.jsm");

 /**
 * @namespace
 */
var FireIE = FireIE || {};

FireIE.containerUrl = "chrome://fireie/content/container.xhtml?url=";
FireIE.navigateParamsAttr = "fireieNavigateParams";
FireIE.objectID = "fireie-object";

FireIE.isValidURL = function (url) {
  var b = false;
  try {
    const ios = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
    var uri = ios.newURI(url, null, null);
    b = true;
  } catch (e) {fireieUtils.ERROR(e)}
  return b;
}

FireIE.isValidDomainName = function (domainName) {
  return /^[0-9a-zA-Z]+[0-9a-zA-Z\.\_\-]*\.[0-9a-zA-Z\_\-]+$/.test(domainName);
}

FireIE.getChromeWindow = function () {
  return Services.wm.getMostRecentWindow("navigator:browser");
}

/**
 * 由于IE不支持Text Zoom, 只考虑Full Zoom
 */
FireIE.getZoomLevel = function () {
  var aBrowser = (typeof (gBrowser) == "undefined") ? FireIE.getChromeWindow().gBrowser : gBrowser;
  var docViewer = aBrowser.selectedBrowser.markupDocumentViewer;
  var zoomLevel = docViewer.fullZoom;
  return zoomLevel;
}

/**
 * 由于IE不支持Text Zoom, 只考虑Full Zoom
 */
FireIE.setZoomLevel = function (value) {
  var aBrowser = (typeof (gBrowser) == "undefined") ? FireIE.getChromeWindow().gBrowser : gBrowser;
  var docViewer = aBrowser.selectedBrowser.markupDocumentViewer;
  docViewer.fullZoom = value;
}



//-----------------------------------------------------------------------------
FireIE.addEventListener = function (obj, type, listener) {
  if (typeof (obj) == "string") obj = document.getElementById(obj);
  if (obj) obj.addEventListener(type, listener, false);
}
FireIE.removeEventListener = function (obj, type, listener) {
  if (typeof (obj) == "string") obj = document.getElementById(obj);
  if (obj) obj.removeEventListener(type, listener, false);
}

FireIE.addEventListenerByTagName = function (tag, type, listener) {
  var objs = document.getElementsByTagName(tag);
  for (var i = 0; i < objs.length; i++) {
    objs[i].addEventListener(type, listener, false);
  }
}
FireIE.removeEventListenerByTagName = function (tag, type, listener) {
  var objs = document.getElementsByTagName(tag);
  for (var i = 0; i < objs.length; i++) {
    objs[i].removeEventListener(type, listener, false);
  }
}

//-----------------------------------------------------------------------------
/** 替换函数部分源码 */
FireIE.hookCode = function (orgFunc, orgCode, myCode) {
  try {
    if (eval(orgFunc).toString() == eval(orgFunc + "=" + eval(orgFunc).toString().replace(orgCode, myCode))) throw orgFunc;
  } catch (e) {
    fireieUtils.ERROR("Failed to hook function: " + orgFunc);
  }
}

/** 将attribute值V替换为myFunc+V*/
FireIE.hookAttr = function (parentNode, attrName, myFunc) {
  if (typeof (parentNode) == "string") parentNode = document.getElementById(parentNode);
  try {
    parentNode.setAttribute(attrName, myFunc + parentNode.getAttribute(attrName));
  } catch (e) {
    fireieUtils.ERROR("Failed to hook attribute: " + attrName);
  }
}

/** 在Property的getter和setter代码头部增加一段代码*/
FireIE.hookProp = function (parentNode, propName, myGetter, mySetter) {
  var oGetter = parentNode.__lookupGetter__(propName);
  var oSetter = parentNode.__lookupSetter__(propName);
  if (oGetter && myGetter) myGetter = oGetter.toString().replace(/{/, "{" + myGetter.toString().replace(/^.*{/, "").replace(/.*}$/, ""));
  if (oSetter && mySetter) mySetter = oSetter.toString().replace(/{/, "{" + mySetter.toString().replace(/^.*{/, "").replace(/.*}$/, ""));
  if (!myGetter) myGetter = oGetter;
  if (!mySetter) mySetter = oSetter;
  if (myGetter) try {
    eval('parentNode.__defineGetter__(propName, ' + myGetter.toString() + ');');
  } catch (e) {
    fireieUtils.ERROR("Failed to hook property Getter: " + propName);
  }
  if (mySetter) try {
    eval('parentNode.__defineSetter__(propName, ' + mySetter.toString() + ');');
  } catch (e) {
    fireieUtils.ERROR("Failed to hook property Setter: " + propName);
  }
}

FireIE.startsWith = function (s, prefix) {
  if (s) return ((s.substring(0, prefix.length) == prefix));
  else return false;
}

FireIE.endsWith = function (s, suffix) {
  if (s && (s.length > suffix.length)) {
    return (s.substring(s.length - suffix.length) == suffix);
  } else return false;
}

//-----------------------------------------------------------------------------
FireIE.getBoolPref = function (prefName, defval) {
  var result = defval;
  var prefs = Services.prefs.getBranch("");
  if (prefs.getPrefType(prefName) == prefs.PREF_BOOL) {
    try {
      result = prefs.getBoolPref(prefName);
    } catch (e) {fireieUtils.ERROR(e)}
  }
  return (result);
}

FireIE.getIntPref = function (prefName, defval) {
  var result = defval;
  var prefs = Services.prefs.getBranch("");
  if (prefs.getPrefType(prefName) == prefs.PREF_INT) {
    try {
      result = prefs.getIntPref(prefName);
    } catch (e) {fireieUtils.ERROR(e)}
  }
  return (result);
}

FireIE.getStrPref = function (prefName, defval) {
  var result = defval;
  var prefs = Services.prefs.getBranch("");
  if (prefs.getPrefType(prefName) == prefs.PREF_STRING) {
    try {
      result = prefs.getComplexValue(prefName, Components.interfaces.nsISupportsString).data;
    } catch (e) {fireieUtils.ERROR(e)}
  }
  return (result);
}

FireIE.getDefaultStrPref = function (prefName, defval) {
  var result = defval;
  var defaults = Services.prefs.getDefaultBranch("");
  if (defaults.getPrefType(prefName) == defaults.PREF_STRING) {
    try {
      result = defaults.getCharPref(prefName);
    } catch (e) {fireieUtils.ERROR(e)}
  }
  return (result);
}
//-----------------------------------------------------------------------------
FireIE.setBoolPref = function (prefName, value) {
  var prefs = Services.prefs.getBranch("");
  try {
    prefs.setBoolPref(prefName, value);
  } catch (e) {fireieUtils.ERROR(e)}
}

FireIE.setIntPref = function (prefName, value) {
  var prefs = Services.prefs.getBranch("");
  try {
    prefs.setIntPref(prefName, value);
  } catch (e) {fireieUtils.ERROR(e)}
}

FireIE.setStrPref = function (prefName, value) {
  var prefs = Services.prefs.getBranch("");
  var sString = Components.classes["@mozilla.org/supports-string;1"].createInstance(Components.interfaces.nsISupportsString);
  sString.data = value;
  try {
    prefs.setComplexValue(prefName, Components.interfaces.nsISupportsString, sString);
  } catch (e) {fireieUtils.ERROR(e)}
}

//-----------------------------------------------------------------------------
FireIE.getDefaultCharset = function (defval) {
  var charset = this.getStrPref("extensions.fireie.intl.charset.default", "");
  if (charset.length) return charset;
  var gPrefs = Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefBranch);
  if (gPrefs.prefHasUserValue("intl.charset.default")) {
    return gPrefs.getCharPref("intl.charset.default");
  } else {
    var strBundle = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService);
    var intlMess = strBundle.createBundle("chrome://global-platform/locale/intl.properties");
    try {
      return intlMess.GetStringFromName("intl.charset.default");
    } catch (e) {
      {fireieUtils.WARN(e)}
      return defval;
    }
  }
}

FireIE.queryDirectoryService = function (aPropName) {
  try {
    var dirService = Components.classes["@mozilla.org/file/directory_service;1"].getService(Components.interfaces.nsIProperties);
    var file = dirService.get(aPropName, Components.interfaces.nsIFile);
    return file.path;
  } catch (e) {fireieUtils.ERROR(e)}

  return null;
}

FireIE.convertToUTF8 = function (data, charset) {
  try {
    data = decodeURI(data);
  } catch (e) {
    fireieUtils.WARN("convertToUTF8 faild");
    if (!charset) charset = FireIE.getDefaultCharset();
    if (charset) {
      var uc = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
      try {
        uc.charset = charset;
        data = uc.ConvertToUnicode(unescape(data));
        data = decodeURI(data);
      } catch (e) {fireieUtils.ERROR(e)}
      uc.Finish();
    }
  }
  return data;
}

FireIE.convertToASCII = function (data, charset) {
  if (!charset) charset = FireIE.getDefaultCharset();
  if (charset) {
    var uc = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
    uc.charset = charset;
    try {
      data = uc.ConvertFromUnicode(data);
    } catch (e) {
      fireieUtils.WARN("ConvertFromUnicode faild");
      data = uc.ConvertToUnicode(unescape(data));
      data = decodeURI(data);
      data = uc.ConvertFromUnicode(data);
    }
    uc.Finish();
  }
  return data;
}

//-----------------------------------------------------------------------------
FireIE.getUrlDomain = function (url) {
  var r = "";
  if (url && !FireIE.startsWith(url, "about:")) {
    if (/^file:\/\/.*/.test(url)) r = url;
    else {
      try {
        const ios = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
        var uri = ios.newURI(url, null, null);
        uri.path = "";
        r = uri.spec;
      } catch (e) {fireieUtils.ERROR(e)}
    }
  }
  return r;
}

FireIE.getUrlHost = function (url) {
  if (url && !FireIE.startsWith(url, "about:")) {
    if (/^file:\/\/.*/.test(url)) return url;
    var matches = url.match(/^([A-Za-z]+:\/+)*([^\:^\/]+):?(\d*)(\/.*)*/);
    if (matches) url = matches[2];
  }
  return url;
}
