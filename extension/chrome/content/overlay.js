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
 * @namespace
 */
if (typeof(FireIE) == "undefined") {
	var FireIE = {};
}

let jsm = {};
Components.utils.import("resource://gre/modules/Services.jsm", jsm);
Components.utils.import("resource://fireie/fireieUtils.jsm", jsm);
let {Services, fireieUtils} = jsm;
let Strings = fireieUtils.Strings;

FireIE.observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);

/** 将URL转换为IE Tab URL */
FireIE.getfireieURL = function(url) {
	if (FireIE.startsWith(url, FireIE.containerUrl)) return url;
	if (/^file:\/\/.*/.test(url)) try {
		url = decodeURI(url).replace(/\|/g, ":");
	} catch (e) {}
	return FireIE.containerUrl + encodeURI(url);
}

/** 从Plugin URL中提取实际访问的URL */
FireIE.getActualUrl = function(url) {
	if (url && url.length > 0) {
		url = url.replace(/^\s+/g, "").replace(/\s+$/g, "");
		if (/^file:\/\/.*/.test(url)) url = url.replace(/\|/g, ":");
		if (url.substr(0, FireIE.containerUrl.length) == FireIE.containerUrl) {
			url = decodeURI(url.substring(FireIE.containerUrl.length));

			if (!/^[\w]+:/.test(url)) {
				url = "http://" + url;
			}
		}
	}
	return url;
}

/** 获取Firefox页面内嵌的plugin对象 */
FireIE.getPluginObject = function(aTab) {
	var aBrowser = (aTab ? aTab.linkedBrowser : gBrowser);
	if (aBrowser && aBrowser.currentURI && FireIE.startsWith(aBrowser.currentURI.spec, FireIE.containerUrl)) {
		if (aBrowser.contentDocument) {
			var obj = aBrowser.contentDocument.getElementById(FireIE.objectID);
			if (obj) {
				return (obj.wrappedJSObject ? obj.wrappedJSObject : obj); // Ref: Safely accessing content DOM from chrome
			}
		}
	}
	return null;
}

/** 获取IE Tab实际访问的URL*/
FireIE.getPluginObjectURL = function(aTab) {
	var tab = aTab || null;
	var aBrowser = (tab ? tab.linkedBrowser : gBrowser);
	var url = FireIE.getActualUrl(aBrowser.currentURI.spec);
	var pluginObject = FireIE.getPluginObject(tab);
	if (pluginObject && pluginObject.URL && pluginObject.URL != "") {
		url = (/^file:\/\/.*/.test(url) ? encodeURI(FireIE.convertToUTF8(pluginObject.URL)) : pluginObject.URL);
	}
	return url;
}

/** 获取当前Tab的IE Tab URI
 *  与FireIE.getPluginObjectURL功能相同
 */
FireIE.getCurrentIeTabURI = function(aBrowser) {
	try {
		var docShell = aBrowser.boxObject.QueryInterface(Components.interfaces.nsIBrowserBoxObject).docShell;
		var wNav = docShell.QueryInterface(Components.interfaces.nsIWebNavigation);
		if (wNav.currentURI && FireIE.startsWith(wNav.currentURI.spec, FireIE.containerUrl)) {
			var pluginObject = wNav.document.getElementById(FireIE.objectID);
			if (pluginObject) {
				if (pluginObject.wrappedJSObject) pluginObject = pluginObject.wrappedJSObject;
				var url = pluginObject.URL;
				if (url) {
					const ios = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
					return ios.newURI(FireIE.containerUrl + encodeURI(url), null, null);
				}
			}
		}
	} catch (e) {
		fireieUtils.LOG('FireIE.getCurrentIeTabURI: ' + ex);
	}
	return null;
}

/** 是否是IE内核*/
FireIE.isIEEngine = function(aTab) {
	var tab = aTab || gBrowser.mCurrentTab;
	var aBrowser = (aTab ? aTab.linkedBrowser : gBrowser);
	if (aBrowser && aBrowser.currentURI && FireIE.startsWith(aBrowser.currentURI.spec, FireIE.containerUrl)) {
		return true;
	}	
	return false;
}

/** 切换某个Tab的内核
 *  通过设置不同的URL实现切换内核的功能。
 *  使用IE内核时，将URL转换为ie tab URL再访问；
 *  使用Firefox内核时，不需转换直接访问。
 */
FireIE.switchTabEngine = function(aTab) {
	if (aTab && aTab.localName == "tab") {				
		// 实际浏览的URL
		var url = FireIE.getPluginObjectURL(aTab);
		
		var isIEEngineAfterSwitch = !FireIE.isIEEngine(aTab);
		
		if (!isIEEngineAfterSwitch) {
			// Now it is IE engine, call me means users want to switch to Firefox engine.
			// We have to tell FireIEWatcher that this is manual switching, do not switch back to IE engine
			FireIE.manualSwitchUrl = url;
		}
		let zoomLevel = FireIE.getZoomLevel();
		FireIE.setTabAttributeJSON(aTab, 'zoom', {zoomLevel: zoomLevel});


		// firefox特有地址只允许使用Firefox内核
		if (isIEEngineAfterSwitch && !FireIE.isFirefoxOnly(url)){
			// ie tab URL
			url = FireIE.getfireieURL(url);
		}
		if (aTab.linkedBrowser && aTab.linkedBrowser.currentURI.spec != url) aTab.linkedBrowser.loadURI(url);		
	}
}

FireIE.setUrlBarSwitchButtonStatus = function(isIEEngine) {
	// Firefox特有页面禁止内核切换
	let url = FireIE.getPluginObjectURL();
	let btn = document.getElementById("fireie-urlbar-switch");
	if (btn) {
		btn.disabled = FireIE.isFirefoxOnly(url);
		btn.style.visibility = "visible";
		btn.setAttribute("engine", (isIEEngine ? "ie" : "fx"));
	}

	// 更新内核切换按钮文字
	let label = document.getElementById("fireie-urlbar-switch-label");
	if (label) {
		let labelId = isIEEngine ? "fireie.urlbar.switch.label.ie" : "fireie.urlbar.switch.label.fx";
		label.value = Strings.global.GetStringFromName(labelId);
	}
	// 更新内核切换按钮tooltip文字
	let tooltip = document.getElementById("fireie-urlbar-switch-tooltip2");
	if (tooltip) {
		let tooltipId = isIEEngine ? "fireie.urlbar.switch.tooltip2.ie" : "fireie.urlbar.switch.tooltip2.fx";
		tooltip.value = Strings.global.GetStringFromName(tooltipId);
	}
}

// 工具栏按钮的状态与地址栏状态相同
FireIE.updateToolBar = function() {
	let urlbarButton = document.getElementById("fireie-urlbar-switch");
	let toolbarButton = document.getElementById("fireie-toolbar-palette-button");
	if (urlbarButton && toolbarButton) {
		toolbarButton.disabled = urlbarButton.disabled;
		toolbarButton.setAttribute("engine", urlbarButton.getAttribute("engine"));
	}
}

/** 切换当前页面内核*/
FireIE.switchEngine = function() {
	FireIE.switchTabEngine(gBrowser.mCurrentTab);
}

/** 打开配置对话框 */
FireIE.openOptionsDialog = function(url) {
	if (!url) url = FireIE.getPluginObjectURL();
	var icon = document.getElementById('ietab-status');
	window.openDialog('chrome://fireie/content/options.xul', "fireieOptionsDialog", 'chrome,centerscreen', FireIE.getUrlDomain(url), icon);
}

/** 新建一个ie标签*/
FireIE.addIeTab = function(url) {
	let newTab = gBrowser.addTab(FireIE.getfireieURL(url));
	gBrowser.selectedTab = newTab;
	if (gURLBar && (url == 'about:blank')) window.setTimeout(function() {
		gURLBar.focus();
	}, 0);
	return newTab;
}

FireIE.getHandledURL = function(url, isModeIE) {
	url = url.trim();
	
	// 访问firefox特有地址时, 只允许使用firefox内核
	if (FireIE.isFirefoxOnly(url)) {
		return url;
	}
	
	if (isModeIE) return FireIE.getfireieURL(url);

	if (FireIE.isIEEngine() && (!FireIE.startsWith(url, "about:")) && (!FireIE.startsWith(url, "view-source:"))) {
		if (FireIE.isValidURL(url) || FireIE.isValidDomainName(url)) {
			var isBlank = (FireIE.getActualUrl(gBrowser.currentURI.spec) == "about:blank");
			var handleUrlBar = Services.prefs.getBoolPref("extensions.fireie.handleUrlBar", false);
			var isSimilar = (FireIE.getUrlDomain(FireIE.getPluginObjectURL()) == FireIE.getUrlDomain(url));
			if (isBlank || handleUrlBar || isSimilar) return FireIE.getfireieURL(url);
		}
	}

	return url;
}

/** 检查URL地址是否是火狐浏览器特有
 *  例如 about:config chrome://xxx
 */
FireIE.isFirefoxOnly = function(url) {
   return(url && (url.length>0) &&
             ((FireIE.startsWith(url, 'about:') && url != "about:blank") ||
              FireIE.startsWith(url, 'chrome://')
             )
         );
}

/** 更新地址栏显示*/
FireIE.updateUrlBar = function() {
	FireIE.setUrlBarSwitchButtonStatus(FireIE.isIEEngine());
	
	if (!gURLBar || !FireIE.isIEEngine()) return;
	if (gBrowser.userTypedValue) {
		if (gURLBar.selectionEnd != gURLBar.selectionStart) window.setTimeout(function() {
			gURLBar.focus();
		}, 0);
	} else {
		var url = FireIE.getPluginObjectURL();
		if (url == "about:blank") url = "";
		if (gURLBar.value != url) gURLBar.value = url;
	}
	
	// 更新收藏状态(星星按钮黄色时表示该页面已收藏)
	PlacesStarButton.updateState();
}

/** 改变页面元素启用状态*/
FireIE.updateObjectDisabledStatus = function(objId, isEnabled) {
	var obj = (typeof(objId) == "object" ? objId : document.getElementById(objId));
	if (obj) {
		var d = obj.hasAttribute("disabled");
		if (d == isEnabled) {
			if (d) obj.removeAttribute("disabled");
			else obj.setAttribute("disabled", true);
		}
	}
}

/** 更新前进、后退铵钮状态*/
FireIE.updateBackForwardButtons = function() {
	var pluginObject = FireIE.getPluginObject();
	var canBack = (pluginObject ? pluginObject.CanBack : false) || gBrowser.webNavigation.canGoBack;
	var canForward = (pluginObject ? pluginObject.CanForward : false) || gBrowser.webNavigation.canGoForward;
	FireIE.updateObjectDisabledStatus("Browser:Back", canBack);
	FireIE.updateObjectDisabledStatus("Browser:Forward", canForward);
}

/** 更新停止和刷新按钮状态*/
FireIE.updateStopReloadButtons = function() {
	try {
		var pluginObject = FireIE.getPluginObject();
		var isBlank = (gBrowser.currentURI.spec == "about:blank");
		var isLoading = gBrowser.mIsBusy;
		FireIE.updateObjectDisabledStatus("Browser:Reload", pluginObject ? pluginObject.CanRefresh : !isBlank);
		FireIE.updateObjectDisabledStatus("Browser:Stop", pluginObject ? pluginObject.CanStop : isLoading);
	} catch (e) {}
}

// 更新编辑菜单中cmd_cut、cmd_copy、cmd_paste状态
FireIE.updateEditMenuItems = function(e) {
	if (e.originalTarget != document.getElementById("menu_EditPopup")) return;
	var pluginObject = FireIE.getPluginObject();
	if (pluginObject) {
		FireIE.updateObjectDisabledStatus("cmd_cut", pluginObject.CanCut);
		FireIE.updateObjectDisabledStatus("cmd_copy", pluginObject.CanCopy);
		FireIE.updateObjectDisabledStatus("cmd_paste", pluginObject.CanPaste);
	}
}

// @todo 这是哪个按钮？
FireIE.updateSecureLockIcon = function() {
	var pluginObject = FireIE.getPluginObject();
	if (pluginObject) {
		var securityButton = document.getElementById("security-button");
		if (securityButton) {
			var url = pluginObject.URL;
			const wpl = Components.interfaces.nsIWebProgressListener;
			var state = (FireIE.startsWith(url, "https://") ? wpl.STATE_IS_SECURE | wpl.STATE_SECURE_HIGH : wpl.STATE_IS_INSECURE);
			window.XULBrowserWindow.onSecurityChange(null, null, state);
			securityButton.setAttribute("label", FireIE.getUrlHost(pluginObject.URL));
		}
	}
}

/** 更新fireie界面显示*/
FireIE.updateInterface = function() {
	FireIE.updateBackForwardButtons();
	FireIE.updateStopReloadButtons();
	FireIE.updateSecureLockIcon();
	FireIE.updateUrlBar();
	FireIE.updateToolBar();
}

/** 更新fireie相关的界面*/
FireIE.updateAll = function() {
	if (FireIE.updating) return;
	try {
		FireIE.updating = true;
		FireIE.updateInterface();
	} finally {
		FireIE.updating = false;
	}
}

FireIE.updateProgressStatus = function() {
	var mTabs = gBrowser.mTabContainer.childNodes;
	for (var i = 0; i < mTabs.length; i++) {
		if (mTabs[i].localName == "tab") {
			var pluginObject = FireIE.getPluginObject(mTabs[i]);
			if (pluginObject) {
				var aCurTotalProgress = pluginObject.Progress;
				if (aCurTotalProgress != mTabs[i].mProgress) {
					const ios = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
					const wpl = Components.interfaces.nsIWebProgressListener;
					var aMaxTotalProgress = (aCurTotalProgress == -1 ? -1 : 100);
					var aTabListener = gBrowser.mTabListeners[mTabs[i]._tPos];
					var aWebProgress = mTabs[i].linkedBrowser.webProgress;
					var aRequest = ios.newChannelFromURI(mTabs[i].linkedBrowser.currentURI);
					var aStateFlags = (aCurTotalProgress == -1 ? wpl.STATE_STOP : wpl.STATE_START) | wpl.STATE_IS_NETWORK;
					aTabListener.onStateChange(aWebProgress, aRequest, aStateFlags, 0);
					aTabListener.onProgressChange(aWebProgress, aRequest, 0, 0, aCurTotalProgress, aMaxTotalProgress);
					mTabs[i].mProgress = aCurTotalProgress;
				}
			}
		}
	}
}

/** 响应页面正在加载的消息*/
FireIE.onIEProgressChange = function(event) {
	var progress = parseInt(event.detail);
	if (progress == 0) gBrowser.userTypedValue = null;
	FireIE.updateProgressStatus();
	FireIE.updateAll();
}

/** 响应新开IE标签的消息*/
FireIE.onNewIETab = function(event) {
	let data = JSON.parse(event.detail);
	let url = data.url;
	let id = data.id;
	let tab = FireIE.addIeTab(FireIE.getfireieURL(url));
	var param = {id: id};
	FireIE.setTabAttributeJSON(tab, FireIE.navigateParamsAttr, param);
}

FireIE.onSecurityChange = function(security) {
	FireIE.updateSecureLockIcon();
}

/** 异步调用plugin的方法*/
FireIE.goDoCommand = function(cmd) {
	try {
		var pluginObject = FireIE.getPluginObject();
		if (pluginObject == null) {
			return false;
		}
		var param = null;
		switch (cmd) {
		case "Back":
			if (!pluginObject.CanBack) {
				return false;
			}
			break;
		case "Forward":
			if (!pluginObject.CanForward) {
				return false;
			}
			break;
		}
		window.setTimeout(function() {
			FireIE.delayedGoDoCommand(cmd);
		}, 100);
		return true;
	} catch (ex) {}
	return false;
}

/** 配合FireIE.goDoCommand完成对plugin方法的调用*/
FireIE.delayedGoDoCommand = function(cmd) {
	try {
		var pluginObject = FireIE.getPluginObject();
		switch (cmd) {
		case "Back":
			pluginObject.Back();
			break;
		case "Forward":
			pluginObject.Forward();
			break;
		case "Stop":
			pluginObject.Stop();
			break;
		case "Refresh":
			pluginObject.Refresh();
			break;
		case "SaveAs":
			pluginObject.SaveAs();
			break;
		case "Print":
			pluginObject.Print();
			break;
		case "PrintSetup":
			pluginObject.PrintSetup();
			break;
		case "PrintPreview":
			pluginObject.PrintPreview();
			break;
		case "Find":
			pluginObject.Find();
			break;
		case "cmd_cut":
			pluginObject.Cut();
			break;
		case "cmd_copy":
			pluginObject.Copy();
			break;
		case "cmd_paste":
			pluginObject.Paste();
			break;
		case "cmd_selectAll":
			pluginObject.SelectAll();
			break;
		case "Focus":
			pluginObject.Focus();
			break;
		case "HandOverFocus":
			pluginObject.HandOverFocus();
			break;
		case "Zoom":
			var zoomLevel = FireIE.getZoomLevel();
			pluginObject.Zoom(zoomLevel);
			break;
		case "DisplaySecurityInfo":    
			pluginObject.DisplaySecurityInfo();
		break;
		}
	} catch (ex) {
	} finally {
		window.setTimeout(function() {
			FireIE.updateAll();
		}, 0);
	}
}

/** 关闭Tab页
 * @param {number} i Tab页index
 */
FireIE.closeTab = function(i) {
	var mTabs = gBrowser.mTabContainer.childNodes;
	gBrowser.removeTab(mTabs[i]);
}

/** 获取右键菜单关联的Tab对象*/
FireIE.getContextTab = function() {
	return (gBrowser && gBrowser.mContextTab && (gBrowser.mContextTab.localName == "tab") ? gBrowser.mContextTab : null);
}

// 响应内核切换按钮点击事件
FireIE.clickSwitchButton = function(e) {
	// 左键或中键点击切换内核
	if (e.button <= 1 && !e.target.disabled) {
		var aTab = gBrowser.mCurrentTab;
		if (!aTab) return;
		FireIE.switchTabEngine(aTab);
	}
	
	// 右键点击显示选项菜单
	else if (e.button == 2) {
		document.getElementById("fireie-switch-button-context-menu").openPopup(e.target, "after_start", 0, 0, true, false);
	}
	
	e.preventDefault();
}

/** 将焦点设置到IE窗口上*/
FireIE.focusIE = function() {
	FireIE.goDoCommand("Focus");
}

FireIE.onTabSelected = function(e) {
	FireIE.updateAll();
	FireIE.focusIE();
}

/** 获取document对应的Tab对象*/
FireIE.getTabByDocument = function(doc) {
	var mTabs = gBrowser.mTabContainer.childNodes;
	for (var i = 0; i < mTabs.length; i++) {
		var tab = mTabs[i];
		if (tab.linkedBrowser.contentDocument == doc) {
			return tab
		}
	}
	return null;
}

/** 加载或显示页面时更新界面*/
FireIE.onPageShowOrLoad = function(e) {
	FireIE.updateAll();
	
	var doc = e.originalTarget;

	var tab = FireIE.getTabByDocument(doc);
	if (!tab) return;

	//
	// 检查是否需要设置ZoomLevel
	//	
	let zoomLevelParams = FireIE.getTabAttributeJSON(tab, 'zoom');
	if (zoomLevelParams) {
		FireIE.setZoomLevel(zoomLevelParams.zoomLevel);
		tab.removeAttribute(tab, 'zoom');
	}
}

FireIE.getTabAttributeJSON =  function(tab, name) {
	let attrString = tab.getAttribute(name);
	if (!attrString) {
		return null;
	}
	
	try {
		let json = JSON.parse(attrString);
		return json;
	} catch (ex) {
		fireieUtils.LOG('FireIE.getTabAttributeJSON:' + ex);
	}
	
	return null;
}

FireIE.setTabAttributeJSON = function(tab, name, value) {
	let attrString = JSON.stringify(value);
	tab.setAttribute(name, attrString);
}

/** 响应界面大小变化事件
 */
FireIE.onResize = function(e) {
  // Zoom时会触发Resize事件
	FireIE.goDoCommand("Zoom");
}

FireIE.hookBrowserGetter = function(aBrowser) {
	if (aBrowser.localName != "browser") aBrowser = aBrowser.getElementsByTagNameNS(kXULNS, "browser")[0];
	// hook aBrowser.currentURI, 在IE引擎内部打开URL时, Firefox也能获取改变后的URL
	FireIE.hookProp(aBrowser, "currentURI", function() {
		var uri = FireIE.getCurrentIeTabURI(this);
		if (uri) return uri;
	});
	// hook aBrowser.sessionHistory
	// @todo 有什么用？
	FireIE.hookProp(aBrowser, "sessionHistory", function() {
		var history = this.webNavigation.sessionHistory;
		var uri = FireIE.getCurrentIeTabURI(this);
		if (uri) {
			var entry = history.getEntryAtIndex(history.index, false);
			if (entry.URI.spec != uri.spec) {
				entry.QueryInterface(Components.interfaces.nsISHEntry).setURI(uri);
				if (this.parentNode.__SS_data) delete this.parentNode.__SS_data;
			}
		}
	});
}

FireIE.hookURLBarSetter = function(aURLBar) {
	if (!aURLBar) aURLBar = document.getElementById("urlbar");
	if (!aURLBar) return;
	aURLBar.onclick = function(e) {
		var pluginObject = FireIE.getPluginObject();
		if (pluginObject) {
			FireIE.goDoCommand("HandOverFocus");
		}
	}
	FireIE.hookProp(aURLBar, "value", null, function() {
		this.isModeIE = arguments[0] && (arguments[0].substr(0, FireIE.containerUrl.length) == FireIE.containerUrl);
		if (this.isModeIE) {
			arguments[0] = FireIE.getActualUrl(arguments[0]);
			// if (arguments[0] == "about:blank") arguments[0] = "";
		}
	});
}

FireIE.hookCodeAll = function() {
	//hook properties
	FireIE.hookBrowserGetter(gBrowser.mTabContainer.firstChild.linkedBrowser);
	FireIE.hookURLBarSetter(gURLBar);

	//hook functions
	FireIE.hookCode("gFindBar._onBrowserKeypress", "this._useTypeAheadFind &&", "$& !FireIE.isIEEngine() &&"); // IE内核时不使用Firefox的查找条, $&指代被替换的代码
	FireIE.hookCode("PlacesCommandHook.bookmarkPage", "aBrowser.currentURI", "makeURI(FireIE.getActualUrl($&.spec))"); // 添加到收藏夹时获取实际URL
	FireIE.hookCode("PlacesStarButton.updateState", /(gBrowser|getBrowser\(\))\.currentURI/g, "makeURI(FireIE.getActualUrl($&.spec))"); // 用IE内核浏览网站时，在地址栏中正确显示收藏状态(星星按钮黄色时表示该页面已收藏)
	FireIE.hookCode("gBrowser.addTab", "return t;", "FireIE.hookBrowserGetter(t.linkedBrowser); $&");
	FireIE.hookCode("nsBrowserAccess.prototype.openURI", " loadflags = isExternal ?", " loadflags = false ?"); // @todo 有什么用?
	FireIE.hookCode("gBrowser.setTabTitle", "if (browser.currentURI.spec) {", "$& if (browser.currentURI.spec.indexOf(FireIE.containerUrl) == 0) return;"); // 取消原有的Tab标题文字设置
	FireIE.hookCode("URLBarSetURI", "getWebNavigation()", "getBrowser()"); // @todo 有什么用？
	FireIE.hookCode("getShortcutOrURI", /return (\S+);/g, "return FireIE.getHandledURL($1);"); // 访问新的URL

	//hook Interface Commands
	FireIE.hookCode("BrowserBack", /{/, "$& if(FireIE.goDoCommand('Back')) return;");
	FireIE.hookCode("BrowserForward", /{/, "$& if(FireIE.goDoCommand('Forward')) return;");
	FireIE.hookCode("BrowserStop", /{/, "$& if(FireIE.goDoCommand('Stop')) return;");
	FireIE.hookCode("BrowserReload", /{/, "$& if(FireIE.goDoCommand('Refresh')) return;");
	FireIE.hookCode("BrowserReloadSkipCache", /{/, "$& if(FireIE.goDoCommand('Refresh')) return;");

	FireIE.hookCode("saveDocument", /{/, "$& if(FireIE.goDoCommand('SaveAs')) return;");
	FireIE.hookCode("MailIntegration.sendMessage", /{/, "$& var pluginObject = FireIE.getPluginObject(); if(pluginObject){ arguments[0]=pluginObject.URL; arguments[1]=pluginObject.Title; }"); // @todo 发送邮件？

	FireIE.hookCode("PrintUtils.print", /{/, "$& if(FireIE.goDoCommand('Print')) return;");
	FireIE.hookCode("PrintUtils.showPageSetup", /{/, "$& if(FireIE.goDoCommand('PrintSetup')) return;");
	FireIE.hookCode("PrintUtils.printPreview", /{/, "$& if(FireIE.goDoCommand('PrintPreview')) return;");

	FireIE.hookCode("goDoCommand", /{/, "$& if(FireIE.goDoCommand(arguments[0])) return;"); // cmd_cut, cmd_copy, cmd_paste, cmd_selectAll

	FireIE.hookAttr("cmd_find", "oncommand", "if(FireIE.goDoCommand('Find')) return;");
	FireIE.hookAttr("cmd_findAgain", "oncommand", "if(FireIE.goDoCommand('Find')) return;");
	FireIE.hookAttr("cmd_findPrevious", "oncommand", "if(FireIE.goDoCommand('Find')) return;");

	FireIE.hookCode("displaySecurityInfo", /{/, "$& if(FireIE.goDoCommand('DisplaySecurityInfo')) return;");
}


FireIE.addEventAll = function() {
	FireIE.observerService.addObserver(FireIE.HttpObserver, 'http-on-modify-request', false);
	FireIE.CookieObserver.register();
	FireIE.Observer.register();

	FireIE.addEventListener(window, "DOMContentLoaded", FireIE.onPageShowOrLoad);
	FireIE.addEventListener(window, "pageshow", FireIE.onPageShowOrLoad);
	FireIE.addEventListener(window, "resize", FireIE.onResize);

	FireIE.addEventListener(gBrowser.tabContainer, "TabSelect", FireIE.onTabSelected);

	FireIE.addEventListener("menu_EditPopup", "popupshowing", FireIE.updateEditMenuItems);

	FireIE.addEventListener(window, "IeProgressChanged", FireIE.onIEProgressChange);
	FireIE.addEventListener(window, "NewIETab", FireIE.onNewIETab);
}

FireIE.removeEventAll = function() {
	FireIE.observerService.removeObserver(FireIE.HttpObserver, 'http-on-modify-request');
	FireIE.CookieObserver.unregister();
	FireIE.Observer.unregister();
	
	FireIE.removeEventListener(window, "DOMContentLoaded", FireIE.onPageShowOrLoad);
	FireIE.removeEventListener(window, "pageshow", FireIE.onPageShowOrLoad);
	FireIE.removeEventListener(window, "resize", FireIE.onResize);

	FireIE.removeEventListener(gBrowser.tabContainer, "TabSelect", FireIE.onTabSelected);

	FireIE.removeEventListener("menu_EditPopup", "popupshowing", FireIE.updateEditMenuItems);

	FireIE.removeEventListener(window, "ProgressChanged", FireIE.onIEProgressChange);
	FireIE.removeEventListener(window, "NewIETab", FireIE.onNewIETab);
}

FireIE.init = function() {
	FireIE.removeEventListener(window, "load", FireIE.init);

  /**
   * navigator.plugins方法将使得最新安装的插件可用，更新相关数组，如 plugins 数组，并可选重新装入包含插件的已打开文档。
   * 你可以使用下列语句调用该方法：
   * navigator.plugins.refresh(true)
   * navigator.plugins.refresh(false)
   * 如果你给定 true 的话，refresh 将在使得新安装的插件可用的同时，重新装入所有包含有嵌入对象(EMBED 标签)的文档。
   *如果你给定 false 的话，该方法则只会刷新 plugins 数组，而不会重新载入任何文档。
   * 当用户安装插件后，该插件将不会可用，除非调用了 refresh，或者用户关闭并重新启动了 Navigator。 
   */
  navigator.plugins.refresh(false);

	// 创建同步Cookie的plugin
	let item = document.createElementNS("http://www.w3.org/1999/xhtml", "html:embed");
	item.hidden = true;
	item.setAttribute("id", "fireie-cookie-object");
	item.setAttribute("type", "application/fireie");
	let mainWindow = document.getElementById("main-window");
	mainWindow.appendChild(item);
	
	FireIE.hookCodeAll();
	FireIE.addEventAll();
	FireIE.updateAll();
	
	FireIE.setupShortcut();
	FireIE.setupUrlBar();
}

FireIE.destroy = function() {
	FireIE.removeEventListener(window, "unload", FireIE.destroy);

	FireIE.removeEventAll();
}

// 设置内核切换快捷键
FireIE.setupShortcut = function() {
	try {
		let keyItem = document.getElementById('key_fireieToggle');
		if (keyItem) {
			// Default key is "C"
			keyItem.setAttribute('key', Services.prefs.getCharPref('extensions.fireie.shortcut.key', 'C'));
			// Default modifiers is "alt"
			keyItem.setAttribute('modifiers', Services.prefs.getCharPref('extensions.fireie.shortcut.modifiers', 'alt'));
		}
	} catch (e) {
		fireieUtils.ERROR(e);
	}
}

// 设置地址栏按钮
FireIE.setupUrlBar = function() {
	let showUrlBarLabel = Services.prefs.getBoolPref("extensions.fireie.showUrlBarLabel", true);
	document.getElementById("fireie-urlbar-switch-label").hidden = !showUrlBarLabel;
}

const PREF_BRANCH = "extensions.fireie.";

/**
 * Observer monitering the preferences.
 */
FireIE.Observer = {
	_branch: null,

	observe: function(subject, topic, data) {
		if (topic === "nsPref:changed") {
			let prefName = PREF_BRANCH + data;
			if (prefName.indexOf("shortcut.") != -1) {
				FireIE.setupShortcut();
			} else if (prefName === "extensions.fireie.showUrlBarLabel") {
				FireIE.setupUrlBar();
			}
		}
	},

	register: function() {	
		this._branch = Services.prefs.getBranch(PREF_BRANCH);
		if (this._branch) {
			// Now we queue the interface called nsIPrefBranch2. This interface is described as: 
			// "nsIPrefBranch2 allows clients to observe changes to pref values."
			this._branch.QueryInterface(Components.interfaces.nsIPrefBranch2);
			this._branch.addObserver("", this, false);
		}
		
	},

	unregister: function() {     
		if (this._branch) {
			this._branch.removeObserver("", this);
		}
	}
};

window.addEventListener("load", FireIE.init, false);
window.addEventListener("unload", FireIE.destroy, false);
FireIE.manualSwitchUrl = null;
FireIE.engineAttr = "fireieEngine";
