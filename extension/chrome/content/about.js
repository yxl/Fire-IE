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

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
 
function init()
{
  if (window.arguments && window.arguments[0])
  {
    initAddon(window.arguments[0]);
    // Show the close button if it is open as a standalone dialog
    document.getElementById("fireieAbout").buttons = "accept";
  }
  else
  {
    Cu.import("resource://gre/modules/AddonManager.jsm");
    AddonManager.getAddonByID(Utils.addonID, initAddon);
  }
}

function initAddon(addon)
{
  var extensionsStrings = document.getElementById("extensionsStrings");
  
  document.documentElement.setAttribute("addontype", addon.type);

  if (addon.iconURL)
  {
    var extensionIcon = document.getElementById("extensionIcon");
    extensionIcon.src = addon.iconURL;
  }

  document.title = extensionsStrings.getFormattedString("aboutWindowTitle", [addon.name]);
  var extensionName = document.getElementById("extensionName");
  extensionName.textContent = addon.name;

  var extensionVersion = document.getElementById("extensionVersion");
  if (addon.version)
    extensionVersion.setAttribute("value", extensionsStrings.getFormattedString("aboutWindowVersionString", [addon.version]));
  else
    extensionVersion.hidden = true;
  var extensionDescription = document.getElementById("extensionDescription");
  if (addon.description)
    extensionDescription.textContent = addon.description;
  else
    extensionDescription.hidden = true;
  extensionDescription.value = addon.description;
  var numDetails = 0;

  var extensionCreator = document.getElementById("extensionCreator");
  if (addon.creator) {
    extensionCreator.setAttribute("value", addon.creator);
    numDetails++;
  } else {
    extensionCreator.hidden = true;
    var extensionCreatorLabel = document.getElementById("extensionCreatorLabel");
    extensionCreatorLabel.hidden = true;
  }

  numDetails += appendToList("extensionDevelopers", "developersBox", addon.developers);
  numDetails += appendToList("extensionTranslators", "translatorsBox", addon.translators);
  numDetails += appendToList("extensionContributors", "contributorsBox", addon.contributors);

  if (numDetails == 0) {
    var groove = document.getElementById("groove");
    groove.hidden = true;
    var extensionDetailsBox = document.getElementById("extensionDetailsBox");
    extensionDetailsBox.hidden = true;
  }

  var acceptButton = document.documentElement.getButton("accept");
  acceptButton.label = extensionsStrings.getString("aboutWindowCloseButton");
  
  processDescriptions();
  
  Utils.runAsync(function()
  {
    doSizeToContent(window, document);
    Utils.runAsyncTimeout(function()
    {
      document.getElementById("extensionDetailsBox").scrollTop = 0;
    }, this, 0);
  }, this);
}

function appendToList(aHeaderId, aNodeId, aItems) {
  var header = document.getElementById(aHeaderId);
  var node = document.getElementById(aNodeId);

  if (!aItems || aItems.length == 0) {
    header.hidden = true;
    return 0;
  }

  for (let currentItem of aItems) {
    var label = document.createElement("label");
    label.textContent = currentItem;
    label.setAttribute("class", "contributor");
    node.appendChild(label);
  }

  return aItems.length;
}

function openLink(url)
{
  Utils.loadInBrowser(url);
}

function processDescription(desc)
{
  let template = desc.getAttribute("_textTemplate");
  if (template)
  {
    let html = template.replace(/\[link\s+href\s*=\s*'(.*?)'\](.*?)\[\/link\]/g,
                       function(str, url, linkText)
                       {
                         if (!linkText) linkText = url;
                         return ["<label class=\"text-link\" tooltiptext=\"", url, "\" ",
                                 "onclick=\"if (event.button == 0) openLink('", url, "')\">",
                                 linkText, "</label>"].join("");
                       })
                       .replace(/\[(\w+)\]/g, "<html:$1>")
                       .replace(/\[\/(\w+)\]/g, "</html:$1>")
                       .replace(/\[(\w+)\s*\/\]/g, "<html:$1 />")
                       .replace(/\[\.([\w\d.#]+)\]/g, "&$1;");
    desc.innerHTML = html;
  }
  else if (!desc.textContent)
  {
    desc.hidden = true;
  }
}

function processDescriptions()
{
  let descs = document.getElementsByTagName("description");
  for (let i = 0; i < descs.length; i++)
  {
    let desc = descs[i];
    processDescription(desc);
  }
}
