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
 * @fileOverview Firefox cookies observer, will synchronize Firefox cookie to IE.
 */

let EXPORTED_SYMBOLS = ["IECookieManager"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/ctypes.jsm");

Cu.import(baseURL.spec + "Utils.jsm");
Cu.import(baseURL.spec + "Prefs.jsm");
Cu.import(baseURL.spec + "WinMutex.jsm");

/**
 * BOOL InternetSetCookie(
 * in LPCTSTR lpszUrl,
 * in LPCTSTR lpszCookieName,
 * in LPCTSTR lpszCookieData
 * );
 */
let InternetSetCookieW = null;

/**
 * DWORD InternetSetCookieEx(
 * in  LPCTSTR lpszURL,
 * in  LPCTSTR lpszCookieName,
 * in  LPCTSTR lpszCookieData,
 * in  DWORD dwFlags,
 * in  DWORD_PTR dwReserved
 * );
 */
let InternetSetCookieExW = null;

/**
 * BOOL InternetSetOptionW(
 * in  HINTERNET hInternet,
 * in  DWORD dwOption,
 * in  LPVOID lpBuffer,
 * in  DWORD dwBufferLength
 * );
 */
 let InternetSetOptionW = null;

// NULL pointer
const NULL = 0;

const INTERNET_COOKIE_HTTPONLY = 0x00002000;
const INTERNET_OPTION_END_BROWSER_SESSION = 42;

const wrk = Cc["@mozilla.org/windows-registry-key;1"].createInstance(Ci.nsIWindowsRegKey);
const SUB_KEY = "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders";

const cookieSvc = Cc["@mozilla.org/cookieService;1"].getService(Ci.nsICookieService);

// use a system-wide mutex to protect the process of changing IE temp dir
let mutex = null;
const MUTEX_TIMEOUT = 10000;

function getIECtrlRegString(regName)
{
  try
  {
    wrk.create(wrk.ROOT_KEY_CURRENT_USER, SUB_KEY, wrk.ACCESS_ALL);
    if (!wrk.hasValue(regName)) return null;
    let value = wrk.readStringValue(regName);
    return value;
  }
  catch (e)
  {
    Utils.ERROR(e);
    return null;
  }
  finally
  {
    wrk.close();
  }
}

function setIECtrlRegString(regName, value)
{
  try
  {
    wrk.create(wrk.ROOT_KEY_CURRENT_USER, SUB_KEY, wrk.ACCESS_ALL);
    wrk.writeStringValue(regName, value);
    return true;
  }
  catch (e)
  {
    Utils.ERROR(e);
    return false;
  }
  finally
  {
    wrk.close();
  }
}

function removeIECtrlRegString(regName)
{
  try
  {
    wrk.create(wrk.ROOT_KEY_CURRENT_USER, SUB_KEY, wrk.ACCESS_ALL);
    wrk.removeValue(regName);
    return true;
  }
  catch (e)
  {
    Utils.ERROR(e);
    return false;
  }
  finally
  {
    wrk.close();
  }
}

function getNameValueFromCookieHeader(header)
{
  header = header.trim();
  let terminate = header.indexOf(";");
  if (terminate == -1)
  {
    terminate = header.length;
  }
  let seperate = header.indexOf("=");
  if (seperate == -1 || seperate > terminate)
  {
    return {name: null, value: null};
  }
  let cookieName = header.substring(0, seperate).trim();
  let cookieValue = header.substring(seperate + 1, terminate).trim();
  return {name: cookieName, value: cookieValue};
}

/**
 * Monitors the cookie changes of Firefox and synchronizes to IE.
 * @class
 */
let IECookieManager = {
  wininetDll: null,
  _ieCookieMap: {},
  _bTmpDirChanged: false,
  
  /**
   * Called on module startup.
   */
  startup: function()
  {
    try
    {
      mutex = new WinMutex("fireie@fireie.org::IECookieManager");
    }
    catch (ex)
    {
      Utils.ERROR("Failed to create mutex: " + ex);
    }
    
    // User jsctypes to load the window api of InternetSetCookieW
    this._loadInternetSetCookieW();

    CookieObserver.register();
  },

  shutdown: function()
  {
    this._unloadInternetSetCookieW();
    CookieObserver.unregister();
    
    mutex.close();
  },
  
  saveFirefoxCookie: function(url, cookieHeader)
  {
    // Leaves a mark about this cookie received from IE to avoid sync it back to IE.
    let {name, value} = getNameValueFromCookieHeader(cookieHeader);   
    this._ieCookieMap[name] = value;
    
    // Uses setCookieStringFromHttp instead of setCookieString to allow httponly flag. 
    let uri = Utils.makeURI(url);
    cookieSvc.setCookieStringFromHttp(uri, uri, null, cookieHeader, "", null);
  },

  saveIECookie: function(cookie2)
  {  
    // If the cookie is received from IE, do not sync it back
    let valueInMap = this._ieCookieMap[cookie2.name] || null;
    if (valueInMap !== null && valueInMap === cookie2.value)
    {
      this._ieCookieMap[cookie2.name] = undefined;
        return;
    }
    
    let hostname = cookie2.host.trim();
    // Strip off beginning dot in hostname
    if (hostname.substring(0, 1) == ".")
    {
      hostname = hostname.substring(1);
    }
    
    // Might be a private-browsing warning cookie, ignore it
    if (hostname == "fireie")
      return;
    
    /* The URL format must be correct or set cookie will fail
     * http://.baidu.com must be transformed into
     * http://baidu.com before it can be recognized
     */
    let url = (cookie2.isSecure ? 'https://' : 'http://') + hostname + cookie2.path;
    let cookieData = cookie2.name + "=" + cookie2.value + "; domain=" + cookie2.host + "; path=" + cookie2.path;
    if (cookie2.expires > 0)
    {
      cookieData += "; expires=" + this._getExpiresString(cookie2.expires);
    }
    if (cookie2.isSecure)
    {
      cookieData += "; secure";
    }
    if (cookie2.isHttpOnly)
    {
      cookieData +="; httponly";
    }
    let ret = InternetSetCookieW(url, null, cookieData); 
    if (!ret)
    {
      let ret = InternetSetCookieExW(url, null, cookieData, INTERNET_COOKIE_HTTPONLY, NULL);
      if (!ret)
      {
        let errCode = ctypes.winLastError || 0;
        Utils.LOG('InternetSetCookieExW failed with ERROR ' + errCode + ' url:' + url + ' data:' + cookieData);
      }
    }
  },

  deleteIECookie: function(cookie2)
  {
    let cookie = {};
    cookie.name = cookie2.name;
    cookie.value = cookie2.value;
    cookie.host = cookie2.host;
    cookie.path = cookie2.path;
    cookie.expires = 1;
    cookie.isHttpOnly = cookie2.isHttpOnly;
    this.saveIECookie(cookie);
  },

  clearAllIECookies: function()
  {
    Services.obs.notifyObservers(null, "fireie-clear-cookies", null);
  },

  clearIESessionCookies: function()
  {
    // Clear session cookies by ending the current browser session
    // http://msdn.microsoft.com/en-us/library/windows/desktop/aa385328%28v=vs.85%29.aspx
    let ret = InternetSetOptionW(null, INTERNET_OPTION_END_BROWSER_SESSION, null, 0);
    if (!ret)
    {
      let errCode = ctypes.winLastError || 0;
      Utils.LOG("InternetSetOptionW failed with ERROR " + errCode);
    }
  },
  
  _loadInternetSetCookieW: function()
  {
    /**
     * http://forums.mozillazine.org/viewtopic.php?f=23&t=2059667
     * anfilat2: 
     * ctypes.winapi_abi works in Firefox 32bit version only and it don't works in
     * 64bit.
     * ctypes.default_abi is more universal, but don't works in 32bit callback functions.
     */
    let CallBackABI = ctypes.stdcall_abi;
    let WinABI = ctypes.winapi_abi;
    if (ctypes.size_t.size == 8)
    {
      CallBackABI = ctypes.default_abi;
      WinABI = ctypes.default_abi;
    }
    try
    {
      this.wininetDll = ctypes.open("Wininet.dll");
      if (this.wininetDll)
      {
        InternetSetCookieW = this.wininetDll.declare('InternetSetCookieW', WinABI, ctypes.int32_t, /*BOOL*/
        ctypes.jschar.ptr, /*LPCTSTR lpszUrl*/
        ctypes.jschar.ptr, /*LPCTSTR lpszCookieName*/
        ctypes.jschar.ptr  /*LPCTSTR lpszCookieData*/ );
        
        InternetSetCookieExW = this.wininetDll.declare('InternetSetCookieExW', WinABI, ctypes.int32_t, /*BOOL*/
        ctypes.jschar.ptr, /*LPCTSTR lpszUrl*/
        ctypes.jschar.ptr, /*LPCTSTR lpszCookieName*/
        ctypes.jschar.ptr, /*LPCTSTR lpszCookieData*/
        ctypes.uint32_t,   /*DWORD dwFlags*/
        ctypes.int32_t     /*DWORD_PTR dwReserved*/);
        
        InternetSetOptionW = this.wininetDll.declare('InternetSetOptionW', WinABI, ctypes.int32_t, /*BOOL*/
        ctypes.voidptr_t,  /*HINTERNET hInternet*/
        ctypes.uint32_t,   /*DWORD dwOption*/
        ctypes.voidptr_t,  /*LPVOID lpBuffer*/
        ctypes.uint32_t    /*DWORD dwBufferLength*/);
      }
    }
    catch (e)
    {
      Utils.ERROR(e);
    }
  },

  _unloadInternetSetCookieW: function()
  {
    if (this.wininetDll)
    {
      this.wininetDll.close();
      this.wininetDll = null;
    }
  },

  acquireMutex: function()
  {
    try
    {
      let ret = mutex.acquire(MUTEX_TIMEOUT);
      if (!ret)
        throw "timed out";
      return ret;
    }
    catch (ex)
    {
      Utils.ERROR("Failed to acquire mutex: " + ex);
      return false;
    }
  },
  
  releaseMutex: function()
  {
    try
    {
      mutex.release();
    }
    catch (ex)
    {
      Utils.ERROR("Failed to release mutex: " + ex);
    }
  },
  
  changeIETempDirectorySetting: function()
  {
    // safe guard: do not attempt to change after already changed
    if (this._bTmpDirChanged) return;
    
    // do not attempt to do anything if mutex is not acquired
    if (!this.acquireMutex()) return;
    
    let ieTempDir = Utils.ieTempDir;
    let cookiesDir = ieTempDir + "\\cookies";
    let cacheDir = ieTempDir + "\\cache";

    // Temporary disable cookie folder redirection for IE10
    // For details, see issue #98 (https://github.com/yxl/Fire-IE/issues/98)
    if (Utils.ieMajorVersion < 10)
    {
      let originalCookies = getIECtrlRegString("Cookies");
      // Backup the cookie directory setting if needed.
      if (getIECtrlRegString("Cookies_fireie") || setIECtrlRegString("Cookies_fireie", originalCookies))
      {
        setIECtrlRegString("Cookies", cookiesDir);
      }
    }

    let originalCache = getIECtrlRegString("Cache");
    // Backup the cache directory setting if needed.
    if (getIECtrlRegString("Cache_fireie") || setIECtrlRegString("Cache_fireie", originalCache))
    {
      setIECtrlRegString("Cache", cacheDir);
    }
    
    this._bTmpDirChanged = true;
  },
  
  restoreIETempDirectorySetting: function()
  {
    if (!this._bTmpDirChanged) return;
  
    let cookies = getIECtrlRegString("Cookies_fireie");
    if (cookies)
    {
      // Remove backup values to allow user change IE browser's cache directory settings
      setIECtrlRegString("Cookies", cookies);
      removeIECtrlRegString("Cookies_fireie");
    }
    let cache = getIECtrlRegString("Cache_fireie");
    if (cache)
    {
      setIECtrlRegString("Cache", cache);
      removeIECtrlRegString("Cache_fireie");
    }

    this._bTmpDirChanged = false;
    this.releaseMutex();
  },

  _getExpiresString: function(expiresInSeconds)
  {
    // Convert expires seconds to date string of the format "Tue, 28 Feb 2012 17:14:26 GMT"
    let dateString = new Date(expiresInSeconds * 1000).toGMTString();
    // Convert "Tue, 28 Feb 2012 17:14:26 GMT" to "Tue, 28-Feb-2012 17:14:26 GMT"
    return dateString.substr(0, 7) + '-' + dateString.substr(8, 3) + '-' + dateString.substr(12);
  }
};

let CookieObserver = {
  
  register: function()
  {
    Services.obs.addObserver(this, "cookie-changed", false);
    Services.obs.addObserver(this, "private-cookie-changed", false);
    Services.obs.addObserver(this, "fireie-clear-cookies", false);
    Services.obs.addObserver(this, "fireie-set-cookie", false);
    Services.obs.addObserver(this, "fireie-batch-set-cookie", false);
  },

  unregister: function()
  {
    Services.obs.removeObserver(this, "cookie-changed");
    Services.obs.removeObserver(this, "private-cookie-changed");
    Services.obs.removeObserver(this, "fireie-clear-cookies");
    Services.obs.removeObserver(this, "fireie-set-cookie");
    Services.obs.removeObserver(this, "fireie-batch-set-cookie");
  },

  // nsIObserver
  observe: function(subject, topic, data)
  {
    switch (topic)
    {
    case 'cookie-changed':
      this.onFirefoxCookieChanged(subject, data);
      break;
    case 'private-cookie-changed':
      this.onFirefoxPrivateCookieChanged(subject, data);
      break;
    case 'fireie-clear-cookies':
      IECookieManager.clearIESessionCookies();
      break;
    case 'fireie-set-cookie':
      this.onIECookieChanged(data);
      break;
    case 'fireie-batch-set-cookie':
      this.onIEBatchCookieChanged(data);
      break;
    }
  },

  onFirefoxCookieChanged: function(subject, data)
  {
    if (!Prefs.cookieSyncEnabled) return;
    
    let cookie = (subject instanceof Ci.nsICookie2) ? subject.QueryInterface(Ci.nsICookie2) : null;
    let cookieArray = (subject instanceof Ci.nsIArray) ? subject.QueryInterface(Ci.nsIArray) : null;
    switch (data)
    {
    case 'deleted':
      this.logFirefoxCookie(data, cookie);
      IECookieManager.deleteIECookie(cookie);
      break;
    case 'added':
      this.logFirefoxCookie(data, cookie);
      IECookieManager.saveIECookie(cookie);
      break;
    case 'changed':
      this.logFirefoxCookie(data, cookie);
      IECookieManager.saveIECookie(cookie);
      break;
    case 'batch-deleted':
      if (Prefs.logCookies)
        Utils.LOG('[CookieObserver batch-deleted] ' + cookieArray.length + ' cookie(s)');
      for (let i = 0; i < cookieArray.length; i++)
      {
        let cookie = cookieArray.queryElementAt(i, Ci.nsICookie2);
        IECookieManager.deleteIECookie(cookie);
        this.logFirefoxCookie(data, cookie);
      }
      break;
    case 'cleared':
      if (Prefs.logCookies)
        Utils.LOG('[CookieObserver cleared]');
      IECookieManager.clearAllIECookies();
      break;
    case 'reload':
      if (Prefs.logCookies)
        Utils.LOG('[CookieObserver reload]');
      IECookieManager.clearAllIECookies();
      break;
    }
  },
  
  onFirefoxPrivateCookieChanged: function(subject, data)
  {
    // delegate to normal cookie handler
    this.onFirefoxCookieChanged(subject, data);
  },
  
  onIECookieChanged: function(data)
  {
    try
    {
      let {header, url} = JSON.parse(data);
      IECookieManager.saveFirefoxCookie(url, header);
    }
    catch(e)
    {
      Utils.ERROR("onIECookieChanged(" + data + "): " + e);
    }
  },

  onIEBatchCookieChanged: function(data)
  {
    try
    {
      let cookies = JSON.parse(data);
      cookies.forEach(function(cookie)
      {
        let {header, url} = cookie;
        IECookieManager.saveFirefoxCookie(url, header);
      });
    }
    catch(e)
    {
      Utils.ERROR("onIEBatchCookieChanged(" + data + "): " + e);
    }
  },

  logFirefoxCookie: function(tag, cookie2)
  {
    if (!Prefs.logCookies) return;
    
    Utils.LOG('[CookieObserver ' + tag + "] host:" + cookie2.host + " path:" + cookie2.path + " name:" + cookie2.name + " value:" + cookie2.value + " expires:" + new Date(cookie2.expires * 1000).toGMTString() + " isSecure:" + cookie2.isSecure + " isHttpOnly:" + cookie2.isHttpOnly + " isSession:" + cookie2.isSession);
  }
};
