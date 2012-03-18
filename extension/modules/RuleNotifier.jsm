/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

/**
 * @fileOverview RuleNotifier class manages listeners and distributes messages
 * about rule changes to them.
 */

var EXPORTED_SYMBOLS = ["RuleNotifier"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

/**
 * List of registered listeners
 * @type Array of function(action, item, newValue, oldValue)
 */
let listeners = [];

/**
 * This class allows registering and triggering listeners for rule events.
 * @class
 */
var RuleNotifier = {
  /**
   * Adds a listener
   */
  addListener: function( /**function(action, item, newValue, oldValue)*/ listener)
  {
    if (listeners.indexOf(listener) >= 0) return;

    listeners.push(listener);
  },

  /**
   * Removes a listener that was previosly added via addListener
   */
  removeListener: function( /**function(action, item, newValue, oldValue)*/ listener)
  {
    let index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  },

  /**
   * Notifies listeners about an event
   * @param {String} action event code ("load", "save", "elemhideupdate",
   *                 "subscription.added", "subscription.removed",
   *                 "subscription.disabled", "subscription.title",
   *                 "subscription.lastDownload", "subscription.downloadStatus",
   *                 "subscription.homepage", "subscription.updated",
   *                 "rule.added", "rule.removed", "rule.moved",
   *                 "rule.disabled", "rule.hitCount", "rule.lastHit")
   * @param {Subscription|Rule} item item that the change applies to
   */
  triggerListeners: function(action, item, param1, param2, param3)
  {
    for each(let listener in listeners)
    listener(action, item, param1, param2, param3);
  }
};