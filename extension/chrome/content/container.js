var jsm = {};
Components.utils.import("resource://fireie/fireieUtils.jsm", jsm);
var {fireieUtils} = jsm;

var FireIEContainer = {
	init: function() {
		window.removeEventListener('DOMContentLoaded', FireIEContainer.init, false);
		var container = document.getElementById('container');
		if (!container) {
			MY_ERROR('Cannot find container div to insert fireie-object.');
			return;
		}
		if (FireIEContainer._isInPrivateBrowsingMode()) {
			container.innerHTML = '<iframe src="PrivateBrowsingWarning.xhtml" width="100%" height="100%" frameborder="no" border="0" marginwidth="0" marginheight="0" scrolling="no" allowtransparency="yes"></iframe>';
		} else {
			FireIEContainer._registerEventHandler();
		}			
	},
	
	destroy: function(event) {
		window.removeEventListener('unload', FireIEContainer.destroy, false);
		
	},
	
	getNavigateHeaders: function() {
		var headers = "";
		var tab = fireieUtils.getTabFromDocument(document);
		var navigateParams = fireieUtils.getTabAttributeJSON(tab, FireIE.navigateParamsAttr);
		if (navigateParams) {
			headers = navigateParams.headers;
		}
		MY_LOG('headers: ' + headers)
		return headers;
	},
	
	getNavigatePostData: function() {
		var post = "";
		var tab = fireieUtils.getTabFromDocument(document);
		var navigateParams = fireieUtils.getTabAttributeJSON(tab, FireIE.navigateParamsAttr);
		if (navigateParams) {
			post = navigateParams.post;
		}
		MY_LOG('post: ' + post)
		return post;	
	},
	
	removeNavigateParams: function() {
		var tab = fireieUtils.getTabFromDocument(document);
		var navigateParams = fireieUtils.getTabAttributeJSON(tab, FireIE.navigateParamsAttr);
		if (navigateParams) {
			tab.removeAttribute(FireIE.navigateParamsAttr);
		}	
	},

	_isInPrivateBrowsingMode: function() {
		var pbs;
		try { pbs = Components.classes["@mozilla.org/privatebrowsing;1"].getService(Components.interfaces.nsIPrivateBrowsingService); } catch (e) {}
		var privatebrowsingwarning = pbs && pbs.privateBrowsingEnabled && FireIE.getBoolPref("extensions.fireie.privatebrowsingwarning", true);
		
		if ( privatebrowsingwarning ) {
			var cookieService = Components.classes["@mozilla.org/cookieService;1"].getService(Components.interfaces.nsICookieService);
			var ioService = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
			var cookieManager = Components.classes["@mozilla.org/cookiemanager;1"].getService(Components.interfaces.nsICookieManager);
			try {
				var pbwFlag = cookieService.getCookieString(ioService.newURI("http://fireie/", null, null), null);
				if (pbwFlag) {
					privatebrowsingwarning = pbwFlag.indexOf("privatebrowsingwarning=no") < 0;
					cookieManager.remove("fireie", "privatebrowsingwarning", "/", false);
				}
			}
			catch (e) {ERROR(e)}
		}
		
		return privatebrowsingwarning;
	},

	_registerEventHandler: function() {
		window.addEventListener("PluginNotFound", FireIEContainer._pluginNotFoundListener, false);
		window.addEventListener("TitleChanged", FireIEContainer._onTitleChanged, false);
		window.addEventListener("CloseIETab", FireIEContainer._onCloseIETab, false);
		var pluginObject = document.getElementById(FireIE.objectID);
		if (pluginObject) {
			pluginObject.addEventListener("focus", FireIEContainer._onPluginFocus, false);
		}
	},
	

	_pluginNotFoundListener: function(event) {
		alert("Loading Fire IE plugin failed. Please try restarting Firefox.");
	},

	/** 响应Plugin标题变化事件 */
	_onTitleChanged: function(event) {
		var title = event.detail;
		document.title = title;
	},
	
	/** 响应关闭IE标签窗口事件 */
	_onCloseIETab: function(event) {
		window.setTimeout(function() {
			window.close();
		}, 100);
	},
	
	/**
	 * 当焦点在plugin对象上时，在plugin中按Alt+XXX组合键时，
	 * 菜单栏无法正常弹出，因此当plugin对象得到焦点时，需要
	 * 调用其blus方法去除焦点。
	 */
	_onPluginFocus: function(event) {
		var pluginObject = event.originalTarget;
		pluginObject.blur();
		pluginObject.Focus();
	}
}

window.addEventListener('DOMContentLoaded', FireIEContainer.init, false);
window.addEventListener('unload', FireIEContainer.destroy, false);
