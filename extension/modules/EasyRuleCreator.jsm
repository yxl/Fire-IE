/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
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
 * The Original Code is AutoProxy.
 *
 * The Initial Developer of the Original Code is
 * Wang Congming <lovelywcm@gmail.com>.
 * Portions created by the Initial Developer are Copyright (C) 2010-2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Yifan Wu (patwonder@163.com)
 *
 * ***** END LICENSE BLOCK ***** */

/**
 * @fileOverview Easy rule creator, makes creating auto-switching rules easier
 */

let EXPORTED_SYMBOLS = ["EasyRuleCreator"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

Cu.import(baseURL.spec + "Utils.jsm");
Cu.import(baseURL.spec + "Prefs.jsm");
Cu.import(baseURL.spec + "SubscriptionClasses.jsm");
Cu.import(baseURL.spec + "RuleClasses.jsm");
Cu.import(baseURL.spec + "RuleStorage.jsm");
Cu.import(baseURL.spec + "Matcher.jsm");
Cu.import(baseURL.spec + "ContentPolicy.jsm");

let EasyRuleCreator = {
  _enableOnClassName: "fireie-enable-on",
  
  _removeMenuItemsByClass: function(menu, className)
  {
    let submenu = menu.firstChild;
    while (submenu)
    {
      let nextsubmenu = submenu.nextSibling;
      if (submenu.className == className)
        menu.removeChild(submenu);
      submenu = nextsubmenu;
    }
  },
  
  setPopupMenuItems: function(CE, menu, url)
  {
    // remove previously created items
    this._removeMenuItemsByClass(menu, this._enableOnClassName);
    
    // check whether current url is auto-switchable
    if (!Prefs.autoswitch_enabled || Utils.isFirefoxOnly(url))
      return;
    
    let schemeIdx = url.indexOf(":");
    let scheme = schemeIdx < 0 ? "" : url.substring(0, schemeIdx);
    
    if (!Policy.isSwitchableScheme(scheme))
      return;
    
    let host = Utils.getHostname(url);
    if (typeof(host) == "undefined" || host == null || host == "") return;
    let effHost = Utils.getEffectiveHost(url);
    
    let self = this;
    let curItem = menu.querySelector("#fireie-erc-start");
    let lastItem = curItem;
    
    makeSelfCheckbox("", Utils.getString("fireie.erc.enableOnPage"), url);
   
    let rule = EngineMatcher.matchesAny(url);
    if (rule && !isExceptionalRule(rule) && rule.text.indexOf("||") != 0 
      && selfRuleTexts("", url).every(function(t) t != rule.text))
    {
      addCheckbox([rule],
        Utils.getString("fireie.erc.enableOnUrl").replace(/--/, saturate(rule.text)),
        true);
    }
    
    makeSiteCheckbox("||", Utils.getString("fireie.erc.enableOnSite"), host, effHost);
    
    makeSelfCheckbox("@@", Utils.getString("fireie.erc.disableOnPage"), url);

    if (rule && isExceptionalRule(rule) && rule.text.indexOf("@@||") != 0
      && selfRuleTexts("@@", url).every(function(t) t != rule.text))
    {
      addCheckbox([rule],
        Utils.getString("fireie.erc.disableOnUrl").replace(/--/, saturate(rule.text)),
        true);
    }
    
    makeSiteCheckbox("@@||", Utils.getString("fireie.erc.disableOnSite"), host, effHost);
    
    function saturate(str)
    {
      return str.length > 30 ? str.substring(0, 27) + "..." : str;
    }
    
    function addCheckbox(rules, label, active)
    {
      let checkbox = makeNewCheckbox(rules, label, active);
      menu.insertBefore(checkbox, curItem);
      curItem = checkbox;
      if (active)
      {
        let item = curItem.nextSibling;
        while (item != lastItem)
        {
          item.setAttribute("disabled", true);
          item.style.color = "";
          item = item.nextSibling;
        }
      }
      return checkbox;
    }
    
    function selfRuleTexts(prefix, url)
    {
      return [prefix + "|" + url + "|", prefix + "|" + url, prefix + url + "|", prefix + url, prefix + "|" + url + "^", prefix + url + "^"];
    }
    
    function makeSelfCheckbox(prefix, description, url)
    {
      let rules = selfRuleTexts(prefix, url).map(Rule.fromText);
      let active = rules.some(isActive);
      if (active || !isExceptionalRule(rules[0]))
      {
        let label = description;
        addCheckbox(rules, label, active);
      }
    }
    
    function makeSiteCheckbox(prefix, description, host, effHost)
    {
      // for host 'www.xxx.com', ignore 'www' unless rule '||www.xxx.com^' is active.
      if (!isActive(hostRule())) host = host.replace(/^www\./, '');
      
      while (true)
      {
        let rule = hostRule();
        let rules = [rule].concat(relatedHostRules());
        let active = rules.some(isActive);
        if (active || !isExceptionalRule(rule))
        {
          let label = description.replace(/--/, host);
          addCheckbox(rules, label, active);
        }
        if (host == effHost) break;

        // strip sub domain
        host = host.replace(/^[^\.]+\./, '');
        // com
        if (host.indexOf('.') <= 0) break;
        // com.cn
        if (/^(?:com|net|org|edu|gov)\.[a-z]{2}$/i.test(host) && !isActive(hostRule())) break;
      }

      function hostRule()
      {
        return Rule.fromText(prefix + host + "^");
      }
      
      function relatedHostRules()
      {
        return [prefix + host + "/", prefix + host].map(Rule.fromText);
      }
    }
    
    function makeNewCheckbox(rules, label, active)
    {
      var checkbox = CE("menuitem");
      checkbox.className = self._enableOnClassName;
      checkbox.setAttribute("type", "checkbox");
      checkbox.setAttribute("label", label);
      checkbox.setAttribute("closemenu", "none");
      checkbox.addEventListener('command', function()
      {
        toggleRule(rules);
        self.setPopupMenuItems(CE, menu, url);
      }, false);

      if (active)
      {
        checkbox.setAttribute("checked", true);
        checkbox.style.color = isExceptionalRule(rules[0]) ? "red" : "green";
      }
      return checkbox;
    }
    /**
     * @return true  if rule exist & not disabled
     */
    function isActive(/**Rule*/ rule)
    {
      return !rule.disabled
        && rule.subscriptions.some(function(s) !s.disabled);
    }

    /**
     * @return true  if rule is an exceptional rule
     */
    function isExceptionalRule(/**Rule*/ rule)
    {
      return rule instanceof EngineExceptionalRule
        || rule instanceof UserAgentExceptionalRule;
    }
    
    /**
     * If the given rule is active, remove/disable it, Otherwise add/enable it.
     */
    function toggleRule(rules)
    {
      if (rules.some(isActive)) {
        rules.forEach(function(rule) {
          rule.disabled = true;
        });
      }
      else {
        for (let i = 0, l = rules.length; i < l; i++)
        {
          let rule = rules[i];
          if (rule.subscriptions.every(function(s) s.disabled))
            continue;
          if (rule.disabled)
            rule.disabled = false;
          return;
        }
        let rule = rules[0];
        let subscription = RuleStorage.getGroupForRule(rule);
        if (!subscription || !subscription.isDefaultFor(rule))
        {
          subscription = SpecialSubscription.createForRule(rule);
          RuleStorage.addSubscription(subscription);
        }
        else
          RuleStorage.addRule(rule, subscription);
        if (rule.disabled)
          rule.disabled = false;
      }
    }
  }
};
