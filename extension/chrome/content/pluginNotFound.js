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

function init()
{
  ["makeSure", "reinstall"].forEach(function(id)
  {
    generateLinkText(E(id));
  });
  doSizeToContent(window, document);
}

function generateLinkText(element)
{
  let template = element.getAttribute("_textTemplate");
  let url = element.querySelector("label.text-link").getAttribute("_url");
  if (url)
    template = template.replace(/\[host\]/, Utils.getHostname(url));
  
  let beforeLink, linkText, afterLink;
  if (/(.*)\[link\](.*)\[\/link\](.*)/.test(template))
    [beforeLink, linkText, afterLink] = [RegExp.$1, RegExp.$2, RegExp.$3];
  else
    [beforeLink, linkText, afterLink] = ["", template, ""];

  while (element.firstChild && element.firstChild.nodeType != Node.ELEMENT_NODE)
    element.removeChild(element.firstChild);
  while (element.lastChild && element.lastChild.nodeType != Node.ELEMENT_NODE)
    element.removeChild(element.lastChild);
  if (!element.firstChild)
    return;

  element.firstChild.textContent = linkText;
  element.insertBefore(document.createTextNode(beforeLink), element.firstChild);
  element.appendChild(document.createTextNode(afterLink));
}

function closeDialog()
{
  document.documentElement.acceptDialog();
}

function visitHomepage(element)
{
  Utils.loadInBrowser(element.getAttribute("_url"));
  closeDialog();
}

function openPluginManager()
{
  Utils.openAddonsMgr("addons://list/plugin");
  closeDialog();
}
