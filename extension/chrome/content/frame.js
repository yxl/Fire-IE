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

(function(global) {
  let Cc = Components.classes;
  let Ci = Components.interfaces;
  let Cr = Components.results;
  let Cu = Components.utils;

  // Don't do anything if we are not in e10s window
  if ("@fireie.org/fireie/public;1" in Cc) return;

  Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
  Components.utils.import("resource://gre/modules/Services.jsm");
  Components.utils.import("resource://fireie/ChromeBridge.jsm");
  
  let baseURL = Components.classes["@fireie.org/fireie/private;1"].getService(Components.interfaces.nsIURI);
  
  Components.utils.import(baseURL.spec + "ContentPrefs.jsm");
  Components.utils.import(baseURL.spec + "ContentProcessContentPolicy.jsm");
  Components.utils.import(baseURL.spec + "ContentUtils.jsm");
  Components.utils.import(baseURL.spec + "ContentPrefs.jsm");
  
  addEventListener("fireie:reloadContainerPage", function(event)
  {
    let containerWindow = event.target;
    if (!containerWindow instanceof Components.interfaces.nsIDOMWindow) return;
    
    let url = containerWindow.location.href;
    if (ContentUtils.isIEEngine(url))
    {
      ChromeBridge.reloadContainerPage(global);
    }
  }, false);
  
  addEventListener("fireie:requestFrameGlobal", function(event)
  {
    let detail = event.detail;
    let callback = detail.callback;
    let thisPtr = detail.thisPtr;
    let args = detail.args;
    detail.result = callback.apply(thisPtr, [global].concat(args));
  }, false);
  
  function getThemeDataFromNode(node)
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
      ContentUtils.ERROR(e);
      return defValue;
    }
    return themeData;
  }
  
  function browserThemeEventHandler(event)
  {
    let node = event.target;
    if (!node) return;
    let doc = node.ownerDocument;
    if (!doc) return;
    let url = doc.location.href;
    let host = ContentUtils.getEffectiveHost(url);
    let allow = JSON.parse(Prefs.allowedThemeHosts).some(function(h) h == host);
    if (!allow)
    {
      ContentUtils.LOG("Blocked theme request: untrusted site (" + host + ")");
      return;
    }
    
    let themeData = getThemeDataFromNode(node);
    ChromeBridge.handleThemeRequest(global, event.type, themeData);
    
    if (event.type === "InstallBrowserTheme")
    {
      Object.defineProperty(event.detail, "installed", {
        value: true,
        writable: false,
        enumerable: true,
        configurable: false
      });
    }
  }
  
  addEventListener("InstallBrowserTheme", browserThemeEventHandler, false, true);
  addEventListener("PreviewBrowserTheme", browserThemeEventHandler, false, true);
  addEventListener("ResetBrowserThemePreview", browserThemeEventHandler, false, true);
})(this);
