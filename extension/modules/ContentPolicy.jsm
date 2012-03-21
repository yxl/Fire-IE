/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 * The Original Code is Adblock Plus.
 *
 * The Initial Developer of the Original Code is
 * Wladimir Palant.
 * Portions created by the Initial Developer are Copyright (C) 2006-2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Yuan Xulei(hi@yxl.name)
 */

/**
 * @fileOverview Content policy implementation, responsible for automatially engin switching.
 */

var EXPORTED_SYMBOLS = ["Policy"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

Cu.import(baseURL.spec + "Utils.jsm");
Cu.import(baseURL.spec + "Prefs.jsm");
Cu.import(baseURL.spec + "RuleStorage.jsm");
Cu.import(baseURL.spec + "RuleClasses.jsm");
Cu.import(baseURL.spec + "Matcher.jsm");

/**
 * Public policy checking functions and auxiliary objects
 * @class
 */
var Policy = {

  /**
   * Map containing all schemes that should be ignored by content policy.
   * @type Object
   */
  whitelistSchemes: {},

  /**
   * Called on module startup.
   */
  startup: function()
  {
    // whitelisted URL schemes
    for each(var scheme in Prefs.autoswitch_whitelistschemes.toLowerCase().split(" "))
	{
	  Policy.whitelistSchemes[scheme] = true;
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
      Utils.ERROR(e);
    }

    let catMan = Utils.categoryManager;
    for each(let category in PolicyPrivate.xpcom_categories)
    catMan.addCategoryEntry(category, PolicyPrivate.classDescription, PolicyPrivate.contractID, false, true);

    Services.obs.addObserver(PolicyPrivate, "http-on-modify-request", true);
  },

  shutdown: function()
  {
    PolicyPrivate.previousRequest = null;
  },

  /**
   * Checks whether the page should be loaded in IE engine. 
   * @param {String} url
   * @return {Boolean} true if IE engine should be used.
   */
  checkEngineRule: function(url)
  {
    let docDomain = Utils.getHostname(url);
    let match = EngineMatcher.matchesAny(url, docDomain);
    if (match)
    {
      RuleStorage.increaseHitCount(match);
    }
    return match && match instanceof EngineRule;
  },

  /**
   * Checks whether IE user agent should be used. 
   * @param {String} url
   * @return {Boolean} true if IE user agent should be used. 
   */
  checkUserAgentRule: function(url, domain)
  {
    let match = UserAgentMatcher.matchesAny(url, domain);
    if (match)
    {
      RuleStorage.increaseHitCount(match);
    }
    return match && match instanceof UserAgentRule;
  },

  /**
   * Checks whether the location's scheme is blockable.
   * @param {nsIURI} location  
   * @return {Boolean}
   */
  isBlockableScheme: function(location)
  {
    return !(location.scheme in Policy.whitelistSchemes);
  }
};

/**
 * Private nsIContentPolicy and nsIChannelEventSink implementation
 * @class
 */
var PolicyPrivate = {
  classDescription: "Fire-IE content policy",
  classID: Components.ID("005C9F5D-B31B-4E22-9B3C-7FA31D1F333A"),
  contractID: "@fireie.org/fireie/policy;1",
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

    let browserNode = node ? node.QueryInterface(Ci.nsIDOMNode) : null;
    if (!browserNode) return Ci.nsIContentPolicy.ACCEPT;

    let location = Utils.unwrapURL(contentLocation);

    // Ignore whitelisted schemes
    if (!Policy.isBlockableScheme(location)) return Ci.nsIContentPolicy.ACCEPT;

    // User has manually switched to Firefox engine
    if (browserNode.getAttribute('manuallySwitchToFirefox') == Utils.getHostname(location.spec)) return Ci.nsIContentPolicy.ACCEPT;

    // Check engine switch list
    if (Policy.checkEngineRule(location.spec))
    {
      contentLocation.spec = Utils.toContainerUrl(location.spec);
    }

    return Ci.nsIContentPolicy.ACCEPT;
  },

  shouldProcess: function(contentType, contentLocation, requestOrigin, insecNode, mimeType, extra)
  {
    return Ci.nsIContentPolicy.ACCEPT;
  },

  //
  // nsIObserver interface implementation
  //
  observe: function(subject, topic, data, additional)
  {
    switch (topic)
    {
    case "http-on-modify-request":
      {
        if (!(subject instanceof Ci.nsIHttpChannel)) return;

        if (Prefs.autoswitch_enabled)
        {
          let url = subject.URI.spec;
          let domain = null;
          let wnd = Utils.getRequestWindow(subject);
          if (wnd)
          {
            domain = Utils.getHostname(wnd.location.href);
          }
          if (Policy.checkUserAgentRule(url, domain) && Utils.ieUserAgent)
          {
            // Change user agent
            subject.setRequestHeader("user-agent", Utils.ieUserAgent, false);
          }
        }
        break;
      }
    }
  },

  //
  // nsIFactory interface implementation
  //
  createInstance: function(outer, iid)
  {
    if (outer) throw Cr.NS_ERROR_NO_AGGREGATION;
    return this.QueryInterface(iid);
  }
};