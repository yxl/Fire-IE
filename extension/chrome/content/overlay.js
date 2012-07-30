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
  let
  {
    AppIntegration, Utils, GesturePrefObserver
  } = jsm;
  gFireIE = AppIntegration.addWindow(window);

  function initializeHooks()
  {
    //hook properties
    gFireIE.hookBrowserGetter(gBrowser.mTabContainer.firstChild.linkedBrowser);
    hookURLBarSetter(gURLBar);

    //hook functions
    // Obtain real URL when bookmarking
    hookCodeHeadTail("PlacesCommandHook.bookmarkPage",
                     function(aBrowser) { aBrowser.FireIE_bUseRealURI = true; },
                     function(ret, aBrowser) { aBrowser.FireIE_bUseRealURI = false; });
    {
      let browsers = [];
      hookCodeHeadTail("PlacesControllerDragHelper.onDrop",
        function(ip, dt)
        {
          browsers = [];
          let dropCount = dt.mozItemCount;
          for (let i = 0; i < dropCount; ++i) {
            let flavor = this.getFirstValidFlavor(dt.mozTypesAt(i));
            if (!flavor) return;
            let data = dt.mozGetDataAt(flavor, i);
            if (data instanceof XULElement && data.localName == "tab" && data.linkedBrowser)
            {
              data.linkedBrowser.FireIE_bUseRealURI = true;
              browsers.push(data.linkedBrowser);
            }
          }
        },
        function(ret, ip, dt)
        {
          browsers.forEach(function(browser)
          {
            browser.FireIE_bUseRealURI = false;
          });
        });
    }
    // hookCode("PlacesControllerDragHelper.onDrop", "data.linkedBrowser.currentURI", "makeURI(gFireIE.Utils.fromContainerUrl($&.spec))");

    // Show bookmark state (the star icon in URL bar) when using IE engine
    hookCodeHeadTail("PlacesStarButton.updateState",
                     function() { gBrowser.mCurrentBrowser.FireIE_bUseRealURI = true; },
                     function() { gBrowser.mCurrentBrowser.FireIE_bUseRealURI = false; });

                     // Show number of bookmarks in the overlay editing panel when using IE engine
    hookCodeHeadTail("StarUI._doShowEditBookmarkPanel",
                     function() { gBrowser.mCurrentBrowser.FireIE_bUseRealURI = true; },
                     function() { gBrowser.mCurrentBrowser.FireIE_bUseRealURI = false; });
    hookCodeTail("gBrowser.addTab", function(t) { gFireIE.hookBrowserGetter(t.linkedBrowser); });

    // Cancel setTabTitle when using IE engine
    hookCodeHead("gBrowser.setTabTitle", function(aTab)
    {
      let browser = this.getBrowserForTab(aTab);
      if (browser.contentTitle) return;
      if (browser.currentURI.spec && browser.currentURI.spec.indexOf(gFireIE.Utils.containerUrl) == 0)
        return shouldReturn();
    });

    // Visit the new URL
    hookCodeTail("getShortcutOrURI", function(ret) modifyValue(gFireIE.getHandledURL(ret)));

    //hook Interface Commands
    hookCodeHead("BrowserBack", function() { if (gFireIE.goDoCommand('Back')) return shouldReturn(); });
    hookCodeHead("BrowserForward", function() { if (gFireIE.goDoCommand('Forward')) return shouldReturn(); });
    hookCodeHead("BrowserStop", function() { if (gFireIE.goDoCommand('Stop')) return shouldReturn(); });
    hookCodeHead("BrowserReload", function() { if (gFireIE.goDoCommand('Refresh')) return shouldReturn(); });
    hookCodeHead("BrowserReloadSkipCache", function() { if (gFireIE.goDoCommand('Refresh')) return shouldReturn(); });
    hookCodeHead("saveDocument", function() { if (gFireIE.goDoCommand('SaveAs')) return shouldReturn(); });
    hookCodeHead("MailIntegration.sendMessage", function()
    {
      let pluginObject = gFireIE.getContainerPlugin();
      if(pluginObject)
      {
        arguments[0] = pluginObject.URL;
        arguments[1] = pluginObject.Title;
        return modifyArguments(arguments);
      }
    }); // @todo Send mail?
    
    hookCodeHead("PrintUtils.print", function() { if(gFireIE.goDoCommand('Print')) return shouldReturn(); });
    hookCodeHead("PrintUtils.showPageSetup", function() { if (gFireIE.goDoCommand('PrintSetup')) return shouldReturn(); });
    hookCodeHead("PrintUtils.printPreview", function() { if (gFireIE.goDoCommand('PrintPreview')) return shouldReturn(); });
    // cmd_cut, cmd_copy, cmd_paste, cmd_selectAll
    hookCodeHead("goDoCommand", function() { if (gFireIE.goDoCommand(arguments[0])) return shouldReturn(); }); 
    
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
    let displaySecurityInfoFunc = function()
    {
      displaySecurityInfoHandler();
      return shouldReturn();
    }
    hookCodeHead("displaySecurityInfo", displaySecurityInfoFunc);
    
    try
    {
      let identityBox = document.getElementById("identity-box");
      identityBox.addEventListener("click", displaySecurityInfoHandler, true);
      identityBox.addEventListener("keypress", displaySecurityInfoHandler, true);
      identityBox.addEventListener("dragstart", function(event)
      {
        if (gFireIE.isIEEngine())
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
      });
    }
    catch (e)
    {
      Utils.ERROR("Failed to add event listener on #identity-box");
    }

    gFireIE.gIdentityHandler = gIdentityHandler;
    hookCodeHead("gIdentityHandler.checkIdentity", function() { if (gFireIE.checkIdentity()) return shouldReturn(); });    
    hookCodeHead("BrowserViewSourceOfDocument", function() { if(gFireIE.goDoCommand('ViewPageSource')) return shouldReturn(); });
    
    // make firegestures' and others' selection based functions work
    hookCodeHead("getBrowserSelection", function()
    {
      let value = gFireIE.getSelectionText(arguments[0]);
      if (value != null) return shouldReturn(value);
    });

    initializeFindBarHooks();
    gFireIE.fireAfterInit(function()
    {
      initializeFGHooks();
      initializeMGRHooks();
      initializeAiOGHooks();
      initializeUCMGHooks();
      GesturePrefObserver.onGestureDetectionEnd();
      GesturePrefObserver.setEnabledGestures();
    }, this, []);
  }

  function initializeFindBarHooks()
  {
    // find_next, find_prev, arguments[0] denotes whether find_prev
    hookCodeHead("gFindBar.onFindAgainCommand", function()
    {
      if (gFindBar.getElement('findbar-textbox').value.length != 0
        && gFireIE.setFindParams(gFindBar.getElement('findbar-textbox').value,
                                 gFindBar.getElement('highlight').checked,
                                 gFindBar.getElement('find-case-sensitive').checked)
        && gFireIE.goDoCommand(arguments[0] ? 'FindPrevious' : 'FindAgain'))
      {
        gFireIE.updateFindBarUI(gFindBar);
        return shouldReturn();
      }
    });

    hookCodeHead("gFindBar.toggleHighlight", function()
    {
      if (gFireIE.setFindParams(gFindBar.getElement('findbar-textbox').value,
                                gFindBar.getElement('highlight').checked,
                                gFindBar.getElement('find-case-sensitive').checked))
      {
        gFireIE.updateFindBarUI(gFindBar);
        return shouldReturn();
      }
    });

    // do not return in order to let findbar set the case sensitivity pref
    hookAttr(gFindBar.getElement("find-case-sensitive"), "oncommand", "if (gFireIE.setFindParams(gFindBar.getElement('findbar-textbox').value, gFindBar.getElement('highlight').checked, gFindBar.getElement('find-case-sensitive').checked)) { gFireIE.updateFindBarUI(gFindBar); }");

    hookCodeHead("gFindBar._find", function()
    {
      let value = arguments[0] || gFindBar.getElement('findbar-textbox').value;
      if (gFireIE.setFindParams(value, gFindBar.getElement('highlight').checked,
                                gFindBar.getElement('find-case-sensitive').checked)
        && gFireIE.findText(value))
      {
        gFireIE.updateFindBarUI(gFindBar);
        return shouldReturn();
      }
    });

    // disabled, in order to support F3 findNext/Prev
    //hookCode("gFindBar.close", /{/, "$& if (!this.hidden) gFireIE.endFindText();");

    hookAttrTail("cmd_find", "oncommand", "gFireIE.setFindParams(gFindBar.getElement('findbar-textbox').value, gFindBar.getElement('highlight').checked, gFindBar.getElement('find-case-sensitive').checked); gFireIE.resetFindBarUI(gFindBar);");

    hookCodeHead("gFindBar._getInitialSelection", function()
    {
      let value = gFireIE.getSelectionText(this._selectionMaxLen);
      if (value != null) return shouldReturn(value);
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
      });
    }
    catch (ex)
    {
      Utils.ERROR("findbar-textbox addEventListener('keypress') failed. " + ex);
    }    
    //hookAttr("cmd_find", "oncommand", "if(gFireIE.goDoCommand('Find')) return;");
    //hookAttr("cmd_findAgain", "oncommand", "if(gFireIE.goDoCommand('Find')) return;");
    //hookAttr("cmd_findPrevious", "oncommand", "if(gFireIE.goDoCommand('Find')) return;");
  }

  // FireGestures support
  function initializeFGHooks()
  {
    if (typeof(FireGestures) == "object"  && FireGestures != null && typeof(FireGestures._performAction)=="function")
    {
      Utils.LOG("Fire Gestures detected.");
      GesturePrefObserver.setGestureExtension("FireGestures");
      hookCodeHead("FireGestures._performAction", function() { if (gFireIE.goDoFGCommand(arguments[1])) return shouldReturn(); });
      // make firegestures' selection based functions work
      hookCodeHead("FireGestures.getSelectedText", function()
      {
        let value = gFireIE.getSelectionText(1000, true);
        if (value != null) return shouldReturn(value);
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
        if (mgGestureFunctions[name])
          hookCodeHead("mgGestureFunctions." + name, function() { if (gFireIE.goDoMGRCommand(name)) return shouldReturn(); });
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
          hookCodeHead(name, function() { if (gFireIE.goDoAiOGCommand(action, arguments)) return shouldReturn(); });
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

  function hookCode(orgFunc, orgCode, myCode)
  {
    try
    {
      if (eval(orgFunc).toString() == eval(orgFunc + "=" + eval(orgFunc).toString().replace(orgCode, myCode))) throw orgFunc;
    }
    catch (e)
    {
      Utils.ERROR("Failed to hook function: " + orgFunc);
    }
  }
  
  function wrapFunctionHead(orgFunc, myFunc, funcName)
  {
    return function()
    {
      let ret = null;
      try
      {
        ret = myFunc.apply(this, arguments);
        if (ret && ret.shouldReturn)
          return ret.value;
      }
      catch (ex)
      {
        Utils.ERROR("Failed executing hooked function: \"" + funcName + "\"@head: " + ex);
      }
      let newArguments = (ret && ret.arguments) || arguments;
      return orgFunc.apply(this, newArguments);
    };
  }
  
  function shouldReturn(value)
  {
    return { shouldReturn: true, value: value };
  }
  
  function modifyArguments(arguments)
  {
    return { shouldReturn: false, arguments: arguments };
  }
  
  function wrapFunctionTail(orgFunc, myFunc, funcName)
  {
    return function()
    {
      let ret = orgFunc.apply(this, arguments);
      Array.prototype.splice.call(arguments, 0, 0, ret)
      let myRet = null;
      try
      {
        myRet = myFunc.apply(this, arguments);
      }
      catch (ex)
      {
        Utils.ERROR("Failed executing hooked function: \"" + funcName + "\"@tail: " + ex);
      }
      return (myRet && myRet.shouldModify) ? myRet.value : ret;
    };
  }
  
  function wrapFunctionHeadTail(orgFunc, myFuncHead, myFuncTail, funcName)
  {
    return function()
    {
      let ret = null;
      try
      {
        ret = myFuncHead.apply(this, arguments);
        if (ret && ret.shouldReturn)
          return ret.value;
      }
      catch (ex)
      {
        Utils.ERROR("Failed executing hooked function: \"" + funcName + "\"@head: " + ex);
      }
      let newArguments = (ret && ret.arguments) || arguments;
      let orgRet = orgFunc.apply(this, newArguments);
      Array.prototype.splice.call(newArguments, 0, 0, orgRet)
      let myRet = null;
      try
      {
        myRet = myFuncTail.apply(this, newArguments);
      }
      catch (ex)
      {
        Utils.ERROR("Failed executing hooked function: \"" + funcName + "\"@tail: " + ex);
      }
      return (myRet && myRet.shouldModify) ? myRet.value : orgRet;
    };
  }
  
  function modifyValue(value)
  {
    return { shouldModify: true, value: value };
  }
  
  // The safer way: hook code while preserving original function's closures
  function hookCodeHead(orgFuncName/* String */, myFunc/* Function */)
  {
    try
    {
      let orgFunc = eval(orgFuncName);
      if (typeof(orgFunc) == "function")
      {
        let wrappedFunc = wrapFunctionHead(orgFunc, myFunc, orgFuncName);
        // execute the assignment
        if (wrappedFunc !== eval(orgFuncName + "=wrappedFunc"))
          throw orgFuncName;
      }
      else throw orgFuncName;
    }
    catch (e)
    {
      Utils.ERROR("Failed to hookhead function: " + orgFuncName);
    }
  }

  function hookCodeTail(orgFuncName/* String */, myFunc/* Function */)
  {
    try
    {
      let orgFunc = eval(orgFuncName);
      if (typeof(orgFunc) == "function")
      {
        let wrappedFunc = wrapFunctionTail(orgFunc, myFunc, orgFuncName);
        // execute the assignment
        if (wrappedFunc !== eval(orgFuncName + "=wrappedFunc"))
          throw orgFuncName;
      }
      else throw orgFuncName;
    }
    catch (e)
    {
      Utils.ERROR("Failed to hooktail function: " + orgFuncName);
    }
  }
  
  function hookCodeHeadTail(orgFuncName/* String */, myFuncHead/* Function */, myFuncTail/* Function */)
  {
    try
    {
      let orgFunc = eval(orgFuncName);
      if (typeof(orgFunc) == "function")
      {
        let wrappedFunc = wrapFunctionHeadTail(orgFunc, myFuncHead, myFuncTail, orgFuncName);
        // execute the assignment
        if (wrappedFunc !== eval(orgFuncName + "=wrappedFunc"))
          throw orgFuncName;
      }
      else throw orgFuncName;
    }
    catch (e)
    {
      Utils.ERROR("Failed to hookheadtail function: " + orgFuncName);
    }
  }

  /** Replace attribute's value V with (myFunc + V) (or (V + myFunc) if insertAtEnd is set to true) */
  function hookAttr(parentNode, attrName, myFunc, insertAtEnd)
  {
    if (typeof(parentNode) == "string") parentNode = document.getElementById(parentNode);
    try
    {
      parentNode.setAttribute(attrName,
        insertAtEnd ? parentNode.getAttribute(attrName) + myFunc
                    : myFunc + parentNode.getAttribute(attrName));
    }
    catch (e)
    {
      Utils.ERROR("Failed to hook attribute: " + attrName);
    }
  }
  function hookAttrTail(parentNode, attrName, myFunc)
  {
    hookAttr(parentNode, attrName, myFunc, true);
  }

  /** Add some code at the beginning of Property's getter and setter */

  function hookProp(parentNode, propName, myGetter, mySetter)
  {
    // must set both getter and setter or the other will be missing
    let oGetter = parentNode.__lookupGetter__(propName);
    let oSetter = parentNode.__lookupSetter__(propName);
    if (oGetter && myGetter)
    {
      let newGetter = wrapFunctionHead(oGetter, myGetter, parentNode.toString() + ".get " + propName);
      try
      {
        parentNode.__defineGetter__(propName, newGetter);
      }
      catch (e)
      {
        Utils.ERROR("Failed to hook property Getter: " + propName);
      }
    }
    else if (oGetter)
    {
      parentNode.__defineGetter__(propName, oGetter);
    }
    if (oSetter && mySetter)
    {
      let newSetter = wrapFunctionHead(oSetter, mySetter, parentNode.toString() + ".set " + propName);
      try
      {
        parentNode.__defineSetter__(propName, newSetter);
      }
      catch (e)
      {
        Utils.ERROR("Failed to hook property Setter: " + propName);
      }
    }
    else if (oSetter)
    {
      parentNode.__defineSetter__(propName, oSetter);
    }
    return { getter: oGetter, setter: oSetter };
  }

  gFireIE.hookBrowserGetter = function(aBrowser)
  {
    if (aBrowser.localName != "browser") aBrowser = aBrowser.getElementsByTagNameNS(kXULNS, "browser")[0];
    // hook aBrowser.currentURI, Let firefox know the new URL after navigating inside the IE engine
    hookProp(aBrowser, "currentURI", function()
    {
      let uri = gFireIE.getURI(this);
      if (uri)
      {
        if (this.FireIE_bUseRealURI)
          uri = makeURI(Utils.fromContainerUrl(uri.spec));
        return shouldReturn(uri);
      }
    });
    // hook aBrowser.sessionHistory
    hookProp(aBrowser, "sessionHistory", function()
    {
      let history = this.webNavigation.sessionHistory;
      let uri = gFireIE.getURI(this);
      if (uri)
      {
        let entry = history.getEntryAtIndex(history.index, false);
        if (entry.URI.spec != uri.spec)
        {
          entry.QueryInterface(Components.interfaces.nsISHEntry).setURI(uri);
          if (this.parentNode.__SS_data) delete this.parentNode.__SS_data;
        }
      }
    });
  }

  function hookURLBarSetter(aURLBar)
  {
    if (!aURLBar) aURLBar = document.getElementById("urlbar");
    if (!aURLBar) return;
    aURLBar.onclick = function(e)
    {
      let pluginObject = gFireIE.getContainerPlugin();
      if (pluginObject)
      {
        gFireIE.goDoCommand("HandOverFocus");
        aURLBar.focus();
      }
    }
    hookProp(aURLBar, "value", null, function()
    {
      let isIEEngine = arguments[0] && (arguments[0].substr(0, Utils.containerUrl.length) == Utils.containerUrl);
      if (isIEEngine)
      {
        arguments[0] = Utils.fromContainerUrl(arguments[0]);
        return modifyArguments(arguments);
      }
    });
  }
  
  let loadListener = function()
  {
    window.removeEventListener("load", loadListener, false);
    gFireIE.init();
    initializeHooks();
  }
  window.addEventListener("load", loadListener, false);
})();
