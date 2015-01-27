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
 * @fileOverview Utils for frame script to call chrome functions
 */

var EXPORTED_SYMBOLS = ["ChromeBridge"];

let Cc = Components.classes;
let Ci = Components.interfaces;
let Cr = Components.results;
let Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

// Private URI registration
let chromeSupported = true;
let publicURL = Services.io.newURI("resource://fireie/Public.jsm", null, null);
let baseURL = publicURL.clone().QueryInterface(Ci.nsIURL);
baseURL.fileName = "";

if (baseURL instanceof Ci.nsIMutable) baseURL.mutable = false;

const cidPrivate = Components.ID("{B264B58F-2948-4E8A-9824-45AA6C19697E}");
const contractIDPrivate = "@fireie.org/fireie/private;1";

let factoryPrivate = {
  createInstance: function(outer, iid)
  {
    if (outer) throw Cr.NS_ERROR_NO_AGGREGATION;
    return baseURL.QueryInterface(iid);
  }
};

Cu.import(baseURL.spec + "ContentUtils.jsm");

let initialized = false;

let ChromeBridge = {
  startup: function()
  {
    if (initialized) return;
    initialized = true;
    
    // Register component to allow retrieving private and public URL
    let registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
    registrar.registerFactory(cidPrivate, "Fire-IE private module URL", contractIDPrivate, factoryPrivate);
  },
  
  shutdown: function()
  {
    if (!initialized) return;
  },
  
  reloadContainerPage: function(frameGlobal)
  {
    frameGlobal.sendAsyncMessage("fireie:reloadContainerPage");
  },
  
  _requestFrameGlobal: function(window, callback, args)
  {
    let doc = window.document;
    let event = doc.createEvent("CustomEvent");
    let detail = {
      callback: callback,
      thisPtr: this,
      args: args,
      result: undefined
    };
    event.initCustomEvent("fireie:requestFrameGlobal", true, true, detail);
    window.dispatchEvent(event);
    return detail.result;
  },
  
  shouldLoadInWindow: function(window, locationSpec)
  {
    // We don't have frameGlobal here. Fire an event to retrieve it
    return this._requestFrameGlobal(window, function(frameGlobal, locationSpec)
    {
      return frameGlobal.sendSyncMessage("fireie:shouldLoadInBrowser", locationSpec);
    }, [locationSpec]);
  },
  
  notifyIsRootWindowRequest: function(window, locationSpec)
  {
    return this._requestFrameGlobal(window, function(frameGlobal, locationSpec)
    {
      return frameGlobal.sendSyncMessage("fireie:notifyIsRootWindowRequest", locationSpec);
    }, [locationSpec]);
  },
  
  handleThemeRequest: function(frameGlobal, action, themeData)
  {
    frameGlobal.sendAsyncMessage("fireie:" + action, JSON.stringify(themeData));
  }
};

ChromeBridge.startup();
