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
  
  addEventListener("fireie:sendAsyncMessage", function(event)
  {
    let containerWindow = event.target;
    if (!containerWindow instanceof Ci.nsIDOMWindow) return;
    
    let url = containerWindow.location.href;
    if (url.startsWith("chrome://fireie/content/container.xhtml?url="))
    {
      let detailObj = JSON.parse(event.detail);
      sendAsyncMessage(detailObj.name, detailObj.data);
    }
  }, false, true);
})();
