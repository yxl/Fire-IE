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

var gFireIE = null;

(function()
{
  let Cc = Components.classes;
  let Ci = Components.interfaces;
  let Cr = Components.results;
  let Cu = Components.utils;

  let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);
  let jsm = {};
  Cu.import(baseURL.spec + "AppIntegration.jsm", jsm);
  Cu.import(baseURL.spec + "Utils.jsm", jsm);
  Cu.import(baseURL.spec + "GesturePrefObserver.jsm", jsm);
  Cu.import(baseURL.spec + "HookManager.jsm", jsm);
  Cu.import(baseURL.spec + "UtilsPluginManager.jsm", jsm);
  
  let
  {
    AppIntegration, Utils, GesturePrefObserver, HookManager, UtilsPluginManager
  } = jsm;
  
  let HM = new HookManager(window, "gFireIE._hookManager");
  let RET = HM.RET;
  gFireIE = AppIntegration.addWindow(window);
  gFireIE._hookManager = HM;
  
  function setUseRealURI(browser)
  {
    let value = browser.FireIE_bUseRealURI || 0;
    return browser.FireIE_bUseRealURI = value + 1;
  }

  function unsetUseRealURI(browser)
  {
    let value = browser.FireIE_bUseRealURI || 1;
    if (value < 1) value = 1;
    return browser.FireIE_bUseRealURI = value - 1;
  }
  
  // hook click_to_play
  // Don't allow PluginClickToPlay, PluginInstantiated and PluginRemoved to be processed by
  // gPluginHandler, in order to hide the notification icon
  let clickToPlayHandler = function(event)
  {
    // Only handle click_to_play events and those may trigger the notification
    if (event.type != "PluginClickToPlay" && event.type != "PluginBindingAttached"
        && event.type != "PluginInstantiated" && event.type != "PluginRemoved")
      return;
    
    let plugin = event.target;
    
    // We're expecting the target to be a plugin.
    if (!(plugin instanceof Ci.nsIObjectLoadingContent))
      return;

    // Check if it's our plugin
    if (plugin.getAttribute("type") != "application/fireie")
      return;
    
    // Check the container page
    let doc = plugin.ownerDocument;
    let url = doc.location.href;
    if (!Utils.isIEEngine(url))
      return;
    
    // The plugin binding fires this event when it is created.
    // As an untrusted event, ensure that this object actually has a binding
    // and make sure we don't handle it twice
    let eventType = event.type;
    if (eventType == "PluginBindingAttached")
    {
      let doc = plugin.ownerDocument;
      let overlay = doc.getAnonymousElementByAttribute(plugin, "class", "mainBox");
      if (!overlay || overlay.FireIE_OverlayBindingHandled)
        return;
      
      overlay.FireIE_OverlayBindingHandled = true;
      eventType = UtilsPluginManager.getPluginBindingType(plugin);
    }
    
    if (eventType != "PluginClickToPlay" && event.type != "PluginInstantiated"
        && event.type != "PluginRemoved")
      return;
    
    // disallow any further processing of this event
    event.stopImmediatePropagation();
    
    if (eventType == "PluginClickToPlay")
    {
      // check whether the plugin is already activated
      let objLoadingContent = plugin.QueryInterface(Ci.nsIObjectLoadingContent);
      if (!objLoadingContent.activated)
      {
        // not activated yet, play the plugin and let go
        plugin.playPlugin();
        gFireIE.updateInterface();
      }
    }
    
    return RET.shouldReturn();
  };
  
  this.window.addEventListener("PluginClickToPlay", clickToPlayHandler, true);
  // https://bugzilla.mozilla.org/show_bug.cgi?id=813963, events merged into PluginBindingAttached
  this.window.addEventListener("PluginBindingAttached", clickToPlayHandler, true);
  // still we have to hook gPluginHandler.handleEvent
  // in case they start listening on the window object
  if (typeof(gPluginHandler) == "object" && typeof(gPluginHandler.handleEvent) == "function")
  {
    HM.hookCodeHead("gPluginHandler.handleEvent", clickToPlayHandler);
  }
  
  function initBasicHooks()
  {
    // work around with TU's excessive use of source-patching code
    if (typeof(TU_hookFunc) == "function")
    {
      HM.redirectSourcePatchingHook("TU_hookFunc", 0);
    }
    if (typeof(Tabmix) != "undefined" && typeof(Tabmix.newCode) == "function")
    {
      HM.redirectSPHNameFunc("Tabmix.newCode", 0, 1);
    }
    
    // Allow drag'n'drop on url bar button
    hookURLBarDragDrop();
  
    //hook properties
    hookBrowserGetter(gBrowser.mTabContainer.firstChild.linkedBrowser);
    hookURLBarSetter(gURLBar);
  }
  
  function initListeners()
  {
    //event listeners
    try
    {
      let container = gBrowser.tabContainer;
      container.addEventListener("TabOpen", function(e) { hookBrowserGetter(e.target.linkedBrowser); }, true);
      container.addEventListener("TabClose", function(e)
      {
        let tab = e.target;
        unhookBrowserGetter(tab.linkedBrowser);
        // Reclaim find bar hooks on tab close
        if (gBrowser.isFindBarInitialized && gBrowser.isFindBarInitialized(tab))
          reclaimFindBarHooks(gBrowser.getFindBar(tab));
        // Check dangling new window on tab close
        UtilsPluginManager.checkDanglingNewWindow(tab);
      }, false);
    }
    catch (ex)
    {
      Utils.ERROR("Failed to add tab open/close listeners: " + ex);
    }
    
    try
    {
      let displaySecurityInfoHandler = function(event)
      {
        if ((typeof(event) == 'undefined'
            || (event.type == 'click' && event.button == 0)
            || (event.type == 'keypress'
                && (event.charCode == KeyEvent.DOM_VK_SPACE || event.keyCode == KeyEvent.DOM_VK_RETURN)))
          && gFireIE.goDoCommand('DisplaySecurityInfo'))
        {
          if (event) event.stopPropagation();
        };
      };
      let identityBox = document.getElementById("identity-box");
      identityBox.addEventListener("click", displaySecurityInfoHandler, true);
      identityBox.addEventListener("keypress", displaySecurityInfoHandler, true);
      identityBox.addEventListener("dragstart", function(event)
      {
        if (gFireIE.isIEEngine() || gFireIE.isSwitchJumper())
        {
          if (gURLBar.getAttribute("pageproxystate") != "valid") {
            return;
          }
          var value = gFireIE.getURL();
          var urlString = value + "\n" + content.document.title;
          var htmlString = "<a href=\"" + value + "\">" + value + "</a>";
          var dt = event.dataTransfer;
          dt.setData("text/x-moz-url", urlString);
          dt.setData("text/uri-list", value);
          dt.setData("text/plain", value);
          dt.setData("text/html", htmlString);
        }
      }, false);
    }
    catch (ex)
    {
      Utils.ERROR("Failed to add event listener on #identity-box: " + ex);
    }

    gFireIE.gIdentityHandler = gIdentityHandler;
  }
  
  function initLazyHooks()
  {
    // lazy function hooking, may solve most of the addon incompatibilities
    // caused by the new hook mechanism
    let delayedCheckTab = function(tab)
    {
      setTimeout(function() { if (gFireIE.isIEEngine(tab) || gFireIE.isSwitchJumper(tab)) doLazyHooks(); }, 0);
    };
    let lazyHookTabOpenHandler = function(e)
    {
      delayedCheckTab(e.target);
    };
    let lazyHookDocumentCompleteHandler = function(e)
    {
      // make sure it is not from the utils plugin
      if (document.getElementById(Utils.utilsPluginId) !== e.target)
        doLazyHooks();
    };
    // add listeners
    window.addEventListener("IEContentPluginInitialized", doLazyHooks, true);
    window.addEventListener("PBWShown", doLazyHooks, true);
    window.addEventListener("IEDocumentComplete", lazyHookDocumentCompleteHandler, true);
    let container = gBrowser.tabContainer;
    container.addEventListener("TabOpen", lazyHookTabOpenHandler, true);
    // listener removal
    let removeLazyHookHandlers = function()
    {
      window.removeEventListener("IEContentPluginInitialized", doLazyHooks, true);
      window.removeEventListener("PBWShown", doLazyHooks, true);
      window.removeEventListener("IEDocumentComplete", lazyHookDocumentCompleteHandler, true);
      container.removeEventListener("TabOpen", lazyHookTabOpenHandler, true);
    };
    // last thing: check whether the first tab is using IE engine
    delayedCheckTab(gBrowser.mTabContainer.firstChild);
    
    let bLazyHooked = false;
    function doLazyHooks()
    {
      // guard
      if (bLazyHooked) return;
      bLazyHooked = true;
      removeLazyHookHandlers();
      
      Utils.LOG("Doing lazy function hooks...");
      
      //hook functions
      // Obtain real URL when bookmarking
      HM.hookCodeHeadTail("PlacesCommandHook.bookmarkPage",
                          function(aBrowser) { setUseRealURI(aBrowser); },
                          function(ret, aBrowser) { unsetUseRealURI(aBrowser); });
      {
        let browsers = [];
        HM.hookCodeHeadTail("PlacesControllerDragHelper.onDrop",
          function(ip, dt)
          {
            let dropCount = dt.mozItemCount;
            for (let i = 0; i < dropCount; ++i)
            {
              let flavor = this.getFirstValidFlavor(dt.mozTypesAt(i));
              if (!flavor) return;
              let data = dt.mozGetDataAt(flavor, i);
              if (data instanceof XULElement && data.localName == "tab" && data.linkedBrowser)
              {
                setUseRealURI(data.linkedBrowser);
                browsers.push(data.linkedBrowser);
              }
            }
          },
          function(ret, ip, dt)
          {
            browsers.forEach(function(browser)
            {
              unsetUseRealURI(browser);
            });
            browsers = [];
          });
      }

      // Show bookmark state (the star icon in URL bar) when using IE engine
      if (typeof(PlacesStarButton) != "undefined" && typeof(PlacesStarButton.updateState) == "function")
        HM.hookCodeHeadTail("PlacesStarButton.updateState",
                            function() { setUseRealURI(gBrowser.mCurrentBrowser); },
                            function() { unsetUseRealURI(gBrowser.mCurrentBrowser); });

      // Firefox 23 : PlacesStarButton has been changed to BookmarksMenuButton
      if (typeof(BookmarksMenuButton) != "undefined" && typeof(BookmarksMenuButton.updateStarState) == "function")
        HM.hookCodeHeadTail("BookmarksMenuButton.updateStarState",
                            function() { setUseRealURI(gBrowser.mCurrentBrowser); },
                            function() { unsetUseRealURI(gBrowser.mCurrentBrowser); });
      
      // Firefox 24 : BookmarksMenuButton is again changed into BookmarkingUI...
      //  WTF... I mean, Welcome To Firefox!!
      if (typeof(BookmarkingUI) != "undefined" && typeof(BookmarkingUI.updateStarState) == "function")
        HM.hookCodeHeadTail("BookmarkingUI.updateStarState",
                            function() { setUseRealURI(gBrowser.mCurrentBrowser); },
                            function() { unsetUseRealURI(gBrowser.mCurrentBrowser); });
      
      // Show number of bookmarks in the overlay editing panel when using IE engine
      HM.hookCodeHeadTail("StarUI._doShowEditBookmarkPanel",
                          function() { setUseRealURI(gBrowser.mCurrentBrowser); },
                          function() { unsetUseRealURI(gBrowser.mCurrentBrowser); });
      

      // Cancel setTabTitle when using IE engine
      HM.hookCodeHead("gBrowser.setTabTitle", function(aTab)
      {
        let browser = this.getBrowserForTab(aTab);
        if (browser.contentTitle) return;
        if (browser.currentURI.spec && Utils.isIEEngine(browser.currentURI.spec))
          return RET.shouldReturn();
      });

      // Visit the new URL
      if (typeof(getShortcutOrURI) !== "undefined")
        HM.hookCodeTail("getShortcutOrURI", function(ret) RET.modifyValue(gFireIE.getHandledURL(ret)));
      else if (typeof(getShortcutOrURIAndPostData) !== "undefined")
        HM.hookCodeHeadTail("getShortcutOrURIAndPostData",
        function(aURL, aCallback)
        {
          // FF32?
          // getShortcutOrURIAndPostData now takes a callback parameter instead of returning a promise
          if (aCallback)
          {
            let oldCallback = aCallback;
            aCallback = function(obj)
            {
              obj.url = gFireIE.getHandledURL(obj.url);
              return oldCallback(obj);
            };
            return RET.modifyArguments(arguments);
          }
        },
        function(ret, aURL, aCallback)
        {
          if (aCallback) return;
          // FF25+
          // getShortcutOrURIAndPostData returns a promise that resolves to a url/postData structure
          // Should wrap the promise into another promise so we can handle the URL
          let promise = ret;
          if (!promise) return;
          let newPromise = promise.then(function(data)
          {
            if (data.url)
            {
              data.url = gFireIE.getHandledURL(data.url);
            }
            return data;
          });
          return RET.modifyValue(newPromise);
        });
      
      //hook Interface Commands
      HM.hookCodeHead("BrowserBack", function() { if (gFireIE.goDoCommand('Back')) return RET.shouldReturn(); });
      HM.hookCodeHead("BrowserForward", function() { if (gFireIE.goDoCommand('Forward')) return RET.shouldReturn(); });
      HM.hookCodeHead("BrowserStop", function() { if (gFireIE.goDoCommand('Stop')) return RET.shouldReturn(); });
      HM.hookCodeHead("BrowserReload", function() { if (gFireIE.goDoCommand('Refresh')) return RET.shouldReturn(); });
      HM.hookCodeHead("BrowserReloadSkipCache", function() { if (gFireIE.goDoCommand('Refresh')) return RET.shouldReturn(); });
      HM.hookCodeHead("saveDocument", function() { if (gFireIE.goDoCommand('SaveAs')) return RET.shouldReturn(); });
      HM.hookCodeHead("MailIntegration.sendMessage", function()
      {
        let pluginObject = gFireIE.getContainerPlugin();
        if (pluginObject)
        {
          arguments[0] = pluginObject.URL;
          arguments[1] = pluginObject.Title;
          return RET.modifyArguments(arguments);
        }
      }); // @todo Send mail?
      
      HM.hookCodeHead("PrintUtils.print", function() { if(gFireIE.goDoCommand('Print')) return RET.shouldReturn(); });
      HM.hookCodeHead("PrintUtils.showPageSetup", function() { if (gFireIE.goDoCommand('PrintSetup')) return RET.shouldReturn(); });
      HM.hookCodeHead("PrintUtils.printPreview", function() { if (gFireIE.goDoCommand('PrintPreview')) return RET.shouldReturn(); });
      // cmd_cut, cmd_copy, cmd_paste, cmd_selectAll
      HM.hookCodeHead("goDoCommand", function(cmd) { if (gFireIE.goDoCommand(cmd)) return RET.shouldReturn(); }); 
      
      let displaySecurityInfoFunc = function()
      {
        if (gFireIE.goDoCommand('DisplaySecurityInfo'))
          return RET.shouldReturn();
      }
      HM.hookCodeHead("displaySecurityInfo", displaySecurityInfoFunc);
      HM.hookCodeHead("gIdentityHandler.checkIdentity", function() { if (gFireIE.checkIdentity()) return RET.shouldReturn(); });    
      HM.hookCodeHead("BrowserViewSourceOfDocument", function() { if(gFireIE.goDoCommand('ViewPageSource')) return RET.shouldReturn(); });
      
      // make firegestures' and others' selection based functions work
      HM.hookCodeHead("getBrowserSelection", function(maxlen)
      {
        let value = gFireIE.getSelectionText(maxlen);
        if (value != null) return RET.shouldReturn(value);
      });

      initializeFindBarHooks();
      // Firefox 25 has per-tab gFindBar that we should hook individually
      gBrowser.tabContainer.addEventListener("TabSelect", initializeFindBarHooks, false);
      gBrowser.tabContainer.addEventListener("TabFindInitialized", initializeFindBarHooks, false);
      
      // Hook FullZoom object to use per-site zooming for IE container pages
      initializeFullZoomHooks();
    }
  }

  function initializeHooks()
  {
    initBasicHooks();
    initListeners();
    initLazyHooks();

    gFireIE.fireAfterInit(function()
    {
      initializeFGHooks();
      initializeMGRHooks();
      initializeAiOGHooks();
      initializeUCMGHooks();
      GesturePrefObserver.onGestureDetectionEnd();
    }, this, []);

  }

  function initializeFindBarHooks()
  {
    // FF25+ check: is gFindBar initialized yet?
    if (gBrowser.isFindBarInitialized && !gBrowser.isFindBarInitialized())
      return;
  
    if (gFindBar.FireIE_hooked)
      return;

    gFindBar.FireIE_hooked = true;
    Utils.LOG("Hooking findbar...");
    
    // find_next, find_prev, arguments[0] denotes whether find_prev
    HM.hookCodeHead("gFindBar.onFindAgainCommand", function(prev)
    {
      if (this.getElement('findbar-textbox').value.length != 0
        && gFireIE.setFindParams(this.getElement('findbar-textbox').value,
                                 this.getElement('highlight').checked,
                                 this.getElement('find-case-sensitive').checked)
        && gFireIE.goDoCommand(prev ? 'FindPrevious' : 'FindAgain'))
      {
        gFireIE.updateFindBarUI(this);
        return RET.shouldReturn();
      }
    });

    HM.hookCodeHead("gFindBar.toggleHighlight", function()
    {
      if (gFireIE.setFindParams(this.getElement('findbar-textbox').value,
                                this.getElement('highlight').checked,
                                this.getElement('find-case-sensitive').checked))
      {
        gFireIE.updateFindBarUI(this);
        return RET.shouldReturn();
      }
    });

    // do not return in order to let findbar set the case sensitivity pref
    HM.hookAttr(gFindBar.getElement("find-case-sensitive"), "oncommand", "if (gFireIE.setFindParams(gFindBar.getElement('findbar-textbox').value, gFindBar.getElement('highlight').checked, gFindBar.getElement('find-case-sensitive').checked)) { gFireIE.updateFindBarUI(gFindBar); }");

    HM.hookCodeHead("gFindBar._find", function(text)
    {
      let value = text || this.getElement('findbar-textbox').value;
      if (gFireIE.setFindParams(value, this.getElement('highlight').checked,
                                this.getElement('find-case-sensitive').checked)
        && gFireIE.findText(value))
      {
        gFireIE.updateFindBarUI(this);
        return RET.shouldReturn();
      }
    });

    // disabled, in order to support F3 findNext/Prev
    //hookCode("gFindBar.close", /{/, "$& if (!this.hidden) gFireIE.endFindText();");

    HM.hookAttrTail(document.getElementById("cmd_find"), "oncommand", "gFireIE.setFindParams(gFindBar.getElement('findbar-textbox').value, gFindBar.getElement('highlight').checked, gFindBar.getElement('find-case-sensitive').checked); gFireIE.resetFindBarUI(gFindBar);");

    HM.hookCodeHead("gFindBar._getInitialSelection", function()
    {
      let value = gFireIE.getSelectionText(this._selectionMaxLen);
      if (value != null) return RET.shouldReturn(value);
    });

    try
    {
      gFindBar.getElement("findbar-textbox").addEventListener('keypress', function(event)
      {
        var shouldHandle = !event.altKey && !event.ctrlKey &&
                           !event.metaKey && !event.shiftKey;

        switch (event.keyCode)
        {
          case KeyEvent.DOM_VK_PAGE_UP:
            if (shouldHandle)
              gFireIE.goDoCommand("PageUp");
            break;
          case KeyEvent.DOM_VK_PAGE_DOWN:
            if (shouldHandle)
              gFireIE.goDoCommand("PageDown");
            break;
          case KeyEvent.DOM_VK_UP:
            gFireIE.goDoCommand("LineUp");
            break;
          case KeyEvent.DOM_VK_DOWN:
            gFireIE.goDoCommand("LineDown");
            break;
        }
      }, false);
    }
    catch (ex)
    {
      Utils.ERROR("findbar-textbox addEventListener('keypress') failed. " + ex);
    }    
  }
  
  // We're not really removing all kinds of hooks, just reclaiming function hooks
  // and not attribute hooks or listeners - those should be handled well by GC.
  function reclaimFindBarHooks(findbar)
  {
    if (!findbar.FireIE_hooked)
      return;
    
    Utils.LOG("Reclaiming findbar hooks...");
    HM.reclaimHookIndex(findbar.onFindAgainCommand);
    HM.reclaimHookIndex(findbar.toggleHighlight);
    HM.reclaimHookIndex(findbar._find);
    HM.reclaimHookIndex(findbar._getInitialSelection);
  }
  
  // Per-site FullZoom support
  function initializeFullZoomHooks()
  {
    HM.hookCodeHeadTail("FullZoom.handleEvent",
      function() { setUseRealURI(gBrowser.selectedBrowser); },
      function() { unsetUseRealURI(gBrowser.selectedBrowser); });
    
    HM.hookCodeHeadTail("FullZoom.onContentPrefSet",
      function() { setUseRealURI(gBrowser.selectedBrowser); },
      function() { unsetUseRealURI(gBrowser.selectedBrowser); });
    
    HM.hookCodeHeadTail("FullZoom.onContentPrefRemoved",
      function() { setUseRealURI(gBrowser.selectedBrowser); },
      function() { unsetUseRealURI(gBrowser.selectedBrowser); });

    HM.hookCodeHeadTail("FullZoom.onLocationChange",
      function(aURI, aIsTabSwitch, aBrowser)
      {
        if (aBrowser)
          setUseRealURI(aBrowser);
        if (Utils.isIEEngine(aURI.spec) || Utils.isSwitchJumper(aURI.spec))
        {
          arguments[0] = Utils.makeURI(Utils.fromAnyPrefixedUrl(aURI.spec));
          return RET.modifyArguments(arguments);
        }
      },
      function(ret, aURI, aIsTabSwitch, aBrowser)
      {
        if (aBrowser)
          unsetUseRealURI(aBrowser);
      });
    
    if (typeof(FullZoom._applyZoomToPref) === "function")
    {
      HM.hookCodeHeadTail("FullZoom._applyZoomToPref",
        function(browser) { setUseRealURI(browser); },
        function(ret, browser) { unsetUseRealURI(browser); });
    }
    else if (typeof(FullZoom._applySettingToPref) === "function")
    {
      HM.hookCodeHeadTail("FullZoom._applySettingToPref",
        function() { setUseRealURI(gBrowser.mCurrentBrowser); },
        function() { unsetUseRealURI(gBrowser.mCurrentBrowser); });
    }

    HM.hookCodeHeadTail("FullZoom.reset",
      function() { setUseRealURI(gBrowser.selectedBrowser); },
      function() { unsetUseRealURI(gBrowser.selectedBrowser); });
  }

  // FireGestures support
  function initializeFGHooks()
  {
    if (typeof(FireGestures) == "object"  && FireGestures != null && typeof(FireGestures._performAction)=="function")
    {
      Utils.LOG("Fire Gestures detected.");
      GesturePrefObserver.setGestureExtension("FireGestures");
      HM.hookCodeHead("FireGestures._performAction", function() { if (gFireIE.goDoFGCommand(arguments[1])) return RET.shouldReturn(); });
      // make firegestures' selection based functions work
      HM.hookCodeHead("FireGestures.getSelectedText", function()
      {
        let value = gFireIE.getSelectionText(1000, true);
        if (value != null) return RET.shouldReturn(value);
      });
    }
  }

  // MouseGesturesRedox support
  function initializeMGRHooks()
  {
    if (typeof(mgGestureFunctions) == "object"  && mgGestureFunctions != null)
    {
      Utils.LOG("Mouse Gestures Redox detected.");
      GesturePrefObserver.setGestureExtension("MouseGesturesRedox");
      function hookMGRFunction(name)
      {
        if (typeof(mgGestureFunctions[name]) == "function")
          HM.hookCodeHead("mgGestureFunctions." + name, function() { if (gFireIE.goDoMGRCommand(name)) return RET.shouldReturn(); });
      }
      let functionList = ['mgW_ScrollDown', 'mgW_ScrollUp', 'mgW_ScrollLeft', 'mgW_ScrollRight'];
      for (let i = 0; i < functionList.length; i++)
      {
        hookMGRFunction(functionList[i]);
      }
    }
  }

  // All-in-One Gestures support
  function initializeAiOGHooks()
  {
    if (typeof(aioActionTable) == "object" && aioActionTable != null)
    {
      Utils.LOG("All-in-One Gestures detected.");
      GesturePrefObserver.setGestureExtension("All-in-One Gestures");
      function hookAiOGFunction(name, action)
      {
        if (typeof(eval(name)) == "function")
          HM.hookCodeHead(name, function() { if (gFireIE.goDoAiOGCommand(action, arguments)) return RET.shouldReturn(); });
      }
      let functionList = [["aioVScrollDocument", "vscroll"]];
      for (let i = 0; i < functionList.length; i++)
      {
        hookAiOGFunction(functionList[i][0], functionList[i][1]);
      }
    }
  }

  function initializeUCMGHooks()
  {
    if (typeof(ucjsMouseGestures) == "object")
    {
      Utils.LOG("ucjsMouseGestures detected.");
      GesturePrefObserver.setGestureExtension("GeneralAll");
    }
  }
  
  // save space by reusing function handles
  let currentURIGetter = function(uri)
  {
    if (Utils.isIEEngine(uri.spec))
    {
      let pluginObject = gFireIE.getContainerPluginFromBrowser(this);
      if (pluginObject)
      {
        let pluginURL = pluginObject.URL;
        if (pluginURL)
        {
          let url = this.FireIE_bUseRealURI ? pluginURL : (Utils.containerUrl + encodeURI(pluginURL));
          return RET.modifyValue(Utils.makeURI(url));
        }
      }
      // Failed to get URL from plugin object? Extract from uri.spec directly.
      if (this.FireIE_bUseRealURI)
      {
        let url = Utils.fromContainerUrl(uri.spec);
        return RET.modifyValue(Utils.makeURI(url));
      }
    }
    else if (Utils.isSwitchJumper(uri.spec) && this.FireIE_bUseRealURI)
    {
      let url = Utils.fromSwitchJumperUrl(uri.spec);
      return RET.modifyValue(Utils.makeURI(url));
    }
  };
  let sessionHistoryGetter = function()
  {
    let history = this.webNavigation.sessionHistory;
    let uri = this.FireIE_hooked ? this.currentURI : gFireIE.getURI(this);
    if (uri && Utils.isIEEngine(uri.spec))
    {
      let entry = history.getEntryAtIndex(history.index, false);
      if (entry.URI.spec != uri.spec)
      {
        entry.QueryInterface(Components.interfaces.nsISHEntry).setURI(uri);
      }
    }
  };

  function hookBrowserGetter(aBrowser)
  {
    if (aBrowser.localName != "browser") aBrowser = aBrowser.getElementsByTagNameNS(kXULNS, "browser")[0];
    if (aBrowser.FireIE_hooked) return;
    // hook aBrowser.currentURI, Let firefox know the new URL after navigating inside the IE engine
    HM.hookProp(aBrowser, "currentURI", null, null, currentURIGetter);
    // hook aBrowser.sessionHistory
    HM.hookProp(aBrowser, "sessionHistory", sessionHistoryGetter);
    aBrowser.FireIE_hooked = true;
  };
  
  function unhookBrowserGetter(aBrowser)
  {
    if (aBrowser.localName != "browser") aBrowser = aBrowser.getElementsByTagNameNS(kXULNS, "browser")[0];
    HM.unhookProp(aBrowser, "currentURI");
    HM.unhookProp(aBrowser, "sessionHistory");
    aBrowser.FireIE_hooked = false;
  };

  function hookURLBarSetter(aURLBar)
  {
    if (!aURLBar) aURLBar = document.getElementById("urlbar");
    if (!aURLBar) return;
    aURLBar.addEventListener("click", function(e)
    {
      let pluginObject = gFireIE.getContainerPlugin();
      if (pluginObject)
      {
        gFireIE.goDoCommand("HandOverFocus");
        aURLBar.focus();
      }
    }, false);
    HM.hookProp(aURLBar, "value", null, function()
    {
      if (!arguments[0]) return;
      
      Utils.runAsync(gFireIE.updateButtonStatus, gFireIE);

      if (Utils.isIEEngine(arguments[0]))
      {
        arguments[0] = Utils.fromContainerUrl(arguments[0]);
        if (/^file:\/\/.*/.test(arguments[0])) arguments[0] = encodeURI(arguments[0]);
        return RET.modifyArguments(arguments);
      }
      else if (Utils.isSwitchJumper(arguments[0]))
      {
        arguments[0] = Utils.fromSwitchJumperUrl(arguments[0]);
        if (/^file:\/\/.*/.test(arguments[0])) arguments[0] = encodeURI(arguments[0]);
        return RET.modifyArguments(arguments);
      }
    });
  }
  
  function hookURLBarDragDrop()
  {
    // gURLBar uses capturing hooks, thus our handlers can't override gURLBar's.
    // Hence the hook
    function checkURLBarButton(e)
    {
      if (e.target.id == "fireie-urlbar-switch")
        return RET.shouldReturn();
    }
    HM.hookCodeHead("gURLBar.onDragOver", checkURLBarButton);
    HM.hookCodeHead("gURLBar.onDrop", checkURLBarButton);
  }
  
  let loadListener = function()
  {
    window.removeEventListener("load", loadListener, false);
    gFireIE.init();
    initializeHooks();
  };
  window.addEventListener("load", loadListener, false);
})();
