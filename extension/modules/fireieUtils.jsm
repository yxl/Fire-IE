let EXPORTED_SYMBOLS = ['fireieUtils'];

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");

let fireieUtils = {
  getTabAttributeJSON: function(tab, name) {
    let attrString = tab.getAttribute(name);
    if (!attrString) {
      return null;
    }

    try {
      let json = JSON.parse(attrString);
      return json;
    } catch (ex) {
      MY_LOG('FireIE.getTabAttributeJSON:' + ex);
    }

    return null;
  },

  getChromeWindow: function() {
    let chromeWin = Services.wm.getMostRecentWindow("navigator:browser");
    return chromeWin;
  },

  setTabAttributeJSON: function(tab, name, value) {
    let attrString = JSON.stringify(value);
    tab.setAttribute(name, attrString);
  },

  getTabFromDocument: function(doc) {
    let aBrowser = this.getChromeWindow().gBrowser;
    if (!aBrowser.getBrowserIndexForDocument) return null;
    try {
      let tab = null;
      let targetBrowserIndex = aBrowser.getBrowserIndexForDocument(doc);

      if (targetBrowserIndex != -1) {
        tab = aBrowser.tabContainer.childNodes[targetBrowserIndex];
        return tab;
      }
    } catch (err) {
      MY_LOG(err);
    }
    return null;
  },
  
  getTabFromWindow: function(win) {
    function getRootWindow(win) {
      for (; win; win = win.parent) {
        if (!win.parent || win == win.parent || !(win.parent instanceof Window))
          return win;
      }
    
      return null;
    }  
    let aWindow = getRootWindow(win);
    
    if (!aWindow || !aWindow.document)
      return null;
    
    return this.getTabFromDocument(aWindow.document);
  }  

};



/**
 * Cache of commonly used string bundles.
 * Usage: fireieUtils.Strings.global.GetStringFromName("XXX")
 */
fireieUtils.Strings = {};
[
  ["global", "chrome://fireie/locale/global.properties"], ].forEach(function(aStringBundle) {
  let[name, bundle] = aStringBundle;
  XPCOMUtils.defineLazyGetter(fireieUtils.Strings, name, function() {
    return Services.strings.createBundle(bundle);
  });
});