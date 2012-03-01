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
      fireieUtils.LOG('FireIE.getTabAttributeJSON:' + ex);
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
      fireieUtils.ERROR(err);
    }
    return null;
  },
  
  getTabFromWindow: function(win) {
    function getRootWindow(win) {
      for (; win; win = win.parent) {
        if (!win.parent || win == win.parent || !(win.parent instanceof Components.interfaces.nsIDOMWindow))
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

/**
 * Set the value of preference "extensions.logging.enabled" to false to hide
 * fireieUtils.LOG message
 */
["LOG", "WARN", "ERROR"].forEach(function(aName) {
  XPCOMUtils.defineLazyGetter(fireieUtils, aName, function() {
    Components.utils.import("resource://gre/modules/AddonLogging.jsm");
    let logger = {};
    LogManager.getLogger("[fireie]", logger);
    return logger[aName];
  });
});