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
 * Contributor(s):
 * Yuan Xulei <hi@yxl.name>
 * 
 * ***** END LICENSE BLOCK ***** */

/**
 * @namespace
 */
if (typeof(FireIE) == "undefined") {
	var FireIE = {};
}

Components.utils.import("resource://gre/modules/Services.jsm");

FireIE.observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);

/** 将URL转换为IE Tab URL */
FireIE.getfireieURL = function(url) {
	if (FireIE.startsWith(url, FireIE.containerUrl)) return url;
	if (/^file:\/\/.*/.test(url)) try {
		url = decodeURI(url).replace(/\|/g, ":");
	} catch (e) {}
	return FireIE.containerUrl + encodeURI(url);
}

/** 从IE Tab URL中提取实际访问的URL */
FireIE.getIeTabTrimURL = function(url) {
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
FireIE.getIeTabElmt = function(aTab) {
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
FireIE.getIeTabElmtURL = function(aTab) {
	var tab = aTab || null;
	var aBrowser = (tab ? tab.linkedBrowser : gBrowser);
	var url = FireIE.getIeTabTrimURL(aBrowser.currentURI.spec);
	var fireieObject = FireIE.getIeTabElmt(tab);
	if (fireieObject && fireieObject.URL && fireieObject.URL != "") {
		url = (/^file:\/\/.*/.test(url) ? encodeURI(FireIE.convertToUTF8(fireieObject.URL)) : fireieObject.URL);
	}
	return url;
}

/** 获取当前Tab的IE Tab URI
 *  与FireIE.getIeTabElmtURL功能相同
 */
FireIE.getCurrentIeTabURI = function(aBrowser) {
	try {
		var docShell = aBrowser.boxObject.QueryInterface(Components.interfaces.nsIBrowserBoxObject).docShell;
		var wNav = docShell.QueryInterface(Components.interfaces.nsIWebNavigation);
		if (wNav.currentURI && FireIE.startsWith(wNav.currentURI.spec, FireIE.containerUrl)) {
			var fireieObject = wNav.document.getElementById(FireIE.objectID);
			if (fireieObject) {
				if (fireieObject.wrappedJSObject) fireieObject = fireieObject.wrappedJSObject;
				var url = fireieObject.URL;
				if (url) {
					const ios = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
					return ios.newURI(FireIE.containerUrl + encodeURI(url), null, null);
				}
			}
		}
	} catch (e) {}
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
		var url = FireIE.getIeTabElmtURL(aTab);
		
		var isIEEngineAfterSwitch = !FireIE.isIEEngine(aTab);
		
		if (!isIEEngineAfterSwitch) {
			// Now it is IE engine, call me means users want to switch to Firefox engine.
			// We have to tell FireIEWatcher that this is manual switching, do not switch back to IE engine
			FireIE.manualSwitchUrl = url;
		}

		// firefox特有地址只允许使用Firefox内核
		if (isIEEngineAfterSwitch && !FireIE.isFirefoxOnly(url)){
			// ie tab URL
			url = FireIE.getfireieURL(url);
		}
		if (aTab.linkedBrowser && aTab.linkedBrowser.currentURI.spec != url) aTab.linkedBrowser.loadURI(url);
		
		FireIE.manualSwitchUrl = null;
	}
}

FireIE.setUrlbarSwitchButtonStatus = function(isIEEngine) {
	// Firefox特有页面禁止内核切换
	var url = FireIE.getIeTabElmtURL();
	var btn = document.getElementById("fireie-urlbar-switch");
	if (btn) {
		btn.disabled = FireIE.isFirefoxOnly(url);
		btn.style.visibility = 'visible';
	}
		
	// 更新内核切换按钮图标
	var image = document.getElementById("fireie-urlbar-switch-image");
	if (image) {
		image.setAttribute("engine", (isIEEngine ? "ie" : "fx"));
	}

	// 更新内核切换按钮文字
	var label = document.getElementById("fireie-urlbar-switch-label");
	if (label) {
		var labelId = isIEEngine ? "fireie.urlbar.switch.label.ie" : "fireie.urlbar.switch.label.fx";
		label.value = FireIE.GetLocalizedString(labelId);
	}
	// 更新内核切换按钮tooltip文字
	var tooltip = document.getElementById("fireie-urlbar-switch-tooltip2");
	if (tooltip) {
		var tooltipId = isIEEngine ? "fireie.urlbar.switch.tooltip2.ie" : "fireie.urlbar.switch.tooltip2.fx";
		tooltip.value = FireIE.GetLocalizedString(tooltipId);
	}
}

/** 切换当前页面内核*/
FireIE.switchEngine = function() {
	FireIE.switchTabEngine(gBrowser.mCurrentTab);
}

/** 打开配置对话框 */
FireIE.openOptionsDialog = function(url) {
	if (!url) url = FireIE.getIeTabElmtURL();
	var icon = document.getElementById('ietab-status');
	window.openDialog('chrome://fireie/content/options.xul', "fireieOptionsDialog", 'chrome,centerscreen', FireIE.getUrlDomain(url), icon);
}

/** 新建一个ie标签*/
FireIE.addIeTab = function(url) {
	var newTab = gBrowser.addTab(FireIE.getfireieURL(url));
	gBrowser.selectedTab = newTab;
	if (gURLBar && (url == 'about:blank')) window.setTimeout(function() {
		gURLBar.focus();
	}, 0);
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
			var isBlank = (FireIE.getIeTabTrimURL(gBrowser.currentURI.spec) == "about:blank");
			var handleUrlBar = FireIE.getBoolPref("extensions.fireie.handleUrlBar", false);
			var isSimilar = (FireIE.getUrlDomain(FireIE.getIeTabElmtURL()) == FireIE.getUrlDomain(url));
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
	FireIE.setUrlbarSwitchButtonStatus(FireIE.isIEEngine());
	
	if (!gURLBar || !FireIE.isIEEngine()) return;
	if (gBrowser.userTypedValue) {
		if (gURLBar.selectionEnd != gURLBar.selectionStart) window.setTimeout(function() {
			gURLBar.focus();
		}, 0);
	} else {
		var url = FireIE.getIeTabElmtURL();
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
	try {
		var fireieObject = FireIE.getIeTabElmt();
		var canBack = (fireieObject ? fireieObject.CanBack : false) || gBrowser.webNavigation.canGoBack;
		var canForward = (fireieObject ? fireieObject.CanForward : false) || gBrowser.webNavigation.canGoForward;
		FireIE.updateObjectDisabledStatus("Browser:Back", canBack);
		FireIE.updateObjectDisabledStatus("Browser:Forward", canForward);
	} catch (e) {}
}

/** 更新停止和刷新按钮状态*/
FireIE.updateStopReloadButtons = function() {
	try {
		var fireieObject = FireIE.getIeTabElmt();
		var isBlank = (gBrowser.currentURI.spec == "about:blank");
		var isLoading = gBrowser.mIsBusy;
		FireIE.updateObjectDisabledStatus("Browser:Reload", fireieObject ? fireieObject.CanRefresh : !isBlank);
		FireIE.updateObjectDisabledStatus("Browser:Stop", fireieObject ? fireieObject.CanStop : isLoading);
	} catch (e) {}
}

// 更新编辑菜单中cmd_cut、cmd_copy、cmd_paste状态
FireIE.updateEditMenuItems = function(e) {
	if (e.originalTarget != document.getElementById("menu_EditPopup")) return;
	var fireieObject = FireIE.getIeTabElmt();
	if (fireieObject) {
		FireIE.updateObjectDisabledStatus("cmd_cut", fireieObject.CanCut);
		FireIE.updateObjectDisabledStatus("cmd_copy", fireieObject.CanCopy);
		FireIE.updateObjectDisabledStatus("cmd_paste", fireieObject.CanPaste);
	}
}

// @todo 这是哪个按钮？
FireIE.updateSecureLockIcon = function() {
	var fireieObject = FireIE.getIeTabElmt();
	if (fireieObject) {
		var securityButton = document.getElementById("security-button");
		if (securityButton) {
			var url = fireieObject.URL;
			const wpl = Components.interfaces.nsIWebProgressListener;
			var state = (FireIE.startsWith(url, "https://") ? wpl.STATE_IS_SECURE | wpl.STATE_SECURE_HIGH : wpl.STATE_IS_INSECURE);
			window.XULBrowserWindow.onSecurityChange(null, null, state);
			securityButton.setAttribute("label", FireIE.getUrlHost(fireieObject.URL));
		}
	}
}

/** 更新fireie界面显示*/
FireIE.updateInterface = function() {
	FireIE.updateBackForwardButtons();
	FireIE.updateStopReloadButtons();
	FireIE.updateSecureLockIcon();
	FireIE.updateUrlBar();
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
			var fireieObject = FireIE.getIeTabElmt(mTabs[i]);
			if (fireieObject) {
				var aCurTotalProgress = fireieObject.Progress;
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
//	if (progress == -1) alert(FireIE.getIeTabElmtURL());
	FireIE.updateProgressStatus();
	FireIE.updateAll();
}

/** 响应新开IE标签的消息*/
FireIE.onNewIETab = function(event) {
	var id = event.detail;
	FireIE.addIeTab("FireIE.onNewIETab/"+id);
}

FireIE.onSecurityChange = function(security) {
	FireIE.updateSecureLockIcon();
}

/** 异步调用plugin的方法*/
FireIE.goDoCommand = function(cmd) {
	try {
		var fireieObject = FireIE.getIeTabElmt();
		if (fireieObject == null) {
			return false;
		}
		var param = null;
		switch (cmd) {
		case "Back":
			if (!fireieObject.CanBack) {
				return false;
			}
		case "Forward":
			if (!fireieObject.CanForward) {
				return false;
			}
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
		var fireieObject = FireIE.getIeTabElmt();
		switch (cmd) {
		case "Back":
			fireieObject.Back();
			break;
		case "Forward":
			fireieObject.Forward();
			break;
		case "Stop":
			fireieObject.Stop();
			break;
		case "Refresh":
			fireieObject.Refresh();
			break;
		case "SaveAs":
			fireieObject.SaveAs();
			break;
		case "Print":
			fireieObject.Print();
			break;
		case "PrintSetup":
			fireieObject.PrintSetup();
			break;
		case "PrintPreview":
			fireieObject.PrintPreview();
			break;
		case "Find":
			fireieObject.Find();
			break;
		case "cmd_cut":
			fireieObject.Cut();
			break;
		case "cmd_copy":
			fireieObject.Copy();
			break;
		case "cmd_paste":
			fireieObject.Paste();
			break;
		case "cmd_selectAll":
			fireieObject.SelectAll();
			break;
		case "Focus":
			fireieObject.Focus();
			break;
		case "HandOverFocus":
			fireieObject.HandOverFocus();
			break;
		case "Zoom":
			var zoomLevel = FireIE.getZoomLevel();
			fireieObject.Zoom(zoomLevel);
			break;
		case "DisplaySecurityInfo":    
			fireieObject.DisplaySecurityInfo();
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
		document.getElementById("fireie-urlbar-switch-context-menu").openPopup(e.target, "after_start", 0, 0, true, false);
	}
	
	e.preventDefault();
}

/** 将焦点设置到IE窗口上*/
FireIE.focusIE = function() {
	FireIE.goDoCommand("Focus");
}

FireIE.onTabSelected = function(e) {
	var aTab = e.originalTarget;
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
	FireIE.focusIE();

	// 检查是否需要自动切换到IE内核	
	var doc = e.originalTarget;
	var tab = FireIE.getTabByDocument(doc);
	if (!tab) return;
	
	var fireieObject = FireIE.getIeTabElmt(tab);
	if (!fireieObject) return;
	var attr = tab.getAttribute(FireIE.navigateParamsAttr);
	if (attr) {
		var navigateParams = null;
		try {
			navigateParams = JSON.parse(attr);
			if (navigateParams) {
				fireieObject.Navigate(navigateParams.url, navigateParams.headers, navigateParams.post);
			}			
		} catch (ex) {alert(ex);}
		tab.removeAttribute(FireIE.navigateParamsAttr);
	}	
}

/** 响应界面大小变化事件
 * @todo 为何要Zoom
 */
FireIE.onResize = function(e) {
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
		var fireieObject = FireIE.getIeTabElmt();
		if (fireieObject) {
			FireIE.goDoCommand("HandOverFocus");
		}
	}
	FireIE.hookProp(aURLBar, "value", null, function() {
		this.isModeIE = arguments[0] && (arguments[0].substr(0, FireIE.containerUrl.length) == FireIE.containerUrl);
		if (this.isModeIE) {
			arguments[0] = FireIE.getIeTabTrimURL(arguments[0]);
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
	FireIE.hookCode("PlacesCommandHook.bookmarkPage", "aBrowser.currentURI", "makeURI(FireIE.getIeTabTrimURL($&.spec))"); // 添加到收藏夹时获取实际URL
	FireIE.hookCode("PlacesStarButton.updateState", /(gBrowser|getBrowser\(\))\.currentURI/g, "makeURI(FireIE.getIeTabTrimURL($&.spec))"); // 用IE内核浏览网站时，在地址栏中正确显示收藏状态(星星按钮黄色时表示该页面已收藏)
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
	FireIE.hookCode("MailIntegration.sendMessage", /{/, "$& var fireieObject = FireIE.getIeTabElmt(); if(fireieObject){ arguments[0]=fireieObject.URL; arguments[1]=fireieObject.Title; }"); // @todo 发送邮件？

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

	FireIE.addEventListener(window, "DOMContentLoaded", FireIE.onPageShowOrLoad);
	FireIE.addEventListener(window, "pageshow", FireIE.onPageShowOrLoad);
	FireIE.addEventListener(window, "resize", FireIE.onResize);

	FireIE.addEventListener(gBrowser.tabContainer, "TabSelect", FireIE.onTabSelected);

	FireIE.addEventListener("menu_EditPopup", "popupshowing", FireIE.updateEditMenuItems);

	FireIE.addEventListener(window, "ProgressChanged", FireIE.onIEProgressChange);
	FireIE.addEventListener(window, "NewIETab", FireIE.onNewIETab);
}

FireIE.removeEventAll = function() {
	FireIE.observerService.removeObserver(FireIE.HttpObserver, 'http-on-modify-request');
	
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

	FireIE.hookCodeAll();
	FireIE.addEventAll();
	FireIE.updateAll();	
}

FireIE.destroy = function() {
	FireIE.removeEventListener(window, "unload", FireIE.destroy);

	FireIE.removeEventAll();
}


FireIE.browse = function(url, feature) {
	var windowMediator = Components.classes['@mozilla.org/appshell/window-mediator;1'].getService(Components.interfaces.nsIWindowMediator);
	if (windowMediator) {
		var w = windowMediator.getMostRecentWindow('navigator:browser');
		if (w && !w.closed) {
			var browser = w.getBrowser();
			var b = (browser.selectedTab = browser.addTab()).linkedBrowser;
			b.stop();
			b.webNavigation.loadURI(url, Components.interfaces.nsIWebNavigation.FLAGS_NONE, null, null, null);
		} else {
			window.open(url, "_blank", features || null)
		}
	}
}

window.addEventListener("load", FireIE.init, false);
window.addEventListener("unload", FireIE.destroy, false);
FireIE.manualSwitchUrl = null;
FireIE.engineAttr = "fireieEngine";
