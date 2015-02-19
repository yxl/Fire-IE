/*
This file is part of Fire-IE.

Fire-IE is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Fire-IE is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with Fire-IE. If not, see <http://www.gnu.org/licenses/>.
*/

/**
 * @fileOverview Manages hooks to shared functions (not window-specific)
 */

let EXPORTED_SYMBOLS = ["SharedHooks"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);

Cu.import(baseURL.spec + "HookManager.jsm");
Cu.import(baseURL.spec + "Utils.jsm");

let HM = Cc["@fireie.org/fireie/hook-manager-global;1"].getService().wrappedJSObject;
let RET = HookManager.RET;

let SharedHooks = {
  lazyStartup: function()
  {
  },
  
  shutdown: function()
  {
  }
};
