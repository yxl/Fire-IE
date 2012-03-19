/**
 * @fileOverview Module of favicon manipulation
 */

var EXPORTED_SYMBOLS = ["Favicon"];

var Favicon = {

setIcon: function(document, iconURL) {
  this.removeIconIfExists(document);
  this.addIcon(document, iconURL);
},

addIcon: function(document, iconURL) {
  var link = document.createElement("link");
  link.type = "image/x-icon";
  link.rel = "icon";
  link.href = iconURL;
  this.docHead(document).appendChild(link);
},

removeIconIfExists: function(document) {
  var links = this.docHead(document).getElementsByTagName("link");
  for (var i=0; i<links.length; i++) {
    var link = links[i];
    if (link.rel=="icon") {
      this.docHead(document).removeChild(link);
      return; // Assuming only one match at most.
    }
  }
},

docHead: function(document) {
  return document.getElementsByTagName("head")[0];
}

};

