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

(function()
{
  let Cc = Components.classes;
  let Ci = Components.interfaces;
  let Cr = Components.results;
  let Cu = Components.utils;

  let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);
  let jsm = {};
  Cu.import(baseURL.spec + "Utils.jsm", jsm);
  Cu.import(baseURL.spec + "Prefs.jsm", jsm);
  Cu.import(baseURL.spec + "Favicon.jsm", jsm);
  Cu.import(baseURL.spec + "LightweightTheme.jsm", jsm);
  let
  {
    Utils, Prefs, Favicon, LightweightTheme
  } = jsm;
  function getGFireIE()
  {
    let win = Utils.getChromeWindowFrom(window);
    return win && win.gFireIE;
  }
  
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

    E(Utils.statusBarId).hidden = true;

    let container = E('container');
    if (!container)
    {
      Utils.ERROR('Cannot find container to insert fireie-object.');
      return;
    }
    
    // must be loaded into a tab.. anything else is disallowed, such as the sidebar
    if (!Utils.getTabFromDocument(document))
    {
      container.innerHTML = '<strong style="font-size: 36px; color: red;">ERROR: Fire IE plugin can only be loaded in a tab.</strong>';
      Utils.ERROR("Fire IE plugin can only be loaded in a tab.");
      return;
    }
    
    if (needPrivateBrowsingWarning())
    {
      container.innerHTML = '<iframe src="PrivateBrowsingWarning.xhtml" width="100%" height="100%" frameborder="no" border="0" marginwidth="0" marginheight="0" scrolling="no" allowtransparency="yes"></iframe>';
      // Set tab icon to pbw icon
      Favicon.setIcon(document, "chrome://global/skin/icons/warning-16.png");
      document.title = Utils.getString("fireie.pbw.title");
      let event = document.createEvent("CustomEvent");
      event.initCustomEvent("PBWShown", true, true, "");
      document.dispatchEvent(event);
    }
    else
    {
      getGFireIE().clearResumeFromPBW();
      container.innerHTML = '<embed id="fireie-object" type="application/fireie" style="width:100%; height:100%;" />';
      registerEventHandler();
    }
  }

  function needPrivateBrowsingWarning()
  {
    let gFireIE = getGFireIE();
    let need = gFireIE && gFireIE.isPrivateBrowsing() && Prefs.privatebrowsingwarning && !gFireIE.isResumeFromPBW();
    // If we have fireieNavigateParams.id, the tab is a new window opened from IE
    // We should attach to it as soon as possible, ignoring privatebrowsingwarning
    if (need)
    {
      let tab = Utils.getTabFromDocument(document);
      let params = Utils.getTabAttributeJSON(tab, "fireieNavigateParams");
      need = !params || !params.id;
    }
    return !!need;
  }

  function destory()
  {
    window.removeEventListener("unload", destory, false);

    let container = E('container');

    if (E(Utils.containerPluginId))
    {
      unregisterEventHandler();
    }

    while (container.hasChildNodes())
    {
      container.removeChild(container.firstChild);
    }

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

  function getNavigateHeaders()
  {
    return getNavigateParam("headers");
  }

  function getNavigatePostData()
  {
    return getNavigateParam("post");
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
    window.addEventListener("IEContentPluginInitialized", onPluginInitialized, false);
    window.addEventListener("IETitleChanged", onIETitleChanged, false);
    window.addEventListener("CloseIETab", onCloseIETab, false);
    window.addEventListener("IEDocumentComplete", onIEDocumentComplete, false);
    window.addEventListener("IEProgressChanged", onIEProgressChange, false);
    window.addEventListener("IEURLChanged", onIEURLChanged, false);
    E(Utils.containerPluginId).addEventListener("focus", onPluginFocus, false);
    E(Utils.statusBarId).addEventListener("SetStatusText", onSetStatusText, false);
    E(Utils.statusBarId).addEventListener("mousemove", onStatusMouseMove, false);
    // support focus on plain DOMMouseScroll
    E("container").addEventListener("DOMMouseScroll", onDOMMouseScroll, false);
  }

  function unregisterEventHandler()
  {
    window.removeEventListener("IEContentPluginInitialized", onPluginInitialized, false);
    window.removeEventListener("IETitleChanged", onIETitleChanged, false);
    window.removeEventListener("CloseIETab", onCloseIETab, false);
    window.removeEventListener("IEDocumentComplete", onIEDocumentComplete, false);
    window.removeEventListener("IEProgressChanged", onIEProgressChange, false);
    window.removeEventListener("IEURLChanged", onIEURLChanged, false);
    E(Utils.containerPluginId).removeEventListener("focus", onPluginFocus, false);
    E(Utils.statusBarId).removeEventListener("SetStatusText", onSetStatusText, false);
    E(Utils.statusBarId).removeEventListener("mousemove", onStatusMouseMove, false);
    E("container").removeEventListener("DOMMouseScroll", onDOMMouseScroll, false);
  }
  
  /** Handler for the IE content plugin initialized event */

  function onPluginInitialized(event)
  {
    syncURL();
    syncFavicon();
    syncTitle();
    syncHistory();
  }

  /** Handler for the IE title change event */

  function onIETitleChanged(event)
  {
    let title = event.detail;
    document.title = title;
    
    // Issue #140 workaround
    syncURL();
  }

  /** Handler for the IE close tab event */

  function onCloseIETab(event)
  {
    window.setTimeout(function()
    {
      window.close();
    }, 100);
  }

  /** Handler for the IE document complete event */

  function onIEDocumentComplete(event)
  {
    syncURL();
    syncFavicon();
    syncTitle();
    syncHistory();
  }
  
  function onIEProgressChange(event)
  {
    syncURL();
  }
  
  function onIEURLChanged(event)
  {
    checkSwitchBack(event.detail);
  }
  
  let bSwitchEngineInitiated = false;

  function checkSwitchBack(url)
  {
    if (bSwitchEngineInitiated)
      return true;

    if (url)
    {
      let containerUrl = Utils.toContainerUrl(url);
      if (window.location.href != containerUrl)
      {
        let gFireIE = getGFireIE();
        // Issue #51: check if we need to switch back to Firefox engine
        if (gFireIE && gFireIE.shouldSwitchBack(url))
        {
          bSwitchEngineInitiated = true;
          gFireIE.switchEngine(Utils.getTabFromDocument(document), true, url);
          return true;
        }
      }
    }
    
    return false;
  }
  
  /** sync recorded url when IE engine navigates to another location */
  function syncURL()
  {
    let po = E(Utils.containerPluginId);
    if (!po) return;
    
    let url = po.URL;
    if (!url) return;

    if (checkSwitchBack(url))
      return;
      
    let containerUrl = Utils.toContainerUrl(url);
    if (window.location.href != containerUrl)
    {
      // HTML5 history manipulation,
      // see http://spoiledmilk.com/blog/html5-changing-the-browser-url-without-refreshing-page
      if (window.history)
        window.history.replaceState("", document.title, containerUrl);
    }
  }
  
  /** Sets the page favicon */
  function syncFavicon()
  {
    let po = E(Utils.containerPluginId);
    if (po)
    {
      let faviconURL = Prefs.showSiteFavicon ? po.FaviconURL : LightweightTheme.ieIconUrl;
      if (faviconURL && faviconURL != "")
      {
        Favicon.setIcon(document, faviconURL);
      }
    }
  }
  
  let syncHistoryURL = "";
  
  /** Synchronize with Firefox history */
  function syncHistory()
  {
    let gFireIE = getGFireIE();

    // Private browsing, don't record history
    if (gFireIE && gFireIE.isPrivateBrowsing())
      return;
      
    // Check pref
    if (!Prefs.historyEnabled)
      return;
    
    let po = E(Utils.containerPluginId);
    if (!po) return;
    
    // Don't sync while still loading stuff
    if (!po.IsDocumentComplete)
      return;
    
    let url = po.URL;
    if (!url) return;
    
    if (url != syncHistoryURL)
    {
      syncHistoryURL = url;
      Utils.addVisitHistory(url, Prefs.historyPrefix + (document.title || url));
    }
  }
  
  function syncTitle()
  {
    let po = E(Utils.containerPluginId);
    if (po)
      document.title = po.Title;
  }
  
  let statusHideTimeout = 0;
  
  /** Sets the status text */
  function onSetStatusText(event)
  {
    let statusbar = E(Utils.statusBarId);
    let statustext = event.detail["statusText"];
    if (typeof(statustext) == "undefined")
      statustext = "";
    let prevent = event.detail["preventFlash"];
    let pretext = "";
    if (statusbar.firstChild)
    {
      pretext = statusbar.firstChild.textContent;
      if (statustext != pretext)
        statusbar.removeChild(statusbar.firstChild);
    }
    if (statustext == pretext) return;
    
    if (!prevent)
    {
      statusbar.className = "noprevent";
    }
    
    if (statustext.length > 0)
    {
      statusbar.appendChild(document.createTextNode(statustext));
      statusbar.hidden = false;
    }
    
    if (statusHideTimeout)
      window.clearTimeout(statusHideTimeout);
    if (statusbar.hidden == false && !isLinkStatus(statustext) && !isLoadingStatus(statustext))
    {
      statusHideTimeout = window.setTimeout(function()
      {
        hideStatusBar();
      }, statustext.length > 0 ? 5000 : (prevent ? 1000 : 0));
    }
  }

  function onStatusMouseMove(event)
  {
    let statusbar = E(Utils.statusBarId);
    statusbar.setAttribute("mirrored", statusbar.getAttribute("mirrored") == "true" ? "false" : "true");
    if (!statusbar.firstChild || statusbar.firstChild.textContent == "")
      hideStatusBar();
  }

  let mouseScrollBubbleProtect = false;
  function onDOMMouseScroll(event)
  {
    if (mouseScrollBubbleProtect) return;
    mouseScrollBubbleProtect = true;

    try {
      // If it's a plain mouse wheel scroll, set focus on the IE control
      // in order to let user scroll the content
      if (event.axis == event.VERTICAL_AXIS
          && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey)
      {
        // Gecko 15+ supports "buttons" attribute
        if (typeof(event.buttons) == "undefined" || event.buttons == 0)
        {
          // it's a plain wheel scroll, transfer focus to the control
          let pluginObject = E(Utils.containerPluginId);
          if (pluginObject)
          {
            // note we're focusing the plugin object, not the plugin control
            // the object's focus handler will help us transfer the window focus
            pluginObject.focus();
            // forward this scroll result (UP or DOWN) as it's not sent to the control
            event.detail > 0 ? pluginObject.ScrollWheelDown() : pluginObject.ScrollWheelUp();
          }
        }
      }
    } finally {
      setTimeout(function()
      {
        mouseScrollBubbleProtect = false;
      }, 500);
    }
  }

  function hideStatusBar()
  {
    let statusbar = E(Utils.statusBarId);
    statusbar.hidden = true;
    statusbar.setAttribute("mirrored", "false");
    if (statusHideTimeout)
      window.clearTimeout(statusHideTimeout);
    statusHideTimeout = 0;    
  }
  
  let listToHashSet = function(list)
  {
    let ret = {};
    list.forEach(function(value) {
      ret[value] = true;
    });
    return ret;
  };

  let validProtocolSet = listToHashSet(["http", "https", "ftp", "javascript", "file", "about", "mailto", "data", "rtsp", "telnet", "thunder", "ed2k", "magnet"]);
  let loadingSuffix = "...";
  
  function isLinkStatus(status)
  {
    let index = status.indexOf(":");
    if (index == -1) return false;
    let protocol = status.substring(0, index);
    if (validProtocolSet[protocol]) return true;
    return false;
  }
  
  function isLoadingStatus(status)
  {
    return Utils.endsWith(status, loadingSuffix);
  }

  /**
   * When the plugin object has focus, pressing Alt+X combination keys
   * won't show firefox's menu bar. So we have to call blur once the plugin
   * object gains focus.
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
  FireIEContainer.getNavigateHeaders = getNavigateHeaders;
  FireIEContainer.getNavigatePostData = getNavigatePostData;
  FireIEContainer.removeNavigateParams = removeNavigateParams;
  FireIEContainer.getZoomLevel = function()
  {
    let gFireIE = getGFireIE();
    let zoomLevel = gFireIE ? gFireIE.getZoomLevel(Utils.getTabFromDocument(document).linkedBrowser) : 1;
    return zoomLevel * Utils.DPIScaling;
  }
})();
