/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);
Cu.import(baseURL.spec + "ContentPolicy.jsm");
Cu.import(baseURL.spec + "RuleClasses.jsm");
Cu.import(baseURL.spec + "RuleListener.jsm");
Cu.import(baseURL.spec + "RuleStorage.jsm");
Cu.import(baseURL.spec + "RuleNotifier.jsm");
Cu.import(baseURL.spec + "Matcher.jsm");
Cu.import(baseURL.spec + "Prefs.jsm");
Cu.import(baseURL.spec + "SubscriptionClasses.jsm");
Cu.import(baseURL.spec + "Synchronizer.jsm");
Cu.import(baseURL.spec + "Utils.jsm");

Cu.import("resource://gre/modules/Services.jsm");

/**
 * Shortcut for document.getElementById(id)
 */
function E(id)
{
  return document.getElementById(id);
}

/**
 * for multi-line label sizing problem
 */
function doSizeToContent(window, document)
{
  window.sizeToContent();
  let vboxes = document.querySelectorAll("prefpane > vbox");
  Array.prototype.forEach.call(vboxes, function(vbox)
  {
    vbox.height = vbox.boxObject.height;
  });
  window.sizeToContent();
}
