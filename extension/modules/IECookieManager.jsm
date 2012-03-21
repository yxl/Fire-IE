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


/**
 * BOOL InternetSetCookie(
 * in LPCTSTR lpszUrl,
 * in LPCTSTR lpszCookieName,
 * in LPCTSTR lpszCookieData
 * );
 */
let InternetSetCookieW = null;

// NULL pointer
const NULL = 0;

/**
 *  DWORD WINAPI GetLastError(void)
 */
let GetLastError = null;


/**
 * Monitors the cookie changes of Firefox and synchronizes to IE.
 * @class
 */
let IECookieManager = {
  wininetDll: null,
  kernel32Dll: null,
  _ieCookieMap: {},
  
  /**
   * Called on module startup.
   */
  startup: function()
  {
    // User jsctypes to load the window api of InternetSetCookieW
    this._loadInternetSetCookieW();

    // Change the default cookie and cache directories of the IE, which will
    // be restored when the cookie plugin is loaded.
    this._changeIETempDirectorySetting();

    CookieObserver.register();
  },

  shutdown: function()
  {
    this._unloadInternetSetCookieW();
    CookieObserver.unregister();
  },
  
  saveFirefoxCookie: function(url, cookieHeader)
  {
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
        return null;
      }
      let cookieName = header.substring(0, seperate).trim();
      let cookieValue = header.substring(seperate + 1, terminate).trim();
      return {name: cookieName, vlaue: cookieValue};
    }  

    // Leaves a mark about this cookie received from IE to avoid sync it back to IE.
    let {name, value} = getNameValueFromCookieHeader(cookieHeader);   
    this._ieCookieMap[name] = value;
    
    Services.cookies.setCookieString(Utils.makeURI(url), null, header, null);  
  },

  saveIECookie: function(cookie2)
  {
    let cookieValue = cookie2.value;
    
    // If the cookie is received from IE, does not sync it back
    let valueInMap = this._ieCookieMap[cookie2.name] || null;
    if (valueInMap && valueInMap == cookieValue)
    {
      this._ieCookieMap[cookie2.name] = undefined;
      return;
    }
    
    let hostname = cookie2.host.trim();
    // 去除hostname开头的“.”
    if (hostname.substring(0, 1) == ".")
    {
      hostname = hostname.substring(1);
    }
    /* URL格式必须正确, 否则无法成功设置Cookie。
     * http://.baidu.com必须转换为
     * http://baidu.com才能识别
     */
    let url = 'http://' + hostname + cookie2.path;
    let cookieData = cookie2.name + "=" + cookieValue + "; domain=" + cookie2.host + "; path=" + cookie2.path;
    if (cookie2.expires > 1)
    {
      cookieData += "; expires=" + this._getExpiresString(cookie2.expires);
    }
    if (cookie2.isHttpOnly)
    {
      //cookieData +="; httponly";
    }
    let ret = InternetSetCookieW(url, NULL, cookieData); 
    if (!ret)
    {
      let errCode = GetLastError();
      Utils.ERROR('InternetSetCookieW failed with ERROR ' + errCode + ' url:' + url + ' data:' + cookieData);
    }
  },

  deleteIECookie: function(cookie2)
  {
    // @todo 是否需要删除IE中的cookie?
  },

  clearAllIECookies: function()
  {
    // @todo 
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
        ctypes.int32_t, /*LPCTSTR lpszCookieName. As we need pass NULL to this parameter, we use type int32_t instead*/
        ctypes.jschar.ptr /*LPCTSTR lpszCookieData*/ ); 
      }      
    }
    catch (e)
    {
      Utils.ERROR(e);
    }
    
    try
    {
      this.kernel32Dll = ctypes.open("kernel32.dll");
      if (this.kernel32Dll)
      {
        GetLastError = this.kernel32Dll.declare("GetLastError",
                                        WinABI,
                                        ctypes.uint32_t);
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
    if (this.kernel32Dll)
    {
      this.kernel32Dll.close();
      this.kernel32Dll = null;
    }
  },

  _changeIETempDirectorySetting: function()
  {
    const wrk = Cc["@mozilla.org/windows-registry-key;1"].createInstance(Ci.nsIWindowsRegKey);
    const SUB_KEY = "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders";

    function getIECtrlRegString(regName)
    {
      try
      {
        wrk.create(wrk.ROOT_KEY_CURRENT_USER, SUB_KEY, wrk.ACCESS_ALL);
        if (!wrk.hasValue(regName)) return null;
        let value = wrk.readStringValue(regName);
        wrk.close();
        return value;
      }
      catch (e)
      {
        Utils.ERROR(e);
        return null;
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
    }

    let profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile).path;

    let originalCookies = getIECtrlRegString("Cookies");
    // Backup the cookie directory setting if needed.
    if (getIECtrlRegString("Cookies_fireie") || setIECtrlRegString("Cookies_fireie", originalCookies))
    {
      setIECtrlRegString("Cookies", profileDir + "\\fireie\\cookies");
    }

    let originalCache = getIECtrlRegString("Cache");
    // Backup the cache directory setting if needed.
    if (getIECtrlRegString("Cache_fireie") || setIECtrlRegString("Cache_fireie", originalCache))
    {
      setIECtrlRegString("Cache", profileDir + "\\fireie\\cache");
    }
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
    Services.obs.addObserver(this, "fireie-set-cookie", false);  
  },

  unregister: function()
  {
    Services.obs.removeObserver(this, "cookie-changed");
    Services.obs.removeObserver(this, "fireie-set-cookie");    
  },

  // nsIObserver
  observe: function(subject, topic, data)
  {
    switch (topic)
    {
    case 'cookie-changed':
      this.onFirefoxCookieChanged(subject, data);
      break;
    case 'fireie-set-cookie':
      this.onIECookieChanged(data);
      break;
    }
  },

  onFirefoxCookieChanged: function(subject, data)
  {
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
      Utils.LOG('[CookieObserver batch-deleted] ' + cookieArray.length + ' cookie(s)');
      for (let i = 0; i < cookieArray.length; i++)
      {
        let cookie = cookieArray.queryElementAt(i, Ci.nsICookie2);
        IECookieManager.deleteIECookie(cookie);
        this.logFirefoxCookie(data, cookie);
      }
      break;
    case 'cleared':
      Utils.LOG('[CookieObserver cleared]');
      IECookieManager.clearAllIECookies();
      break;
    case 'reload':
      Utils.LOG('[CookieObserver reload]');
      IECookieManager.clearAllIECookies();
      break;
    }
  },
  
  onIECookieChanged: function(data)
  {
    try
    {
      let {url, header} = JSON.parse(data);
      IECookieManager.saveFirefoxCookie(url, header);
    }
    catch(e)
    {
      Utils.ERROR(e);
    }
  },

  logFirefoxCookie: function(tag, cookie2)
  {
    // Don't log!
    return;
    Utils.LOG('[CookieObserver ' + tag + "] host:" + cookie2.host + " path:" + cookie2.path + " name:" + cookie2.name + " value:" + cookie2.value + " expires:" + new Date(cookie2.expires * 1000).toGMTString() + " isHttpOnly:" + cookie2.isHttpOnly + " isSession:" + cookie2.isSession);
  }
};