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
    if (Utils.isFirefoxOnly(url))
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
    
    let uaSiteRuleTexts =
      makeSiteCheckbox("##||", Utils.getString("fireie.erc.uaOnSite"), effHost, effHost, "", "$SPECIAL-UA=ESR")
      .concat(
      makeSiteCheckbox("##||", Utils.getString("fireie.erc.uaESROnSite"), effHost, effHost, "$SPECIAL-UA=ESR", "", true));
    
    curItem.setAttribute("tooltiptext", Utils.esrUserAgent);
    curItem.nextSibling.setAttribute("tooltiptext", Utils.ieUserAgent);
    
    let uaRule = UserAgentMatcher.matchesAny(url);
    if (uaRule && !isExceptionalRule(uaRule)
      && uaSiteRuleTexts.every(function(t) t != uaRule.text))
    {
      addCheckbox([uaRule],
        Utils.getString(isESRRule(uaRule) ? "fireie.erc.uaESROnPage" : "fireie.erc.uaOnPage")
          .replace(/--/, saturate(pureRuleText(uaRule))),
        true).setAttribute("tooltiptext", isESRRule(uaRule) ? Utils.esrUserAgent : Utils.ieUserAgent);
    }
    
    let tmpItem = curItem;
    uaSiteRuleTexts = makeSiteCheckbox("@@##||", Utils.getString("fireie.erc.uaDefaultOnSite"), effHost, effHost);
    if (curItem !== tmpItem)
      curItem.setAttribute("tooltiptext", Utils.userAgent);
    
    uaRule = UserAgentMatcher.matchesAny(url);
    if (uaRule && isExceptionalRule(uaRule)
      && uaSiteRuleTexts.every(function(t) t != uaRule.text))
    {
      addCheckbox([uaRule],
        Utils.getString("fireie.erc.uaDefaultOnPage").replace(/--/, saturate(pureRuleText(uaRule))),
        true).setAttribute("tooltiptext", Utils.userAgent);
    }
    
    if (curItem !== lastItem) addSeparator();
    lastItem = curItem;
    
    // auto-switch does not affect ua rules, so we check it here
    if (!Prefs.autoswitch_enabled) return;
    
    makeSelfCheckbox("", Utils.getString("fireie.erc.enableOnPage"), url);
    let siteRuleTexts = makeSiteCheckbox("||", Utils.getString("fireie.erc.enableOnSite"), host, effHost);

    let rule = EngineMatcher.matchesAny(url);
    let inequalFunc = function(t) t != rule.text;
    if (rule && !isExceptionalRule(rule)
      && siteRuleTexts.every(inequalFunc)
      && selfRuleTexts("", url).every(inequalFunc))
    {
      addCheckbox([rule],
        Utils.getString("fireie.erc.enableOnUrl").replace(/--/, saturate(pureRuleText(rule))),
        true);
    }
    
    makeSelfCheckbox("@@", Utils.getString("fireie.erc.disableOnPage"), url);
    siteRuleTexts = makeSiteCheckbox("@@||", Utils.getString("fireie.erc.disableOnSite"), host, effHost);

    if (rule && isExceptionalRule(rule)
      && siteRuleTexts.every(inequalFunc)
      && selfRuleTexts("@@", url).every(inequalFunc))
    {
      addCheckbox([rule],
        Utils.getString("fireie.erc.disableOnUrl").replace(/--/, saturate(pureRuleText(rule))),
        true);
    }
    
    if (curItem !== lastItem) addSeparator();
    
    function saturate(str)
    {
      return Utils.saturateString(str, 30);
    }
    
    function addCheckbox(rules, label, active, nodisable, opRules)
    {
      let checkbox = makeNewCheckbox(rules, label, active, opRules);
      menu.insertBefore(checkbox, curItem);
      curItem = checkbox;
      if (active && !nodisable)
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
    
    function addSeparator()
    {
      let separator = CE("menuseparator");
      separator.className = self._enableOnClassName;
      menu.insertBefore(separator, curItem);
      curItem = separator;
      return separator;
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
      
    function makeSiteCheckbox(prefix, description, host, effHost, suffix, opSuffix, nodisable)
    {
      // for host 'www.xxx.com', ignore 'www' unless rule '||www.xxx.com^' is active.
      if (!isActive(hostRule())) host = host.replace(/^www\./, '');
      
      let hostRuleTexts = [];
      
      while (true)
      {
        let rule = hostRule();
        let rules = [rule].concat(relatedHostRules());
        let opRules = typeof(opSuffix) == "string" ? [hostOpRule()].concat(relatedHostOpRules()) : null;
        let active = rules.some(isActive);
        if (active || !isExceptionalRule(rule))
        {
          let label = description.replace(/--/, host);
          addCheckbox(rules, label, active, nodisable, opRules);
          Array.prototype.splice.apply(hostRuleTexts, [hostRuleTexts.length, 0].concat(rules.map(function(r) r.text)));
        }
        if (host == effHost || host.length < effHost.length) break;

        // strip sub domain
        host = host.replace(/^[^\.]+\./, '');
        // com
        if (host.indexOf('.') <= 0) break;
        // com.cn
        if (/^(?:com|net|org|edu|gov)\.[a-z]{2}$/i.test(host) && !isActive(hostRule())) break;
      }
      
      return hostRuleTexts;

      function hostRule()
      {
        return Rule.fromText(prefix + host + "^" + (suffix || ""));
      }
      
      function relatedHostRules()
      {
        return [prefix + host + "/" + (suffix || ""), prefix + host + (suffix || "")].map(Rule.fromText);
      }
      
      function hostOpRule()
      {
        return Rule.fromText(prefix + host + "^" + (opSuffix || ""));
      }
      
      function relatedHostOpRules()
      {
        return [prefix + host + "/" + (opSuffix || ""), prefix + host + (opSuffix || "")].map(Rule.fromText);
      }

    }
    
    function makeNewCheckbox(rules, label, active, opRules)
    {
      var checkbox = CE("menuitem");
      checkbox.className = self._enableOnClassName;
      checkbox.setAttribute("type", "checkbox");
      checkbox.setAttribute("label", label);
      checkbox.setAttribute("closemenu", "none");
      checkbox.setAttribute("tooltiptext", rules[0].text);
      checkbox.addEventListener('command', function()
      {
        toggleRule(rules, opRules);
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
     * @return true  if rule is for switching to ESR UA
     */
    function isESRRule(/**Rule*/ rule)
    {
      return rule.specialUA && rule.specialUA.toUpperCase() == "ESR";
    }
    
    /**
     * @return rule text with options part striped off
     */
    function pureRuleText(/**Rule*/ rule)
    {
      let text = rule.text;
      if (text.substring(0, 2) == "@@")
        text = text.substring(2);
      if (text.substring(0, 2) == "##")
        text = text.substring(2);

      if (Rule.optionsRegExp.test(text))
      {
        return RegExp.leftContext;
      }
      return text;
    }
    
    /**
     * If the given rule is active, remove/disable it, Otherwise add/enable it.
     */
    function toggleRule(rules, opRules)
    {
      if (rules.some(isActive)) {
        rules.forEach(function(rule) {
          rule.disabled = true;
        });
      }
      else {
        if (opRules && opRules.some(isActive))
        {
          opRules.forEach(function(rule) {
            rule.disabled = true;
          });
        }
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
