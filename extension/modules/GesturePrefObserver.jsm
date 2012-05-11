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

/**
 * @fileOverview Gesture preference observer, notifies underlying plugin about gesture pref changes
 */

let EXPORTED_SYMBOLS = ["GesturePrefObserver"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

Cu.import(baseURL.spec + "AppIntegration.jsm");
Cu.import(baseURL.spec + "Utils.jsm");
Cu.import(baseURL.spec + "Prefs.jsm");

let GesturePrefObserver = {
  
  /**
   * Main gesture extension, used for setting plugin gesture handler states
   */
  mainGestureExtension: null,

  /**
   * Prefs branch associated with mainGestureExtension
   */
  gestureBranch: null,

  /**
   * Observer of gestureBranch
   */
  gestureBranchObserver: null,

  /**
   * Set of individual prefs to observe
   */
  prefObserveSet: {},

  /**
   * Retrieve the (any) utils plugin object
   */
  _getUtilsPlugin: function()
  {
    // since we don't have any window handles, we'll ask for one
    return AppIntegration.getAnyUtilsPlugin();
  },

  /**
   * build prefObserveSet from an array
   */
  _buildPrefObserveSet: function(list)
  {
    for (let i = 0; i < list.length; i++)
    {
      this.prefObserveSet[list[i]] = true;
    }
  },
  
  /**
   * Register relavant observers for gesture pref change
   */
  _registerGestureExtensionObserver: function(extensionName)
  {
    switch (extensionName)
    {
    case "FireGestures":
      this.gestureBranch = Services.prefs.getBranch("extensions.firegestures.");
      this._buildPrefObserveSet(["mousegesture", "trigger_button", "rockergesture", "wheelgesture"]);
      break;
    case "MouseGesturesRedox":
      this.gestureBranch = Services.prefs.getBranch("mozgest.");
      this._buildPrefObserveSet(["enableStrokes", "mousebutton", "lefthanded", "enableRockers", "enableWheelRockers"]);
      break;
    case "All-in-One Gestures":
      this.gestureBranch = Services.prefs.getBranch("allinonegest.");    
      this._buildPrefObserveSet(["mouse", "mousebuttonpref", "rocking", "wheelscrolling"]);
      break;
    case "NotDetected":
      // we listen for the pref "forceMGSupport" when no pre-defined gesture extension detected
      this.gestureBranch = Services.prefs.getBranch("extensions.fireie.");
      this._buildPrefObserveSet(["forceMGSupport"]);
      break;
    default:
      break;
    }
    if (this.gestureBranch == null) return;
    try
    {
      let self = this;
      this.gestureBranch.QueryInterface(Ci.nsIPrefBranch2);
      this.gestureBranchObserver =
      {
        /**
         * nsIObserver implementation
         */
        observe: function(subject, topic, data)
        {
          if (topic == "nsPref:changed" && self.prefObserveSet[data])
            self.setEnabledGestures();
        },
        
        QueryInterface: XPCOMUtils.generateQI([Ci.nsISupportsWeakReference, Ci.nsIObserver])
      };
      this.gestureBranch.addObserver("", this.gestureBranchObserver, true);
    }
    catch (ex)
    {
      Utils.ERROR("_registerGestureExtensionObserver(): " + ex);
    }
  },
  /**
   * Set the gesture extension name and relavant observers
   */
  setGestureExtension: function(extensionName)
  {
    // only set one plugin~~ as most gesture plugins will conflict with each other
    if (this.mainGestureExtension)
      return;
    this.mainGestureExtension = extensionName;
    this._registerGestureExtensionObserver(extensionName);
  },
  /**
   * Whether we already have a valid gesture extension
   */
  hasGestureExtension: function()
  {
    if (this.mainGestureExtension)
      return this.mainGestureExtension != "NotDetected";
    return false;
  },
  /**
   * Called when gesture extension/script detection is nearly complete
   */
  onGestureDetectionEnd: function()
  {
    if (this.mainGestureExtension)
      return;
    // if still no extension detected, do the default behavior
    this.setGestureExtension("NotDetected");
  },
  /**
   * Notify underlying plugin to set gesture handler states
   */
  setEnabledGestures: function()
  {
    try {
      let plugin = this._getUtilsPlugin();
      if (plugin == null) return false;

      let gestures = [];
      let branch = this.gestureBranch;
      switch (this.mainGestureExtension)
      {
      case "FireGestures":
      {
        if (branch)
        {
          if (branch.getBoolPref("mousegesture") && branch.getIntPref("trigger_button") == 2)
            gestures.push("trace");
          if (branch.getBoolPref("rockergesture"))
            gestures.push("rocker");
          if (branch.getBoolPref("wheelgesture"))
            gestures.push("wheel");
        }
        break;
      }
      case "MouseGesturesRedox":
        if (branch)
        {
          if (branch.getBoolPref("enableStrokes") && 
            ((branch.getBoolPref("lefthanded") && branch.getIntPref("mousebutton") == 0)) ||
            ((!branch.getBoolPref("lefthanded") && branch.getIntPref("mousebutton") == 2)))
            gestures.push("trace");
          if (branch.getBoolPref("enableRockers"))
            gestures.push("rocker");
          if (branch.getBoolPref("enableWheelRockers") && 
            ((branch.getBoolPref("lefthanded") && branch.getIntPref("mousebutton") == 0)) ||
            ((!branch.getBoolPref("lefthanded") && branch.getIntPref("mousebutton") == 2)))
            gestures.push("wheel");
        }
        break;
      case "All-in-One Gestures":
        if (branch)
        {
          if (branch.getBoolPref("mouse") && branch.getIntPref("mousebuttonpref") == 2)
            gestures.push("trace");
          if (branch.getBoolPref("rocking") && branch.getIntPref("mousebuttonpref") == 2)
            gestures.push("rocker");
          if (branch.getBoolPref("wheelscrolling"))
            gestures.push("wheel");
        }
        break;
      case "GeneralAll":
        gestures = ["trace", "rocker", "wheel"];
        break;
      default:
        // Prefs.forceMGSupport not ready yet, have to use getBoolPref
        if (branch.getBoolPref("forceMGSupport"))
          gestures = ["trace", "rocker", "wheel"];
        break;
      }

      plugin.SetEnabledGestures(gestures);
      Utils.LOG("Gesture state: [" + this.mainGestureExtension + "][" + gestures.toString() + "]");
      return true;
    }
    catch (ex)
    {
      Utils.ERROR("setEnabledGestures(): " + ex);
      return false;
    }
  }
};

