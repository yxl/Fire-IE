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

{
  let Cc = Components.classes;
  let Ci = Components.interfaces;
  let Cr = Components.results;
  let Cu = Components.utils;

  let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);
  let jsm = {};
  Cu.import(baseURL.spec + "AppIntegration.jsm", jsm);
  Cu.import(baseURL.spec + "Utils.jsm", jsm);
  let
  {
    AppIntegration, Utils
  } = jsm;
  AppIntegration.addWindow(window);
  gFireIE = AppIntegration.getWrapperForWindow(window);


  function initializeHooks()
  {
    //hook properties
    hookBrowserGetter(gBrowser.mTabContainer.firstChild.linkedBrowser);
    hookURLBarSetter(gURLBar);

    //hook functions
    hookCode("gFindBar._onBrowserKeypress", "this._useTypeAheadFind &&", "$& !gFireIE.isIEEngine() &&"); // IE内核时不使用Firefox的查找条, $&指代被替换的代码
    hookCode("PlacesCommandHook.bookmarkPage", "aBrowser.currentURI", "makeURI(Utils.fromContainerUrl($&.spec))"); // 添加到收藏夹时获取实际URL
    hookCode("PlacesStarButton.updateState", /(gBrowser|getBrowser\(\))\.currentURI/g, "makeURI(Utils.fromContainerUrl($&.spec))"); // 用IE内核浏览网站时，在地址栏中正确显示收藏状态(星星按钮黄色时表示该页面已收藏)
    hookCode("gBrowser.addTab", "return t;", "hookBrowserGetter(t.linkedBrowser); $&");
    hookCode("gBrowser.setTabTitle", "if (browser.currentURI.spec) {", "$& if (browser.currentURI.spec.indexOf(Utils.containerUrl) == 0) return;"); // 取消原有的Tab标题文字设置
    hookCode("getShortcutOrURI", /return (\S+);/g, "return gFireIE.getHandledURL($1);"); // 访问新的URL
    //hook Interface Commands
    hookCode("BrowserBack", /{/, "$& if(gFireIE.goDoCommand('Back')) return;");
    hookCode("BrowserForward", /{/, "$& if(gFireIE.goDoCommand('Forward')) return;");
    hookCode("BrowserStop", /{/, "$& if(gFireIE.goDoCommand('Stop')) return;");
    hookCode("BrowserReload", /{/, "$& if(gFireIE.goDoCommand('Refresh')) return;");
    hookCode("BrowserReloadSkipCache", /{/, "$& if(gFireIE.goDoCommand('Refresh')) return;");

    hookCode("saveDocument", /{/, "$& if(gFireIE.goDoCommand('SaveAs')) return;");
    hookCode("MailIntegration.sendMessage", /{/, "$& var pluginObject = gFireIE.getContainerPlugin(); if(pluginObject){ arguments[0]=pluginObject.URL; arguments[1]=pluginObject.Title; }"); // @todo 发送邮件？
    hookCode("PrintUtils.print", /{/, "$& if(gFireIE.goDoCommand('Print')) return;");
    hookCode("PrintUtils.showPageSetup", /{/, "$& if(gFireIE.goDoCommand('PrintSetup')) return;");
    hookCode("PrintUtils.printPreview", /{/, "$& if(gFireIE.goDoCommand('PrintPreview')) return;");

    hookCode("goDoCommand", /{/, "$& if(gFireIE.goDoCommand(arguments[0])) return;"); // cmd_cut, cmd_copy, cmd_paste, cmd_selectAll
    hookCode("displaySecurityInfo", /{/, "$& if(gFireIE.goDoCommand('DisplaySecurityInfo')) return;");

    hookAttr("cmd_find", "oncommand", "if(gFireIE.goDoCommand('Find')) return;");
    hookAttr("cmd_findAgain", "oncommand", "if(gFireIE.goDoCommand('Find')) return;");
    hookAttr("cmd_findPrevious", "oncommand", "if(gFireIE.goDoCommand('Find')) return;");
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

  /** 将attribute值V替换为myFunc+V*/

  function hookAttr(parentNode, attrName, myFunc)
  {
    if (typeof(parentNode) == "string") parentNode = document.getElementById(parentNode);
    try
    {
      parentNode.setAttribute(attrName, myFunc + parentNode.getAttribute(attrName));
    }
    catch (e)
    {
      Utils.ERROR("Failed to hook attribute: " + attrName);
    }
  }

  /** 在Property的getter和setter代码头部增加一段代码*/

  function hookProp(parentNode, propName, myGetter, mySetter)
  {
    var oGetter = parentNode.__lookupGetter__(propName);
    var oSetter = parentNode.__lookupSetter__(propName);
    if (oGetter && myGetter) myGetter = oGetter.toString().replace(/{/, "{" + myGetter.toString().replace(/^.*{/, "").replace(/.*}$/, ""));
    if (oSetter && mySetter) mySetter = oSetter.toString().replace(/{/, "{" + mySetter.toString().replace(/^.*{/, "").replace(/.*}$/, ""));
    if (!myGetter) myGetter = oGetter;
    if (!mySetter) mySetter = oSetter;
    if (myGetter)
    {
      try
      {
        eval('parentNode.__defineGetter__(propName, ' + myGetter.toString() + ');');
      }
      catch (e)
      {
        Utils.ERROR("Failed to hook property Getter: " + propName);
      }
    }
    if (mySetter)
    {
      try
      {
        eval('parentNode.__defineSetter__(propName, ' + mySetter.toString() + ');');
      }
      catch (e)
      {
        Utils.ERROR("Failed to hook property Setter: " + propName);
      }
    }
  }

  function hookBrowserGetter(aBrowser)
  {
    if (aBrowser.localName != "browser") aBrowser = aBrowser.getElementsByTagNameNS(kXULNS, "browser")[0];
    // hook aBrowser.currentURI, 在IE引擎内部打开URL时, Firefox也能获取改变后的URL
    hookProp(aBrowser, "currentURI", function()
    {
      let uri = gFireIE.getURI(this);
      if (uri) return uri;
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
      var pluginObject = gFireIE.getContainerPlugin();
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
      }
    });
  }

  window.addEventListener("load", function()
  {
    window.removeEventListener("load", arguments.callee, false);
    gFireIE.init();
    initializeHooks();
  }, false);
}