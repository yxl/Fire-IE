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
 * @fileOverview Manages the utility plugin
 */

var EXPORTED_SYMBOLS = ["UtilsPluginManager"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

Cu.import(baseURL.spec + "Utils.jsm");
Cu.import(baseURL.spec + "IECookieManager.jsm");

let UtilsPluginManager = {
  /**
   * Whether the utils plugin is initialized
   */
  isPluginInitialized: false,
  
  /**
   * Whether init() has been called
   */
  _isInitCalled: false,
  
  init: function()
  {
    if (this._isInitCalled) return;
    this._isInitCalled = true;
    this._install();
    this._registerHandlers();
  },
  
  uninit: function()
  {
    this._unregisterHandlers();
  },
  
  /**
   * Retrieves the utils plugin object
   */
  getPlugin: function()
  {
    let doc = Utils.getHiddenWindow().document;
    return doc.getElementById(Utils.utilsPluginId);
  },
  
  /**
   * Ensures that the plugin is initialized before calling the callback
   */
  fireAfterInit: function(callback, self, arguments)
  {
    if (this.isPluginInitialized)
    {
      callback.apply(self, arguments);
    }
    else
    {
      Utils.getHiddenWindow().addEventListener("IEUtilsPluginInitialized", function(e)
      {
        callback.apply(self, arguments);
      }, false);
    }
  },

  /**
   * Install the plugin used to do utility things like sync cookie
   */
  _install: function()
  {
    // Change the default cookie and cache directories of the IE, which will
    // be restored when the utils plugin is loaded.
    IECookieManager.changeIETempDirectorySetting();

    let self = this;
    Utils.getHiddenWindow().addEventListener("IEUtilsPluginInitialized", function(e)
    {
      self.isPluginInitialized = true;
    }, false);

    let doc = Utils.getHiddenWindow().document;
    let embed = doc.createElementNS("http://www.w3.org/1999/xhtml", "html:embed");
    embed.hidden = true;
    embed.setAttribute("id", Utils.utilsPluginId);
    embed.setAttribute("type", "application/fireie");
    embed.style.visibility = "collapse";
    doc.body.appendChild(embed);
  },
  
  _registerHandlers: function()
  {
    Utils.getHiddenWindow().addEventListener("IEUserAgentReceived", onIEUserAgentReceived, false);
    Utils.getHiddenWindow().addEventListener("IESetCookie", onIESetCookie, false);
  },
  
  _unregisterHandlers: function()
  {
    Utils.getHiddenWindow().removeEventListener("IEUserAgentReceived", onIEUserAgentReceived, false);
    Utils.getHiddenWindow().removeEventListener("IESetCookie", onIESetCookie, false);
  },
};

/** Handler for receiving IE UserAgent from the plugin object */
function onIEUserAgentReceived(event)
{
  let userAgent = event.detail;
  Utils.ieUserAgent = userAgent;
  Utils.LOG("_onIEUserAgentReceived: " + userAgent);
  IECookieManager.retoreIETempDirectorySetting();
}

/**
 * Handles 'IESetCookie' event receiving from the plugin
 */
function onIESetCookie(event)
{
  let subject = null;
  let topic = "fireie-set-cookie";
  let data = event.detail;
  Services.obs.notifyObservers(subject, topic, data);
}
