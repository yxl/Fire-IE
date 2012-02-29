/* ***** BEGIN LICENSE BLOCK *****
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 * ***** END LICENSE BLOCK ***** */
let jsm = {};
Components.utils.import("resource://fireie/fireieUtils.jsm", jsm);
Components.utils.import("resource://gre/modules/Services.jsm", jsm);
Components.utils.import("resource://gre/modules/ctypes.jsm", jsm);

let {fireieUtils, Services, ctypes} = jsm;

/**
 * @namespace
 */
if (typeof(FireIE) == "undefined") {
  var FireIE = {};
}

/**
 * http://forums.mozillazine.org/viewtopic.php?f=23&t=2059667
 * anfilat2: 
 * ctypes.winapi_abi works in Firefox 32bit version only and it don't works in
 * 64bit.
 * ctypes.default_abi is more universal, but don't works in 32bit callback functions.
 */
let CallBackABI = ctypes.stdcall_abi;
let WinABI = ctypes.winapi_abi;
if (ctypes.size_t.size == 8) {
  CallBackABI = ctypes.default_abi;
  WinABI = ctypes.default_abi;
}

let wininetDll = ctypes.open("Wininet.dll");

/**
 * BOOL InternetSetCookie(
 * in LPCTSTR lpszUrl,
 * in LPCTSTR lpszCookieName,
 * in LPCTSTR lpszCookieData
 * );
 */
let InternetSetCookieW = wininetDll.declare('InternetSetCookieW',
    WinABI,
    ctypes.int32_t,            // BOOL
    ctypes.jschar.ptr,  // LPCTSTR lpszUrl
    ctypes.jschar.ptr,  // LPCTSTR lpszCookieName
    ctypes.jschar.ptr   // LPCTSTR lpszCookieData
);

FireIE.IECookieManager = {
  saveCookie: function(cookie2) {
    let hostname = cookie2.host.trim();
    // 去除hostname开头的“.”
    if (hostname.substring(0, 1) == ".") {
      hostname = hostname.substring(1);
    }
    /* URL格式必须正确, 否则无法成功设置Cookie。
     * http://.baidu.com必须转换为
     * http://baidu.com才能识别
     */
    let url = 'http://' + hostname + cookie2.path;
    let cookieName = ""; // cookieName不能为null
    let cookieData = cookie2.name + "=" + cookie2.value +
      "; domain=" + cookie2.host + 
      "; path=" + cookie2.path;
    if (cookie2.expires > 1) {
      cookieData += "; expires=" + this.getExpiresString(cookie2.expires);
    }
    let ret = InternetSetCookieW(url, cookieName, cookieData);
    if (!ret) {
      fireieUtils.ERROR('InternetSetCookieW failed! url:' + url + ' name:'+ cookieName + ' data:' + cookieData);
    }
    return ret;
  },
  
  deleteCookie: function(cookie2) {
    throw "Not implemented!";
  },
  
  getExpiresString: function(expiresInSeconds) {
    // Convert expires seconds to date string of the format "Tue, 28 Feb 2012 17:14:26 GMT"
    let dateString = new Date(expiresInSeconds * 1000).toGMTString();
    // Convert "Tue, 28 Feb 2012 17:14:26 GMT" to "Tue, 28-Feb-2012 17:14:26 GMT"
    return dateString.substr(0, 7) + '-' + dateString.substr(8, 3) + '-' + dateString.substr(12);
  }
};

FireIE.CookieObserver = {
  register: function() {
    Services.obs.addObserver(this, "cookie-changed", false);
  },
  
  unregister: function() {
    Services.obs.removeObserver(this, "cookie-changed");
  },
  
  // nsIObserver
  observe: function(subject, topic, data) {
    switch (topic) {
      case 'cookie-changed':
        this.onCookieChanged(subject, data);
        break;
      }
  },
  
  onCookieChanged: function(subject, data) {
    let cookie = (subject instanceof Components.interfaces.nsICookie2) ? subject.QueryInterface(Components.interfaces.nsICookie2) : null;
    let cookieArray = (subject instanceof Components.interfaces.nsIArray) ? subject.QueryInterface(Components.interfaces.nsIArray) : null;
    switch(data) {
      case 'deleted':
        this.logCookie(data, cookie);
        break;
      case 'added':
        this.logCookie(data, cookie);
        FireIE.IECookieManager.saveCookie(cookie);
        break;
      case 'changed':
        this.logCookie(data, cookie);
        FireIE.IECookieManager.saveCookie(cookie);
        break;
      case 'batch-deleted':
        fireieUtils.LOG('[logCookie batch-deleted] ' + cookieArray.length + ' cookie(s)');
        for (let i=0; i<cookieArray.length; i++) {
          let cookie = cookieArray.queryElementAt(i, Components.interfaces.nsICookie2);
          this.logCookie(data, cookie);
        }
        break;
      case 'cleared':
        fireieUtils.LOG('[logCookie cleared]');
        break;
      case 'reload':
        fireieUtils.LOG('[logCookie reload]');
        break;
    }
  },
    
  logCookie: function(tag, cookie2) {
    fireieUtils.LOG('[logCookie ' + tag + "] host:" + cookie2.host + " path:" + cookie2.path +
                    " name:" + cookie2.name + " value:" + cookie2.value +
                    " expires:" + new Date(cookie2.expires*1000).toGMTString() + " isHttpOnly:" + cookie2.isHttpOnly +
                    " isSession:" + cookie2.isSession);
  }
};