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

let jsm = {};
Components.utils.import("resource://gre/modules/NetUtil.jsm", jsm);
Components.utils.import("resource://fireie/fireieUtils.jsm", jsm);
Components.utils.import("resource://gre/modules/Services.jsm", jsm);
let {NetUtil, fireieUtils, Services} = jsm;

/**
 * @namespace
 */
if (typeof(FireIE) == "undefined") {
  var FireIE = {};
}

function getWindowForWebProgress(webProgress) {
  try {
    if (webProgress){
      return webProgress.DOMWindow;
    }
  } catch (err) {
  }  
  return null;
}

function getWebProgressForRequest(request) {
  try {
    if (request && request.notificationCallbacks)
      return request.notificationCallbacks.getInterface(Ci.nsIWebProgress);
  } catch (err ) {
  }

  try {
    if (request && request.loadGroup && request.loadGroup.groupObserver)
      return request.loadGroup.groupObserver.QueryInterface(Ci.nsIWebProgress);
  } catch (err) {
  }
  
  return null;
};
  
function getWindowForRequest(request){
  return getWindowForWebProgress(getWebProgressForRequest(request));
}

FireIE.HttpObserver = {
  // nsISupports
  QueryInterface: function(iid) {
    if (iid.equals(Components.interfaces.nsISupports) ||
      iid.equals(Components.interfaces.nsIObserver)) {
      return this;
    }
    throw Components.results.NS_ERROR_NO_INTERFACE;
  },
  
  // nsIObserver
  observe: function(subject, topic, data) {    
    if (!(subject instanceof Components.interfaces.nsIHttpChannel))
      return;
    switch (topic) {
      case 'http-on-modify-request':
        this.onModifyRequest(subject);
        break;
      }
  },
  
  onModifyRequest: function(subject) {
    var httpChannel = subject.QueryInterface(Components.interfaces.nsIHttpChannel);
    var win = getWindowForRequest(httpChannel);
    var tab = fireieUtils.getTabFromWindow(win);
    var isWindowURI = httpChannel.loadFlags & Components.interfaces.nsIChannel.LOAD_INITIAL_DOCUMENT_URI;
    if (isWindowURI) {
      var url = httpChannel.URI.spec;
      if (this.shouldFilter(url)) {
        if (!tab.linkedBrowser) return;
        
        subject.cancel(Components.results.NS_BINDING_SUCCEEDED);
        
        // http headers
        var headers = this._getAllRequestHeaders(httpChannel);
        
        // post data
        var post = "";
        var uploadChannel = subject.QueryInterface(Components.interfaces.nsIUploadChannel);
        if (uploadChannel && uploadChannel.uploadStream) {
          var len = uploadChannel.uploadStream.available();
          post = NetUtil.readInputStreamToString(uploadChannel.uploadStream, len);
        }
        
        // 通过Tab的Attribute传送http header和post data参数
        var param = {headers: headers, post: post};
        FireIE.setTabAttributeJSON(tab, FireIE.navigateParamsAttr, param);
        
        tab.linkedBrowser.loadURI(Utils.toContainerUrl(url));
      }
    }
  },
  
  _getAllRequestHeaders: function(httpChannel) {
      var visitor = function() {
        this.headers = "";
      };
      visitor.prototype.visitHeader = function(aHeader, aValue) {
        this.headers += aHeader + ":" + aValue + "\r\n";
      };
      var v = new visitor();
      httpChannel.visitRequestHeaders(v);
      return v.headers;
  },
  
  shouldFilter: function(url) {
    if (FireIE.manualSwitchUrl && FireIE.getUrlDomain(FireIE.manualSwitchUrl) == FireIE.getUrlDomain(url)) {
      return false;
    }
    return !FireIEWatcher.isFireIEURL(url)
         && !FireIE.isFirefoxOnly(url)
         && FireIEWatcher.isFilterEnabled()
         && FireIEWatcher.isMatchFilterList(url);
  }
}

var FireIEWatcher = {
   
   isFireIEURL: function(url) {
      if (!url) return false;
      return (url.indexOf(FireIE.containerUrl) == 0);
   },

   isFilterEnabled: function() {
      return (Services.prefs.getBoolPref("extensions.fireie.filter", true));
   },

   getPrefFilterList: function() {
      var s = Services.prefs.getCharPref("extensions.fireie.filterlist", null);
      return (s ? s.split(" ") : "");
   },

   setPrefFilterList: function(list) {
      Services.prefs.setCharPref("extensions.fireie.filterlist", list.join(" "));
   },

   isMatchURL: function(url, pattern) {
      if ((!pattern) || (pattern.length==0)) return false;
      var retest = /^\/(.*)\/$/.exec(pattern);
      if (retest) {
         pattern = retest[1];
      } else {
         pattern = pattern.replace(/\\/g, "/");
         var m = pattern.match(/^(.+:\/\/+[^\/]+\/)?(.*)/);
         m[1] = (m[1] ? m[1].replace(/\./g, "\\.").replace(/\?/g, "[^\\/]?").replace(/\*/g, "[^\\/]*") : "");
         m[2] = (m[2] ? m[2].replace(/\./g, "\\.").replace(/\+/g, "\\+").replace(/\?/g, "\\?").replace(/\*/g, ".*") : "");
         pattern = m[1] + m[2];
         pattern = "^" + pattern.replace(/\/$/, "\/.*") + "$";
      }
      var reg = new RegExp(pattern.toLowerCase());
      return (reg.test(url.toLowerCase()));
   },

   isMatchFilterList: function(url) {
      var aList = this.getPrefFilterList();
      for (var i=0; i<aList.length; i++) {
         var item = aList[i].split("\b");
         var rule = item[0];
         var enabled = (item.length == 1);
         if (enabled && this.isMatchURL(url, rule)) return(true);
      }
      return(false);
   },
}
