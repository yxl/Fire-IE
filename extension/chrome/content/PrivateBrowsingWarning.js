/**
 * ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 * 
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 * 
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 * 
 * The Original Code is netError.xhtml.
 * 
 * The Initial Developer of the Original Code is
 * Netscape Communications Corporation.
 * Portions created by the Initial Developer are Copyright (C) 1998
 * the Initial Developer. All Rights Reserved.
 * 
 * Contributor(s):
 *   Adam Lock <adamlock@netscape.com>
 *   William R. Price <wrprice@alumni.rice.edu>
 *   Henrik Skupin <mozilla@hskupin.info>
 *   Jeff Walden <jwalden+code@mit.edu>
 *   Johnathan Nightingale <johnath@mozilla.com>
 *   Ehsan Akhgari <ehsan.akhgari@gmail.com>
 * 
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the LGPL or the GPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 * 
 * ***** END LICENSE BLOCK *****
 */

let Cc = Components.classes;
let Ci = Components.interfaces;
let Cr = Components.results;
let Cu = Components.utils;

// Error url MUST be formatted like this:
//   about:certerror?e=error&u=url&d=desc

// Note that this file uses document.documentURI to get
// the URL (with the format from above). This is because
// document.location.href gets the current URI off the docshell,
// which is the URL displayed in the location bar, i.e.
// the URI that the user attempted to load.

function getCSSClass()
{
  var url = document.documentURI;
  var matches = url.match(/s\=([^&]+)\&/);
  // s is optional, if no match just return nothing
  if (!matches || matches.length < 2)
    return "";

  // parenthetical match is the second entry
  return decodeURIComponent(matches[1]);
}

function getDescription()
{
  var url = document.documentURI;
  var desc = url.search(/d\=/);

  // desc == -1 if not found; if so, return an empty string
  // instead of what would turn out to be portions of the URI
  if (desc == -1)
    return "";

  return decodeURIComponent(url.slice(desc + 2));
}

function initPage()
{
  // Replace the "#1" string in the intro with the hostname.  Trickier
  // than it might seem since we want to preserve the <b> tags, but
  // not allow for any injection by just using innerHTML.  Instead,
  // just find the right target text node.
  var intro = document.getElementById('introContentP1');
  function replaceWithHost(node) {
    if (node.textContent == "#1")
      node.textContent = location.host;
    else
      for(var i = 0; i < node.childNodes.length; i++)
        replaceWithHost(node.childNodes[i]);
  };
  replaceWithHost(intro);
  
  if (getCSSClass() == "expertBadCert") {
    toggle('technicalContent');
    toggle('expertContent');
  }
  
  var tech = document.getElementById("technicalContentText");
  if (tech)
    tech.textContent = getDescription();
  
  addDomainErrorLink();
}

/* In the case of SSL error pages about domain mismatch, see if
   we can hyperlink the user to the correct site.  We don't want
   to do this generically since it allows MitM attacks to redirect
   users to a site under attacker control, but in certain cases
   it is safe (and helpful!) to do so.  Bug 402210
*/
function addDomainErrorLink() {
  // Rather than textContent, we need to treat description as HTML
  var sd = document.getElementById("technicalContentText");
  if (sd) {
    var desc = getDescription();
    
    // sanitize description text - see bug 441169
    
    // First, find the index of the <a> tag we care about, being careful not to
    // use an over-greedy regex
    var re = /<a id="cert_domain_link" title="([^"]+)">/;
    var result = re.exec(desc);
    if(!result)
      return;
    
    // Remove sd's existing children
    sd.textContent = "";

    // Everything up to the link should be text content
    sd.appendChild(document.createTextNode(desc.slice(0, result.index)));
    
    // Now create the link itself
    var anchorEl = document.createElement("a");
    anchorEl.setAttribute("id", "cert_domain_link");
    anchorEl.setAttribute("title", result[1]);
    anchorEl.appendChild(document.createTextNode(result[1]));
    sd.appendChild(anchorEl);
    
    // Finally, append text for anything after the closing </a>
    sd.appendChild(document.createTextNode(desc.slice(desc.indexOf("</a>") + "</a>".length)));
  }

  var link = document.getElementById('cert_domain_link');
  if (!link)
    return;
  
  var okHost = link.getAttribute("title");
  var thisHost = document.location.hostname;
  var proto = document.location.protocol;

  // If okHost is a wildcard domain ("*.example.com") let's
  // use "www" instead.  "*.example.com" isn't going to
  // get anyone anywhere useful. bug 432491
  okHost = okHost.replace(/^\*\./, "www.");

  /* case #1: 
   * example.com uses an invalid security certificate.
   *
   * The certificate is only valid for www.example.com
   *
   * Make sure to include the "." ahead of thisHost so that
   * a MitM attack on paypal.com doesn't hyperlink to "notpaypal.com"
   *
   * We'd normally just use a RegExp here except that we lack a
   * library function to escape them properly (bug 248062), and
   * domain names are famous for having '.' characters in them,
   * which would allow spurious and possibly hostile matches.
   */
  if (endsWith(okHost, "." + thisHost))
    link.href = proto + okHost;

  /* case #2:
   * browser.garage.maemo.org uses an invalid security certificate.
   *
   * The certificate is only valid for garage.maemo.org
   */
  if (endsWith(thisHost, "." + okHost))
    link.href = proto + okHost;
    
  // If we set a link, meaning there's something helpful for
  // the user here, expand the section by default
  if (link.href && getCSSClass() != "expertBadCert")
    toggle("technicalContent");
}

function endsWith(haystack, needle) {
  return haystack.slice(-needle.length) == needle;
}

function toggle(id) {
  var el = document.getElementById(id);
  if (el.getAttribute("collapsed"))
    el.removeAttribute("collapsed");
  else
    el.setAttribute("collapsed", true);
}

function markContinue() {
  var baseURL = Components.classes["@fireie.org/fireie/private;1"].getService(Components.interfaces.nsIURI);
  var jsm = {};
  Components.utils.import(baseURL.spec + "Prefs.jsm", jsm);
  Components.utils.import(baseURL.spec + "Utils.jsm", jsm);

  var win = jsm.Utils.getChromeWindowFrom(window);
  var gFireIE = win && win.gFireIE;
  if (gFireIE)
    gFireIE.setResumeFromPBW();
  
  jsm.Prefs.privatebrowsingwarning = document.getElementById("chkWarning").checked;
  parent.location.reload();
}
