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
 * @fileOverview Observes Firefox default font setting and sync it to IE engie.
 */

var EXPORTED_SYMBOLS = ["FontObserver"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

Cu.import(baseURL.spec + "Utils.jsm");

const prefRoot = "font.name.";

/**
 * Preferences branch containing the default font setting preferences.
 * @type nsIPrefBranch
 */
let branch = Services.prefs.getBranch(prefRoot).QueryInterface(Ci.nsIPrefBranch2);

/**
 * This object monitors the changes of default font.
 * @class
 */
var FontObserver = {
  /**
   * Called on module startup.
   */
  startup: function()
  {
    // Register observers
    registerObserver();
    PrefsPrivate.notifyDataChange();
  },

  /**
   * Called on module shutdown.
   */
  shutdown: function()
  {
    unregisterObserver();
  }
};

/**
 * Private nsIObserver implementation
 * @class
 */
var PrefsPrivate = {
  /**
   * nsIObserver implementation
   */
  observe: function(subject, topic, data)
  {
    if (topic == "nsPref:changed")
    {
      this.notifyDataChange();
    }
  },

  notifyDataChange: function()
  {
    let fontName = this.getFirefoxDefaultFontName();
    if (fontName) setIEDefaultFont(fontName);
  },

  getFirefoxDefaultFontName: function()
  {
    try
    {
      let locale = Services.prefs.getCharPref("general.useragent.locale");
      let defaultFontTypeForLanguage = Services.prefs.getCharPref("font.default.%LANG%".replace(/%LANG%/, locale));
      let fontNameKey = defaultFontTypeForLanguage == "serif" ? "font.name.serif.%LANG%" : "font.name.sans-serif.%LANG%";
      return decodeURIComponent(escape(Services.prefs.getCharPref(fontNameKey.replace(/%LANG%/, locale))));
    }
    catch (e)
    {
      Utils.ERROR(e);
      return "";
    }
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsISupportsWeakReference, Ci.nsIObserver])
}

/**
 * Adds observers to keep various properties of Prefs object updated.
 */
function registerObserver()
{
  // Observe preferences changes
  try
  {
    branch.addObserver("", PrefsPrivate, true);
  }
  catch (e)
  {
    Utils.ERROR(e);
  }
}

function unregisterObserver()
{
  try
  {
    branch.removeObserver("", PrefsPrivate);
  }
  catch (e)
  {
    Utils.ERROR(e);
  }
}

/**
 * Set the default font for IE.
 * Refer to http://msdn.microsoft.com/en-us/library/aa918682.aspx for more information.
 */
function setIEDefaultFont(fontName)
{
  const wrk = Cc["@mozilla.org/windows-registry-key;1"].createInstance(Ci.nsIWindowsRegKey);
  const scriptsKey = "Software\\Microsoft\\Internet Explorer\\International\\Scripts";

  try
  {
    // Get current locale's script ID.
    wrk.create(wrk.ROOT_KEY_CURRENT_USER, scriptsKey, wrk.ACCESS_ALL);
    let scriptId = wrk.readIntValue("Default_Script");
    wrk.close();

    let fontKey = scriptsKey + "\\" + scriptId;
    wrk.create(wrk.ROOT_KEY_CURRENT_USER, fontKey, wrk.ACCESS_ALL);
    wrk.writeStringValue("IEPropFontName", fontName);
    wrk.writeStringValue("IEFixedFontName", fontName);
    wrk.close();
  }
  catch (e)
  {
    Utils.ERROR(e);
  }
}