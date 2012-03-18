/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

/**
 * Implementation of the rule search functionality.
 * @class
 */
var RuleSearch =
{
  /**
   * Initializes findbar widget.
   */
  init: function()
  {
    let findbar = E("findbar");
    findbar.browser = RuleSearch.fakeBrowser;

    findbar.addEventListener("keypress", function(event)
    {
      // Work-around for bug 490047
      if (event.keyCode == KeyEvent.DOM_VK_RETURN)
        event.preventDefault();
    }, false);

    // Hack to prevent "highlight all" from getting enabled
    findbar.toggleHighlight = function() {};
  },

  /**
   * Performs a text search.
   * @param {String} text  text to be searched
   * @param {Integer} direction  search direction: -1 (backwards), 0 (forwards
   *                  starting with current), 1 (forwards starting with next)
   * @param {Boolean} caseSensitive  if true, a case-sensitive search is performed
   * @result {Integer} one of the nsITypeAheadFind constants
   */
  search: function(text, direction, caseSensitive)
  {
    function normalizeString(string) caseSensitive ? string : string.toLowerCase();

    function findText(text, direction, startIndex)
    {
      let list = E("rulesTree");
      let col = list.columns.getNamedColumn("col-rule");
      let count = list.view.rowCount;
      for (let i = startIndex + direction; i >= 0 && i < count; i += (direction || 1))
      {
        let rule = normalizeString(list.view.getCellText(i, col));
        if (rule.indexOf(text) >= 0)
        {
          RuleView.selectRow(i);
          return true;
        }
      }
      return false;
    }

    text = normalizeString(text);

    // First try to find the entry in the current list
    if (findText(text, direction, E("rulesTree").currentIndex))
      return Ci.nsITypeAheadFind.FIND_FOUND;

    // Now go through the other subscriptions
    let result = Ci.nsITypeAheadFind.FIND_FOUND;
    let subscriptions = RuleStorage.subscriptions.slice();
    subscriptions.sort(function(s1, s2) (s1 instanceof SpecialSubscription) - (s2 instanceof SpecialSubscription));
    let current = subscriptions.indexOf(RuleView.subscription);
    direction = direction || 1;
    for (let i = current + direction; ; i+= direction)
    {
      if (i < 0)
      {
        i = subscriptions.length - 1;
        result = Ci.nsITypeAheadFind.FIND_WRAPPED;
      }
      else if (i >= subscriptions.length)
      {
        i = 0;
        result = Ci.nsITypeAheadFind.FIND_WRAPPED;
      }
      if (i == current)
        break;

      let subscription = subscriptions[i];
      for (let j = 0; j < subscription.rules.length; j++)
      {
        let rule = normalizeString(subscription.rules[j].text);
        if (rule.indexOf(text) >= 0)
        {
          let list = E(subscription instanceof SpecialSubscription ? "groups" : "subscriptions");
          let node = Templater.getNodeForData(list, "subscription", subscription);
          if (!node)
            break;

          // Select subscription in its list and restore focus after that
          let oldFocus = document.commandDispatcher.focusedElement;
          E("tabs").selectedIndex = (subscription instanceof SpecialSubscription ? 1 : 0);
          list.ensureElementIsVisible(node);
          list.selectItem(node);
          if (oldFocus)
          {
            oldFocus.focus();
            Utils.runAsync(oldFocus.focus, oldFocus);
          }

          Utils.runAsync(findText, null, text, direction, direction == 1 ? -1 : subscription.rules.length);
          return result;
        }
      }
    }

    return Ci.nsITypeAheadFind.FIND_NOTFOUND;
  }
};

/**
 * Fake browser implementation to make findbar widget happy - searches in
 * the rule list.
 */
RuleSearch.fakeBrowser =
{
  fastFind:
  {
    searchString: null,
    foundLink: null,
    foundEditable: null,
    caseSensitive: false,
    get currentWindow() RuleSearch.fakeBrowser.contentWindow,

    find: function(searchString, linksOnly)
    {
      this.searchString = searchString;
      return RuleSearch.search(this.searchString, 0, this.caseSensitive);
    },

    findAgain: function(findBackwards, linksOnly)
    {
      return RuleSearch.search(this.searchString, findBackwards ? -1 : 1, this.caseSensitive);
    },

    // Irrelevant for us
    init: function() {},
    setDocShell: function() {},
    setSelectionModeAndRepaint: function() {},
    collapseSelection: function() {}
  },
  currentURI: Utils.makeURI("http://example.com/"),
  contentWindow:
  {
    focus: function()
    {
      E("rulesTree").focus();
    },
    scrollByLines: function(num)
    {
      E("rulesTree").boxObject.scrollByLines(num);
    },
    scrollByPages: function(num)
    {
      E("rulesTree").boxObject.scrollByPages(num);
    },
  },

  addEventListener: function(event, handler, capture)
  {
    E("rulesTree").addEventListener(event, handler, capture);
  },
  removeEventListener: function(event, handler, capture)
  {
    E("rulesTree").addEventListener(event, handler, capture);
  },
};

window.addEventListener("load", function()
{
  RuleSearch.init();
}, false);
