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
let FireIEContainer = {};

(function() {
  let Cc = Components.classes;
  let Ci = Components.interfaces;
  let Cr = Components.results;
  let Cu = Components.utils;

  let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);
  let jsm = {};
  Cu.import(baseURL.spec + "Utils.jsm", jsm);
  Cu.import(baseURL.spec + "Prefs.jsm", jsm);
  Cu.import(baseURL.spec + "Favicon.jsm", jsm);
  Components.utils.import("resource://gre/modules/Services.jsm", jsm);
  let
  {
    Utils, Prefs, Favicon, Services
  } = jsm;

  /**
   * Shortcut for document.getElementById(id)
   */
  function E(id)
  {
    return document.getElementById(id);
  }

  function init()
  {
	window.removeEventListener("load", init, false);
	
    let container = E('container');
    if (!container)
    {
      Utils.ERROR('Cannot find container to insert fireie-object.');
      return;
    }
    if (Prefs.privateBrowsing)
    {
      container.innerHTML = '<iframe src="PrivateBrowsingWarning.xhtml" width="100%" height="100%" frameborder="no" border="0" marginwidth="0" marginheight="0" scrolling="no" allowtransparency="yes"></iframe>';
    }
    else
    {
      container.innerHTML = '<embed id="fireie-object" type="application/fireie" style="width:100%; height:100%;" />';
      registerEventHandler();
    }
  }

  function destory()
  {
	window.removeEventListener("unload", destory, false);
	
	unregisterEventHandler();	
  }

  function getNavigateParam(name)
  {
    let headers = "";
    let tab = Utils.getTabFromDocument(document);
    let navigateParams = Utils.getTabAttributeJSON(tab, "fireieNavigateParams");
    if (navigateParams && typeof navigateParams[name] != "undefined")
    {
      headers = navigateParams[name];
    }
    return headers;
  }

  function getNavigateWindowId()
  {
    return getNavigateParam("id") + "";
  }

  function removeNavigateParams()
  {
    let tab = Utils.getTabFromDocument(document);
    let navigateParams = Utils.getTabAttributeJSON(tab, "fireieNavigateParams");
    if (navigateParams)
    {
      tab.removeAttribute("fireieNavigateParams");
    }
  }

  function registerEventHandler()
  {
    window.addEventListener("IETitleChanged", onIETitleChanged, false);
    window.addEventListener("CloseIETab", onCloseIETab, false);
    window.addEventListener("IEDocumentComplete", onIEDocumentComplete, false);
    E(Utils.containerPluginId).addEventListener("focus", onPluginFocus, false);
  }
  
  function unregisterEventHandler()
  {
    window.removeEventListener("IETitleChanged", onIETitleChanged, false);
    window.removeEventListener("CloseIETab", onCloseIETab, false);
    window.removeEventListener("IEDocumentComplete", onIEDocumentComplete, false);
    E(Utils.containerPluginId).removeEventListener("focus", onPluginFocus, false);
  }


  /** 响应Plugin标题变化事件 */

  function onIETitleChanged(event)
  {
    let title = event.detail;
    document.title = title;
  }

  /** 响应关闭IE标签窗口事件 */

  function onCloseIETab(event)
  {
    window.setTimeout(function()
    {
      window.close();
    }, 100);
  }

  /** 响应页面加载完成事件 */

  function onIEDocumentComplete(event)
  { /** 设置页面Favicon */
    let po = E(Utils.containerPluginId);
    if (po)
    {
      let faviconURL = po.FaviconURL;
      if (faviconURL && faviconURL != "")
      {
        Favicon.setIcon(document, faviconURL);
      }
    }
  }

  /**
   * 当焦点在plugin对象上时，在plugin中按Alt+XXX组合键时，
   * 菜单栏无法正常弹出，因此当plugin对象得到焦点时，需要
   * 调用其blus方法去除焦点。
   */
  function onPluginFocus(event)
  {
    let pluginObject = event.originalTarget;
    pluginObject.blur();
    pluginObject.Focus();
  }

  window.addEventListener('load', init, false);
  window.addEventListener('unload', destory, false);
  FireIEContainer.getNavigateWindowId = getNavigateWindowId;
  FireIEContainer.removeNavigateParams = removeNavigateParams;
  FireIEContainer.getZoomLevel = function () 
  {
    let win = Utils.getChromeWindow();
    if (win && win.gFireIE)
    {
      return win.gFireIE.getZoomLevel();
    }
    else
    {
      return 1;
    }
  }
})();
