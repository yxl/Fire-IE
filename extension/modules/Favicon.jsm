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
    this._removeIconIfExists(document);
    this._addIcon(document, iconURL);
  },

  _addIcon: function(document, iconURL) {
    var link = document.createElement("link");
    link.type = "image/x-icon";
    link.rel = "icon";
    link.href = iconURL;
    this._docHead(document).appendChild(link);
  },

  _removeIconIfExists: function(document) {
    var links = this._docHead(document).getElementsByTagName("link");
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      if (link.rel == "icon") {
        this._docHead(document).removeChild(link);
        return; // Assuming only one match at most.
      }
    }
  },

  _docHead: function(document) {
    return document.getElementsByTagName("head")[0];
  }

};

