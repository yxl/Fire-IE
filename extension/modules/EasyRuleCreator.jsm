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
  
  _removeMenuItemsByClass: function(menu, className, idToKeep)
  {
    if (idToKeep == "") idToKeep = null;
    let submenu = menu.firstChild;
    while (submenu)
    {
      let nextsubmenu = submenu.nextSibling;
      if (submenu.className == className && submenu.getAttribute("id") != idToKeep)
        menu.removeChild(submenu);
      submenu = nextsubmenu;
    }
  },
  
  _setUARuleMenuItems: function(ctx)
  {
    let uaSiteRuleTexts =
      this._makeSiteCheckbox(ctx, "##||", Utils.getString("fireie.erc.uaOnSite"),
        ctx.effHost, ctx.effHost, "", "$SPECIAL-UA=ESR")
      .concat(
      this._makeSiteCheckbox(ctx, "##||", Utils.getString("fireie.erc.uaESROnSite"),
        ctx.effHost, ctx.effHost, "$SPECIAL-UA=ESR", "", true));
    
    ctx.curItem.setAttribute("tooltiptext", Utils.esrUserAgent);
    ctx.curItem.nextSibling.setAttribute("tooltiptext", Utils.ieUserAgent);
    
    let uaRule = UserAgentMatcher.matchesAny(ctx.url);
    if (uaRule && !this._isExceptional(uaRule)
      && uaSiteRuleTexts.every(function(t) t != uaRule.text))
    {
      this._addCheckbox(ctx, [uaRule],
        Utils.getString(this._isESR(uaRule) ? "fireie.erc.uaESROnPage" : "fireie.erc.uaOnPage")
          .replace(/--/, this._saturate(this._pureRuleText(uaRule))),
        true).setAttribute("tooltiptext",
                           this._isESR(uaRule) ? Utils.esrUserAgent : Utils.ieUserAgent);
    }
    
    let tmpItem = ctx.curItem;
    uaSiteRuleTexts = this._makeSiteCheckbox(ctx, "@@##||",
      Utils.getString("fireie.erc.uaDefaultOnSite"), ctx.effHost, ctx.effHost);
    if (ctx.curItem !== tmpItem)
      ctx.curItem.setAttribute("tooltiptext", Utils.userAgent);
    
    if (uaRule && this._isExceptional(uaRule)
      && uaSiteRuleTexts.every(function(t) t != uaRule.text))
    {
      this._addCheckbox(ctx, [uaRule],
        Utils.getString("fireie.erc.uaDefaultOnPage")
          .replace(/--/, this._saturate(this._pureRuleText(uaRule))),
        true).setAttribute("tooltiptext", Utils.userAgent);
    }
  },

  _setSwitchRuleMenuItems: function(ctx)
  {
    // auto-switch does not affect ua rules, so we check it here
    if (!Prefs.autoswitch_enabled) return;
    
    this._makeSelfCheckbox(ctx, "", Utils.getString("fireie.erc.enableOnPage"), ctx.url);
    let siteRuleTexts = this._makeSiteCheckbox(ctx, "||",
      Utils.getString("fireie.erc.enableOnSite"), ctx.host, ctx.effHost);

    let rule = EngineMatcher.matchesAny(ctx.url);
    let inequalFunc = function(t) t != rule.text;
    if (rule && !this._isExceptional(rule)
      && siteRuleTexts.every(inequalFunc)
      && this._selfRuleTexts("", ctx.url).every(inequalFunc))
    {
      this._addCheckbox(ctx, [rule],
        Utils.getString("fireie.erc.enableOnUrl")
          .replace(/--/, this._saturate(this._pureRuleText(rule))),
        true);
    }
    
    this._makeSelfCheckbox(ctx, "@@", Utils.getString("fireie.erc.disableOnPage"), ctx.url);
    siteRuleTexts = this._makeSiteCheckbox(ctx, "@@||",
      Utils.getString("fireie.erc.disableOnSite"), ctx.host, ctx.effHost);

    if (rule && this._isExceptional(rule)
      && siteRuleTexts.every(inequalFunc)
      && this._selfRuleTexts("@@", ctx.url).every(inequalFunc))
    {
      this._addCheckbox(ctx, [rule],
        Utils.getString("fireie.erc.disableOnUrl")
          .replace(/--/, this._saturate(this._pureRuleText(rule))),
        true);
    }
    
    if (ctx.curItem !== ctx.lastItem) this._addSeparator(ctx);
  },
  
  _resetPopupMenuItems: function(ctx)
  {
    this._removeMenuItemsByClass(ctx.menu, this._enableOnClassName, "fireie-erc-ua-rules");
    if (ctx.type == "switch")
    {
      ctx.curItem = ctx.lastItem = ctx.menu.querySelector("#fireie-erc-ua-rules");
      this._addSeparator(ctx);
      ctx.lastItem = ctx.curItem;
      this._setSwitchRuleMenuItems(ctx);
    }
    else if (ctx.type == "UA")
    {
      ctx.curItem = ctx.lastItem = null;
      this._setUARuleMenuItems(ctx);
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
    
    let ctx = {
      type: "switch", CE: CE, url: url, host: host, effHost: effHost, menu: menu,
      curItem: menu.querySelector("#fireie-erc-start"),
      lastItem: menu.querySelector("#fireie-erc-start")
    };
    
    let uaMenu = CE("menu");
    uaMenu.className = this._enableOnClassName;
    uaMenu.setAttribute("id", "fireie-erc-ua-rules");
    uaMenu.setAttribute("label", Utils.getString("fireie.erc.uaRules"));
    menu.insertBefore(uaMenu, ctx.curItem);
    
    let uaMenuPopup = CE("menupopup");
    uaMenu.appendChild(uaMenuPopup);

    ctx.curItem = uaMenu;
    this._addSeparator(ctx);
    ctx.lastItem = ctx.curItem;
    
    let uaCtx = {
      type: "UA", CE: CE, url: url, host: host, effHost: effHost, menu: uaMenuPopup,
      curItem: null, lastItem: null
    };
    
    this._setSwitchRuleMenuItems(ctx);
    this._setUARuleMenuItems(uaCtx);
  },

  _makeSelfCheckbox: function(ctx, prefix, description, url)
  {
    let rules = this._selfRuleTexts(prefix, url).map(Rule.fromText);
    let active = rules.some(this._isActive);
    if (active || !this._isExceptional(rules[0]))
    {
      let label = description;
      this._addCheckbox(ctx, rules, label, active);
    }
  },

  _makeSiteCheckbox: function(ctx, prefix, description, host, effHost, suffix, opSuffix, nodisable)
  {
    // for host 'www.xxx.com', ignore 'www' unless rule '||www.xxx.com^' is active.
    if (!this._isActive(hostRule())) host = host.replace(/^www\./, '');
    
    let hostRuleTexts = [];
    
    while (true)
    {
      let rule = hostRule();
      let rules = [rule].concat(relatedHostRules());
      let opRules = typeof(opSuffix) == "string" ? 
        [hostOpRule()].concat(relatedHostOpRules()) : null;
      let active = rules.some(this._isActive);
      if (active || !this._isExceptional(rule))
      {
        let label = description.replace(/--/, host);
        this._addCheckbox(ctx, rules, label, active, nodisable, opRules);
        Array.prototype.splice.apply(hostRuleTexts,
          [hostRuleTexts.length, 0].concat(rules.map(function(r) r.text)));
      }
      if (host == effHost || host.length < effHost.length) break;

      // strip sub domain
      host = host.replace(/^[^\.]+\./, '');
      // com
      if (host.indexOf('.') <= 0) break;
      // com.cn
      if (/^(?:com|net|org|edu|gov)\.[a-z]{2}$/i.test(host) && !this._isActive(hostRule())) break;
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
  },

  _addCheckbox: function(ctx, rules, label, active, nodisable, opRules)
  {
    let checkbox = this._makeNewCheckbox(ctx, rules, label, active, opRules);
    if (ctx.curItem)
      ctx.menu.insertBefore(checkbox, ctx.curItem);
    else
      ctx.menu.appendChild(checkbox);
    ctx.curItem = checkbox;
    if (active && !nodisable)
    {
      let item = ctx.curItem.nextSibling;
      while (item != ctx.lastItem)
      {
        item.setAttribute("disabled", true);
        item.style.color = "";
        item = item.nextSibling;
      }
    }
    return checkbox;
  },
  
  _addSeparator: function(ctx)
  {
    let separator = ctx.CE("menuseparator");
    separator.className = this._enableOnClassName;
    ctx.menu.insertBefore(separator, ctx.curItem);
    ctx.curItem = separator;
    return separator;
  },

  _makeNewCheckbox: function(ctx, rules, label, active, opRules)
  {
    var checkbox = ctx.CE("menuitem");
    checkbox.className = this._enableOnClassName;
    checkbox.setAttribute("type", "checkbox");
    checkbox.setAttribute("label", label);
    checkbox.setAttribute("closemenu", "none");
    checkbox.setAttribute("tooltiptext", rules[0].text);
    let self = this;
    checkbox.addEventListener('command', function()
    {
      self._toggleRules(rules, opRules);
      self._resetPopupMenuItems(ctx);
    }, false);

    if (active)
    {
      checkbox.setAttribute("checked", true);
      checkbox.style.color = this._isExceptional(rules[0]) ? "red" : "green";
    }
    return checkbox;
  },

  _saturate: function(str)
  {
    return Utils.saturateString(str, 30);
  },
  
  _getParamsRegExp: /\?.*$/,
  
  _selfRuleTexts: function(prefix, url)
  {
    let mr = this._getParamsRegExp.exec(url);
    if (mr)
    {
      url = url.substring(0, mr.index);
      return [prefix + "|" + url + "?", prefix + "|" + url, prefix + url + "?", prefix + url, prefix + "|" + url + "^", prefix + url + "^"];
    }
    else
    {
      return [prefix + "|" + url + "|", prefix + "|" + url, prefix + url + "|", prefix + url, prefix + "|" + url + "^", prefix + url + "^"];
    }
  },

  /**
   * @return true  if rule exist & not disabled
   */
  _isActive: function(/**Rule*/ rule)
  {
    return !rule.disabled
      && rule.subscriptions.some(function(s) !s.disabled);
  },

  /**
   * @return true  if rule is an exceptional rule
   */
  _isExceptional: function(/**Rule*/ rule)
  {
    return rule.isExceptional;
  },
  
  /**
   * @return true  if rule is for switching to ESR UA
   */
  _isESR: function(/**Rule*/ rule)
  {
    return rule.specialUA && rule.specialUA.toUpperCase() == "ESR";
  },
  
  /**
   * @return rule text with options part striped off
   */
  _pureRuleText: function(/**Rule*/ rule)
  {
    let text = rule.text;
    if (text.substring(0, 2) == "@@")
      text = text.substring(2);
    if (text.substring(0, 2) == "##")
      text = text.substring(2);

    // Rule.optionsRegExp is in a different compartment,
    // using RegExp.leftContext will fail
    let mr = null;
    if (mr = Rule.optionsRegExp.exec(text))
    {
      return text.substring(0, mr.index);
    }
    return text;
  },
  
  /**
   * If the given rule is active, remove/disable it, Otherwise add/enable it.
   */
  _toggleRules: function(rules, opRules)
  {
    if (rules.some(this._isActive)) {
      rules.forEach(function(rule) {
        rule.disabled = true;
      });
    }
    else {
      if (opRules && opRules.some(this._isActive))
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
};
