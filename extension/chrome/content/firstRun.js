/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

function init()
{
  generateLinkText(E("changeDescription"));

  for each (let subscription in FilterStorage.subscriptions)
  {
    if (subscription instanceof DownloadableSubscription && subscription.url != Prefs.subscriptions_exceptionsurl)
    {
      E("listName").textContent = subscription.title;

      let link = E("listHomepage");
      link.setAttribute("_url", subscription.homepage);
      link.setAttribute("tooltiptext", subscription.homepage);

      E("listNameContainer").hidden = false;
      E("listNone").hidden = true;
      break;
    }
  }

  if (FilterStorage.subscriptions.some(function(s) s.url == Prefs.subscriptions_exceptionsurl))
    E("acceptableAds").hidden = false;
}

function generateLinkText(element)
{
  let template = element.getAttribute("_textTemplate");

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

function openFilters()
{
  Utils.openFiltersDialog();
}
