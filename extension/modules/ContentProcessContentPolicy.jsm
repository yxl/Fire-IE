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
 * @fileOverview Content policy implementation for content processes
 */

var EXPORTED_SYMBOLS = ["Policy"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/NetUtil.jsm");
Cu.import(baseURL.spec + "ChromeBridge.jsm");
Cu.import(baseURL.spec + "ContentUtils.jsm");
Cu.import(baseURL.spec + "ContentPrefs.jsm");

/**
 * Public policy checking functions and auxiliary objects
 * @class
 */
var Policy = {

  /**
   * Map containing all schemes that should be ignored by content policy.
   * @type Object
   */
  ignoredSchemes: {},

  /**
   * Called on module startup.
   */
  startup: function()
  {
    for each(var scheme in Prefs.contentPolicy_ignoredSchemes.toLowerCase().split(" "))
    {
      Policy.ignoredSchemes[scheme] = true;
    }

    // Register our content policy
    let registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
    try
    {
      registrar.registerFactory(PolicyPrivate.classID, PolicyPrivate.classDescription, PolicyPrivate.contractID, PolicyPrivate);
    }
    catch (e)
    {
      // Don't stop on errors - the factory might already be registered
      ContentUtils.ERROR(e);
    }

    let catMan = ContentUtils.categoryManager;
    for each(let category in PolicyPrivate.xpcom_categories)
    catMan.addCategoryEntry(category, PolicyPrivate.classDescription, PolicyPrivate.contractID, false, true);
  },

  shutdown: function()
  {
  },

  /**
   * Checks whether the engine of given location's scheme is switchable.
   * @param {nsIURI} location  
   * @return {Boolean}
   */
  isSwitchableScheme: function(location)
  {
    return !(location.scheme in Policy.ignoredSchemes);
  },
};

/**
 * Private nsIContentPolicy and nsIChannelEventSink implementation
 * @class
 */
var PolicyPrivate = {
  classDescription: "Fire-IE content process content policy",
  classID: Components.ID("4FF8682B-8DAE-4A29-85A4-0109CD4B9C41"),
  contractID: "@fireie.org/fireie/content-process-content-policy;1",
  xpcom_categories: ["content-policy"],

  //
  // nsISupports interface implementation
  //
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIContentPolicy, Ci.nsIObserver, Ci.nsIFactory, Ci.nsISupportsWeakReference]),

  //
  // nsIContentPolicy interface implementation
  //
  shouldLoad: function(contentType, contentLocation, requestOrigin, node, mimeTypeGuess, extra)
  {
    if (!Prefs.autoswitch_enabled) return Ci.nsIContentPolicy.ACCEPT;

    // Ignore requests within a page
    if (contentType != Ci.nsIContentPolicy.TYPE_DOCUMENT) return Ci.nsIContentPolicy.ACCEPT;

    let location = ContentUtils.unwrapURL(contentLocation);

    // Ignore whitelisted schemes
    if (!Policy.isSwitchableScheme(location)) return Ci.nsIContentPolicy.ACCEPT;

    // Loading the container page in content process does not work.
    // Let the page load - it should handle reloading itself.
    if (ContentUtils.isIEEngine(location.spec)) return Ci.nsIContentPolicy.ACCEPT;
    
    let window = null;
    try
    {
      window = node ? node.QueryInterface(Ci.nsIDOMWindow) : null;
    }
    catch (ex) {}
    if (!window || !ContentUtils.isRootWindow(window))
      return Ci.nsIContentPolicy.ACCEPT;
    
    return ChromeBridge.shouldLoadInWindow(window, location.spec);
  },

  shouldProcess: function(contentType, contentLocation, requestOrigin, insecNode, mimeType, extra)
  {
    return Ci.nsIContentPolicy.ACCEPT;
  },

  //
  // nsIFactory interface implementation
  //
  createInstance: function(outer, iid)
  {
    if (outer) throw Cr.NS_ERROR_NO_AGGREGATION;
    return this.QueryInterface(iid);
  },
};

Policy.startup();
