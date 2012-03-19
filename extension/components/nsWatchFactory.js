/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is IETab. Modified In Coral IE Tab.
 *
 * The Initial Developer of the Original Code is yuoo2k <yuoo2k@gmail.com>.
 * Modified by quaful <quaful@msn.com>.
 *
 * Portions created by the Initial Developer are Copyright (C) 2006-2008
 * the Initial Developer. All Rights Reserved.
 *
 * ***** END LICENSE BLOCK ***** */
var {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components; 

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const _COBA_WATCH_CID = Components.ID('{FB0B7EA5-CF43-4470-A48B-9460B38CF37E}');
const _COBA_WATCH_CONTRACTID = "@mozilla.com.cn/coba;1";

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");


["LOG", "WARN", "ERROR"].forEach(function(aName) {
  this.__defineGetter__(aName, function() {
    Cu.import("resource://gre/modules/AddonLogging.jsm");

    LogManager.getLogger("COBA", this);
    return this[aName];
  });
}, this);

function httpGet (url, onreadystatechange) {
  var xmlHttpRequest = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
  xmlHttpRequest.QueryInterface(Ci.nsIJSXMLHttpRequest);
  xmlHttpRequest.open('GET', url, true);
  xmlHttpRequest.send(null);
  xmlHttpRequest.onreadystatechange = function() {
    onreadystatechange(xmlHttpRequest);
  };
};
   
function updateRule (timer) {
  var updateUrl = Services.prefs.getCharPref("extensions.coba.official.updateurl", null);
  if(!updateUrl)
    return;
  httpGet(updateUrl, function(response) {
    if (response.readyState == 4 && 200 == response.status) {
      var rule = response.responseText;
      if (rule) {
        Services.prefs.setCharPref("extensions.coba.official.rulelist", rule);
      }
    }
  });  
}


var watchFactoryClass = function() {
  this.wrappedJSObject = this;
}

watchFactoryClass.prototype = {
  classID: _COBA_WATCH_CID,
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                         Ci.nsISupportsWeakReference]),
  
  //cookieDir:"",
  
  observe: function (aSubject, aTopic, aData) {
    switch (aTopic) {
    case "profile-after-change":
    SetReg();
    break;
    };
  }
}

function SetIECtrlReg(regName) {
  var file = Components.classes["@mozilla.org/file/directory_service;1"].   
           getService(Components.interfaces.nsIProperties).   
           get("ProfD", Components.interfaces.nsIFile);   
  var regDir = file.path +"\\extensions\\fireie\\" + regName;
 
  let wrk = Components.classes["@mozilla.org/windows-registry-key;1"].createInstance(Components.interfaces.nsIWindowsRegKey);
  wrk.create(wrk.ROOT_KEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders", wrk.ACCESS_ALL);
  wrk.writeStringValue(regName, regDir);
  wrk.close();

}

function GetDefIECtrlReg(regName){
  let wrk = Components.classes["@mozilla.org/windows-registry-key;1"].createInstance(Components.interfaces.nsIWindowsRegKey);
  wrk.create(wrk.ROOT_KEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders", wrk.ACCESS_ALL);
  let dir = wrk.readStringValue(regName);
  wrk.close();
  LOG("Get Defualt " + regName + " dir: " + dir);
  return dir;
}

function SetReg(){
  let wrk = Components.classes["@mozilla.org/windows-registry-key;1"].createInstance(Components.interfaces.nsIWindowsRegKey);
  wrk.create(wrk.ROOT_KEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders", wrk.ACCESS_ALL);
  if(!wrk.hasValue("CookiesOld")){
      let dir = GetDefIECtrlReg("Cookies");
    wrk.writeStringValue("CookiesOld",dir);
  }
  wrk.close();
  let wrk = Components.classes["@mozilla.org/windows-registry-key;1"].createInstance(Components.interfaces.nsIWindowsRegKey);
  wrk.create(wrk.ROOT_KEY_CURRENT_USER, "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders", wrk.ACCESS_ALL);
  if(!wrk.hasValue("CacheOld")){
    let dir = GetDefIECtrlReg("Cache");
  wrk.writeStringValue("CacheOld",dir);
  }
  wrk.close();
  SetIECtrlReg("Cookies");
  SetIECtrlReg("Cache");
 }

var NSGetFactory = XPCOMUtils.generateNSGetFactory([watchFactoryClass]);