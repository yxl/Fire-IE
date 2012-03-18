/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

/**
 * nsITreeView implementation to display rules of a particular rule
 * subscription.
 * @class
 */
var RuleView =
{
  /**
   * Initialization function.
   */
  init: function()
  {
    if (this.sortProcs)
      return;

    function compareText(/**Rule*/ rule1, /**Rule*/ rule2)
    {
      if (rule1.text < rule2.text)
        return -1;
      else if (rule1.text > rule2.text)
        return 1;
      else
        return 0;
    }
    function compareSlow(/**Rule*/ rule1, /**Rule*/ rule2)
    {
      let isSlow1 = rule1 instanceof RegExpRule && AllMatchers.isSlowRule(rule1);
      let isSlow2 = rule2 instanceof RegExpRule && AllMatchers.isSlowRule(rule2);
      return isSlow1 - isSlow2;
    }
    function compareEnabled(/**Rule*/ rule1, /**Rule*/ rule2)
    {
      let hasEnabled1 = (rule1 instanceof ActiveRule ? 1 : 0);
      let hasEnabled2 = (rule2 instanceof ActiveRule ? 1 : 0);
      if (hasEnabled1 != hasEnabled2)
        return hasEnabled1 - hasEnabled2;
      else if (hasEnabled1)
        return (rule2.disabled - rule1.disabled);
      else
        return 0;
    }
    function compareHitCount(/**Rule*/ rule1, /**Rule*/ rule2)
    {
      let hasHitCount1 = (rule1 instanceof ActiveRule ? 1 : 0);
      let hasHitCount2 = (rule2 instanceof ActiveRule ? 1 : 0);
      if (hasHitCount1 != hasHitCount2)
        return hasHitCount1 - hasHitCount2;
      else if (hasHitCount1)
        return rule1.hitCount - rule2.hitCount;
      else
        return 0;
    }
    function compareLastHit(/**Rule*/ rule1, /**Rule*/ rule2)
    {
      let hasLastHit1 = (rule1 instanceof ActiveRule ? 1 : 0);
      let hasLastHit2 = (rule2 instanceof ActiveRule ? 1 : 0);
      if (hasLastHit1 != hasLastHit2)
        return hasLastHit1 - hasLastHit2;
      else if (hasLastHit1)
        return rule1.lastHit - rule2.lastHit;
      else
        return 0;
    }

    /**
     * Creates a sort function from a primary and a secondary comparison function.
     * @param {Function} cmpFunc  comparison function to be called first
     * @param {Function} fallbackFunc  (optional) comparison function to be called if primary function returns 0
     * @param {Boolean} desc  if true, the result of the primary function (not the secondary function) will be reversed - sorting in descending order
     * @result {Function} comparison function to be used
     */
    function createSortFunction(cmpFunc, fallbackFunc, desc)
    {
      let factor = (desc ? -1 : 1);

      return function(entry1, entry2)
      {
        // Comment replacements not bound to a rule always go last
        let isLast1 = ("origRule" in entry1 && entry1.rule == null);
        let isLast2 = ("origRule" in entry2 && entry2.rule == null);
        if (isLast1)
          return (isLast2 ? 0 : 1)
        else if (isLast2)
          return -1;

        let ret = cmpFunc(entry1.rule, entry2.rule);
        if (ret == 0 && fallbackFunc)
          return fallbackFunc(entry1.rule, entry2.rule);
        else
          return factor * ret;
      }
    }

    this.sortProcs = {
      rule: createSortFunction(compareText, null, false),
      ruleDesc: createSortFunction(compareText, null, true),
      slow: createSortFunction(compareSlow, compareText, true),
      slowDesc: createSortFunction(compareSlow, compareText, false),
      enabled: createSortFunction(compareEnabled, compareText, false),
      enabledDesc: createSortFunction(compareEnabled, compareText, true),
      hitcount: createSortFunction(compareHitCount, compareText, false),
      hitcountDesc: createSortFunction(compareHitCount, compareText, true),
      lasthit: createSortFunction(compareLastHit, compareText, false),
      lasthitDesc: createSortFunction(compareLastHit, compareText, true)
    };

    let me = this;
    let proxy = function()
    {
      return me._onChange.apply(me, arguments);
    };
    RuleNotifier.addListener(proxy);
    window.addEventListener("unload", function()
    {
      RuleNotifier.removeListener(proxy);
    }, false);
  },

  /**
   * Rule change processing.
   * @see RuleNotifier.addListener()
   */
  _onChange: function(action, item, param1, param2, param3)
  {
    switch (action)
    {
      case "subscription.updated":
      {
        if (item == this._subscription)
          this.refresh(true);
        break;
      }
      case "rule.disabled":
      case "rule.hitCount":
      case "rule.lastHit":
      {
        this.updateRule(item);
        break;
      }
      case "rule.added":
      {
        let subscription = param1;
        let position = param2;
        if (subscription == this._subscription)
          this.addRuleAt(position, item);
        break;
      }
      case "rule.removed":
      {
        let subscription = param1;
        let position = param2;
        if (subscription == this._subscription)
          this.removeRuleAt(position);
        break;
      }
      case "rule.moved":
      {
        let subscription = param1;
        let oldPosition = param2;
        let newPosition = param3;
        if (subscription == this._subscription)
          this.moveRuleAt(oldPosition, newPosition);
        break;
      }
    }
  },

  /**
   * Box object of the tree that this view is attached to.
   * @type nsITreeBoxObject
   */
  boxObject: null,

  /**
   * Map of used cell properties to the corresponding nsIAtom representations.
   */
  atoms: null,

  /**
   * "Rule" to be displayed if no rule group is selected.
   */
  noGroupDummy: null,

  /**
   * "Rule" to be displayed if the selected group is empty.
   */
  noRulesDummy: null,

  /**
   * "Rule" to be displayed for a new rule being edited.
   */
  editDummy: null,

  /**
   * Displayed list of rules, might be sorted.
   * @type Rule[]
   */
  data: [],

  /**
   * <tree> element that the view is attached to.
   * @type XULElement
   */
  get treeElement() this.boxObject ? this.boxObject.treeBody.parentNode : null,

  /**
   * Checks whether the list is currently empty (regardless of dummy entries).
   * @type Boolean
   */
  get isEmpty()
  {
    return !this._subscription || !this._subscription.rules.length;
  },

  /**
   * Checks whether the rules in the view can be changed.
   * @type Boolean
   */
  get editable()
  {
    return (RuleView._subscription instanceof SpecialSubscription);
  },

  /**
   * Returns current item of the list.
   * @type Object
   */
  get currentItem()
  {
    let index = this.selection.currentIndex;
    if (index >= 0 && index < this.data.length)
      return this.data[index];
    return null;
  },

  /**
   * Returns items that are currently selected in the list.
   * @type Object[]
   */
  get selectedItems()
  {
    let items = []
    for (let i = 0; i < this.selection.getRangeCount(); i++)
    {
      let min = {};
      let max = {};
      this.selection.getRangeAt(i, min, max);
      for (let j = min.value; j <= max.value; j++)
        if (j >= 0 && j < this.data.length)
          items.push(this.data[j]);
    }
    return items;
  },

  getItemAt: function(x, y)
  {
    let row = this.boxObject.getRowAt(x, y);
    if (row >= 0 && row < this.data.length)
      return this.data[row];
    else
      return null;
  },

  _subscription: 0,

  /**
   * Rule subscription being displayed.
   * @type Subscription
   */
  get subscription() this._subscription,
  set subscription(value)
  {
    if (value == this._subscription)
      return;

    this._subscription = value;
    this.refresh(true);
  },

  /**
   * Will be true if updates are outstanding because the list was hidden.
   */
  _dirty: false,

  /**
   * Updates internal view data after a change.
   * @param {Boolean} force  if false, a refresh will only happen if previous
   *                         changes were suppressed because the list was hidden
   */
  refresh: function(force)
  {
    if (RuleActions.visible)
    {
      if (!force && !this._dirty)
        return;
      this._dirty = false;
      this.updateData();
      this.selectRow(0);
    }
    else
      this._dirty = true;
  },

  /**
   * Map of comparison functions by column ID  or column ID + "Desc" for
   * descending sort order.
   * @const
   */
  sortProcs: null,

  /**
   * Column that the list is currently sorted on.
   * @type Element
   */
  sortColumn: null,

  /**
   * Sorting function currently in use.
   * @type Function
   */
  sortProc: null,

  /**
   * Resorts the list.
   * @param {String} col ID of the column to sort on. If null, the natural order is restored.
   * @param {String} direction "ascending" or "descending", if null the sort order is toggled.
   */
  sortBy: function(col, direction)
  {
    let newSortColumn = null;
    if (col)
    {
      newSortColumn = this.boxObject.columns.getNamedColumn(col).element;
      if (!direction)
      {
        if (this.sortColumn == newSortColumn)
          direction = (newSortColumn.getAttribute("sortDirection") == "ascending" ? "descending" : "ascending");
        else
          direction = "ascending";
      }
    }

    if (this.sortColumn && this.sortColumn != newSortColumn)
      this.sortColumn.removeAttribute("sortDirection");

    this.sortColumn = newSortColumn;
    if (this.sortColumn)
    {
      this.sortColumn.setAttribute("sortDirection", direction);
      this.sortProc = this.sortProcs[col.replace(/^col-/, "") + (direction == "descending" ? "Desc" : "")];
    }
    else
      this.sortProc = null;

    if (this.data.length > 1)
    {
      this.updateData();
      this.boxObject.invalidate();
    }
  },

  /**
   * Inserts dummy entry into the list if necessary.
   */
  addDummyRow: function()
  {
    if (this.boxObject && this.data.length == 0)
    {
      if (this._subscription)
        this.data.splice(0, 0, this.noRulesDummy);
      else
        this.data.splice(0, 0, this.noGroupDummy);
      this.boxObject.rowCountChanged(0, 1);
    }
  },

  /**
   * Removes dummy entry from the list if present.
   */
  removeDummyRow: function()
  {
    if (this.boxObject && this.isEmpty && this.data.length)
    {
      this.data.splice(0, 1);
      this.boxObject.rowCountChanged(0, -1);
    }
  },

  /**
   * Inserts dummy row when a new rule is being edited.
   */
  insertEditDummy: function()
  {
    RuleView.removeDummyRow();
    let position = this.selection.currentIndex;
    if (position >= this.data.length)
      position = this.data.length - 1;
    if (position < 0)
      position = 0;

    this.editDummy.index = (position < this.data.length ? this.data[position].index : this.data.length);
    this.editDummy.position = position;
    this.data.splice(position, 0, this.editDummy);
    this.boxObject.rowCountChanged(position, 1);
    this.selectRow(position);
  },

  /**
   * Removes dummy row once the edit is finished.
   */
  removeEditDummy: function()
  {
    let position = this.editDummy.position;
    if (typeof position != "undefined" && position < this.data.length && this.data[position] == this.editDummy)
    {
      this.data.splice(position, 1);
      this.boxObject.rowCountChanged(position, -1);
      RuleView.addDummyRow();

      this.selectRow(position);
    }
  },

  /**
   * Selects a row in the tree and makes sure it is visible.
   */
  selectRow: function(row)
  {
    if (this.selection)
    {
      row = Math.min(Math.max(row, 0), this.data.length - 1);
      this.selection.select(row);
      this.boxObject.ensureRowIsVisible(row);
    }
  },

  /**
   * Finds a particular rule in the list and selects it.
   */
  selectRule: function(/**Rule*/ rule)
  {
    let index = -1;
    for (let i = 0; i < this.data.length; i++)
    {
      if (this.data[i].rule == rule)
      {
        index = i;
        break;
      }
    }
    if (index >= 0)
    {
      this.selectRow(index);
      this.treeElement.focus();
    }
  },

  /**
   * Updates value of data property on sorting or rule subscription changes.
   */
  updateData: function()
  {
    let oldCount = this.rowCount;
    if (this._subscription && this._subscription.rules.length)
    {
      this.data = this._subscription.rules.map(function(f, i) ({index: i, rule: f}));
      if (this.sortProc)
      {
        // Hide comments in the list, they should be sorted like the rule following them
        let followingRule = null;
        for (let i = this.data.length - 1; i >= 0; i--)
        {
          if (this.data[i].rule instanceof CommentRule)
          {
            this.data[i].origRule = this.data[i].rule;
            this.data[i].rule = followingRule;
          }
          else
            followingRule = this.data[i].rule;
        }

        this.data.sort(this.sortProc);

        // Restore comments
        for (let i = 0; i < this.data.length; i++)
        {
          if ("origRule" in this.data[i])
          {
            this.data[i].rule = this.data[i].origRule;
            delete this.data[i].origRule;
          }
        }
      }
    }
    else
      this.data = [];

    if (this.boxObject)
    {
      this.boxObject.rowCountChanged(0, -oldCount);
      this.boxObject.rowCountChanged(0, this.rowCount);
    }

    this.addDummyRow();
  },

  /**
   * Called to update the view when a rule property is changed.
   */
  updateRule: function(/**Rule*/ rule)
  {
    for (let i = 0; i < this.data.length; i++)
      if (this.data[i].rule == rule)
        this.boxObject.invalidateRow(i);
  },

  /**
   * Called if a rule has been inserted at the specified position.
   */
  addRuleAt: function(/**Integer*/ position, /**Rule*/ rule)
  {
    if (this.data.length == 1 && this.data[0].rule.dummy)
    {
      this.data.splice(0, 1);
      this.boxObject.rowCountChanged(0, -1);
    }

    if (this.sortProc)
    {
      this.updateData();
      for (let i = 0; i < this.data.length; i++)
      {
        if (this.data[i].index == position)
        {
          position = i;
          break;
        }
      }
    }
    else
    {
      for (let i = 0; i < this.data.length; i++)
        if (this.data[i].index >= position)
          this.data[i].index++;
      this.data.splice(position, 0, {index: position, rule: rule});
    }
    this.boxObject.rowCountChanged(position, 1);
    this.selectRow(position);
  },

  /**
   * Called if a rule has been removed at the specified position.
   */
  removeRuleAt: function(/**Integer*/ position)
  {
    for (let i = 0; i < this.data.length; i++)
    {
      if (this.data[i].index == position)
      {
        this.data.splice(i, 1);
        this.boxObject.rowCountChanged(i, -1);
        i--;
      }
      else if (this.data[i].index > position)
        this.data[i].index--;
    }
    this.addDummyRow();
  },

  /**
   * Called if a rule has been moved within the list.
   */
  moveRuleAt: function(/**Integer*/ oldPosition, /**Integer*/ newPosition)
  {
    let dir = (oldPosition < newPosition ? 1 : -1);
    for (let i = 0; i < this.data.length; i++)
    {
      if (this.data[i].index == oldPosition)
        this.data[i].index = newPosition;
      else if (dir * this.data[i].index > dir * oldPosition && dir * this.data[i].index <= dir * newPosition)
        this.data[i].index -= dir;
    }

    if (!this.sortProc)
    {
      let item = this.data[oldPosition];
      this.data.splice(oldPosition, 1);
      this.data.splice(newPosition, 0, item);
      this.boxObject.invalidateRange(Math.min(oldPosition, newPosition), Math.max(oldPosition, newPosition));
    }
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsITreeView]),

  setTree: function(boxObject)
  {
    this.init();
    this.boxObject = boxObject;

    if (this.boxObject)
    {
      this.noGroupDummy = {index: 0, rule: {text: this.boxObject.treeBody.getAttribute("noGroupText"), dummy: true}};
      this.noRulesDummy = {index: 0, rule: {text: this.boxObject.treeBody.getAttribute("noRulesText"), dummy: true}};
      this.editDummy = {rule: {text: ""}};

      let atomService = Cc["@mozilla.org/atom-service;1"].getService(Ci.nsIAtomService);
      let stringAtoms = ["col-rule", "col-enabled", "col-hitcount", "col-lasthit", "type-comment", "type-rulelist", "type-whitelist", "type-elemhide", "type-invalid"];
      let boolAtoms = ["selected", "dummy", "slow", "disabled"];

      this.atoms = {};
      for each (let atom in stringAtoms)
        this.atoms[atom] = atomService.getAtom(atom);
      for each (let atom in boolAtoms)
      {
        this.atoms[atom + "-true"] = atomService.getAtom(atom + "-true");
        this.atoms[atom + "-false"] = atomService.getAtom(atom + "-false");
      }

      let columns = this.boxObject.columns;
      for (let i = 0; i < columns.length; i++)
        if (columns[i].element.hasAttribute("sortDirection"))
          this.sortBy(columns[i].id, columns[i].element.getAttribute("sortDirection"));

      this.refresh(true);
    }
  },

  selection: null,

  get rowCount() this.data.length,

  getCellText: function(row, col)
  {
    if (row < 0 || row >= this.data.length)
      return null;

    col = col.id;
    if (col != "col-rule" && col != "col-slow" && col != "col-hitcount" && col != "col-lasthit")
      return null;

    let rule = this.data[row].rule;
    if (col == "col-rule")
      return rule.text;
    else if (col == "col-slow")
      return (rule instanceof RegExpRule && AllMatchers.isSlowRule(rule) ? "!" : null);
    else if (rule instanceof ActiveRule)
    {
      if (col == "col-hitcount")
        return rule.hitCount;
      else if (col == "col-lasthit")
        return (rule.lastHit ? Utils.formatTime(rule.lastHit) : null);
      else
        return null;
    }
    else
      return null;
  },

  getColumnProperties: function(col, properties)
  {
    col = col.id;

    if (col in this.atoms)
      properties.AppendElement(this.atoms[col]);
  },

  getRowProperties: function(row, properties)
  {
    if (row < 0 || row >= this.data.length)
      return;

    let rule = this.data[row].rule;
    properties.AppendElement(this.atoms["selected-" + this.selection.isSelected(row)]);
    properties.AppendElement(this.atoms["slow-" + (rule instanceof RegExpRule && AllMatchers.isSlowRule(rule))]);
    if (rule instanceof ActiveRule)
      properties.AppendElement(this.atoms["disabled-" + rule.disabled]);
    properties.AppendElement(this.atoms["dummy-" + ("dummy" in rule)]);

    if (rule instanceof CommentRule)
      properties.AppendElement(this.atoms["type-comment"]);
    else if (rule instanceof EngineRule)
      properties.AppendElement(this.atoms["type-rulelist"]);
    else if (rule instanceof EngineExceptionalRule)
      properties.AppendElement(this.atoms["type-whitelist"]);
    else if (rule instanceof UserAgentRule)
      properties.AppendElement(this.atoms["type-useragent"]);
    else if (rule instanceof UserAgentExceptionalRule)
      properties.AppendElement(this.atoms["type-useragentexceptional"]);
    else if (rule instanceof InvalidRule)
      properties.AppendElement(this.atoms["type-invalid"]);
  },

  getCellProperties: function(row, col, properties)
  {
    this.getColumnProperties(col, properties);
    this.getRowProperties(row, properties);
  },

  cycleHeader: function(col)
  {
    let oldDirection = col.element.getAttribute("sortDirection");
    if (oldDirection == "ascending")
      this.sortBy(col.id, "descending");
    else if (oldDirection == "descending")
      this.sortBy(null, null);
    else
      this.sortBy(col.id, "ascending");
  },

  isSorted: function()
  {
    return (this.sortProc != null);
  },

  canDrop: function(row, orientation, dataTransfer)
  {
    if (orientation == Ci.nsITreeView.DROP_ON || row < 0 || row >= this.data.length || !this.editable)
      return false;

    let item = this.data[row];
    let position = (orientation == Ci.nsITreeView.DROP_BEFORE ? item.index : item.index + 1);
    return RuleActions.canDrop(position, dataTransfer);
  },

  drop: function(row, orientation, dataTransfer)
  {
    if (orientation == Ci.nsITreeView.DROP_ON || row < 0 || row >= this.data.length || !this.editable)
      return;

    let item = this.data[row];
    let position = (orientation == Ci.nsITreeView.DROP_BEFORE ? item.index : item.index + 1);
    RuleActions.drop(position, dataTransfer);
  },

  isEditable: function(row, col)
  {
    if (row < 0 || row >= this.data.length || !this.editable)
      return false;

    let rule = this.data[row].rule;
    if (col.id == "col-rule")
      return !("dummy" in rule);
    else
      return false;
  },

  setCellText: function(row, col, value)
  {
    if (row < 0 || row >= this.data.length || col.id != "col-rule")
      return;

    let oldRule = this.data[row].rule;
    let position = this.data[row].index;
    value = Rule.normalize(value);
    if (!value || value == oldRule.text)
      return;

    // Make sure we don't get called recursively (see https://adblockplus.org/forum/viewtopic.php?t=9003)
    this.treeElement.stopEditing();

    let newRule = Rule.fromText(value);
    if (this.data[row] == this.editDummy)
      this.removeEditDummy();
    else
      RuleStorage.removeRule(oldRule, this._subscription, position);
    RuleStorage.addRule(newRule, this._subscription, position);
  },

  cycleCell: function(row, col)
  {
    if (row < 0 || row >= this.data.length || col.id != "col-enabled")
      return null;

    let rule = this.data[row].rule;
    if (rule instanceof ActiveRule)
      rule.disabled = !rule.disabled;
  },

  isContainer: function(row) false,
  isContainerOpen: function(row) false,
  isContainerEmpty: function(row) true,
  getLevel: function(row) 0,
  getParentIndex: function(row) -1,
  hasNextSibling: function(row, afterRow) false,
  toggleOpenState: function(row) {},
  getProgressMode: function() null,
  getImageSrc: function() null,
  isSeparator: function() false,
  performAction: function() {},
  performActionOnRow: function() {},
  performActionOnCell: function() {},
  getCellValue: function() null,
  setCellValue: function() {},
  selectionChanged: function() {},
};
