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
 * @fileOverview Module of favicon manipulation
 */

var EXPORTED_SYMBOLS = ["Favicon"];

var Favicon = {

  setIcon: function(document, iconURL) {
    var link = this._docHead(document).querySelector("link[rel=icon]");
    // If favicon not changed, do nothing
    if (link && link.href === iconURL)
      return;
    
    // Remove previous favicon if exists
    if (link)
      link.parentElement.removeChild(link);
    // Add new favicon
    if (iconURL)
      this._addIcon(document, iconURL);
  },

  _addIcon: function(document, iconURL) {
    var link = document.createElement("link");
    link.type = "image/x-icon";
    link.rel = "icon";
    link.href = iconURL;
    this._docHead(document).appendChild(link);
  },

  _docHead: function(document) {
    return document.getElementsByTagName("head")[0];
  }

};
