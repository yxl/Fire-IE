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

(function() {
  let Cc = Components.classes;
  let Ci = Components.interfaces;
  let Cr = Components.results;
  let Cu = Components.utils;

  // Don't do anything if we are not in e10s window
  if ("@fireie.org/fireie/public;1" in Cc) return;

  Cu.import("resource://gre/modules/XPCOMUtils.jsm");
  Cu.import("resource://gre/modules/Services.jsm");
  Cu.import("resource://fireie/ChromeBridge.jsm");
  
  let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);
  
  Cu.import(baseURL.spec + "ContentPrefs.jsm");
  Cu.import(baseURL.spec + "ContentProcessContentPolicy.jsm");
  
  addEventListener("fireie:reloadContainerPage", function(event)
  {
    let containerWindow = event.target;
    if (!containerWindow instanceof Ci.nsIDOMWindow) return;
    
    let url = containerWindow.location.href;
    if (url.startsWith("chrome://fireie/content/container.xhtml?url="))
    {
      ChromeBridge.reloadContainerPage(this);
    }
  }, false);
  
  addEventListener("fireie:shouldLoadInWindow", function(event)
  {
    let locationSpec = event.detail.locationSpec;
    event.detail.result = ChromeBridge.shouldLoadInFrame(this, locationSpec);
  }, false, true);
})();
