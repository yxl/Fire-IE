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
 * @namespace
 */

Cu.import(baseURL.spec + "AppIntegration.jsm");
Cu.import(baseURL.spec + "GesturePrefObserver.jsm");

if (typeof(Options) == "undefined")
{
  var Options = {};
}

Options.export = function()
{
  let aOld = Options._getAllOptions(false);
  Options.apply(true);
  let aCurrent = Options._getAllOptions(false);
  if (aCurrent) Options._saveToFile(aCurrent);
  Options._setAllOptions(aOld);
}

Options.import = function()
{
  let aOld = Options._getAllOptions(false);
  let[result, aList] = Options._loadFromFile();
  if (result)
  {
    if (aList)
    {
      Options._setAllOptions(aList);
      Options.initDialog();
      Options._setAllOptions(aOld);
      Options.updateApplyButton(true);
    }
    else
    {
      alert(Utils.getString("fireie.options.import.error"));
    }
  }
}

Options.restoreDefaultSettings = function()
{
  let aOld = Options._getAllOptions(false);
  let aDefault = Options._getAllOptions(true);
  Options._setAllOptions(aDefault);
  Options.initDialog();
  Options._setAllOptions(aOld);
  Options.updateApplyButton(true);
}

// Apply options
Options.apply = function(quiet)
{
  let requiresRestart = false;

  //general
  Prefs.handleUrlBar = E("handleurl").checked;
  Prefs.autoswitch_enabled = !E("disableAutoSwitch").checked;
  let newKey = E("shortcut-key").value;
  if (Prefs.shortcutEnabled && Prefs.shortcut_key != newKey)
  {
    requiresRestart = true;
  }
  Prefs.shortcut_key = newKey;
  let newModifiers = E("shortcut-modifiers").value;
  if (Prefs.shortcutEnabled && Prefs.shortcut_modifiers != newModifiers)
  {
    requiresRestart = true;
  }
  Prefs.shortcut_modifiers = newModifiers;
  let newEnabled = E("shortcutEnabled").checked;
  if (Prefs.shortcutEnabled != newEnabled)
  {
    requiresRestart = true;
    Prefs.shortcutEnabled = E("shortcutEnabled").checked;
  }
  Prefs.privatebrowsingwarning = E("privatebrowsingwarning").checked;
  Prefs.showUrlBarLabel = (E("iconDisplay").value == "iconAndText");
  Prefs.hideUrlBarButton = (E("iconDisplay").value == "iconHidden");
  Prefs.showTooltipText = E("showTooltipText").checked;
  Prefs.showStatusText = E("showStatusText").checked;
  Prefs.forceMGSupport = E("forceMGSupport").checked;
  
  // IE compatibility mode
  let newMode = "ie7mode";
  let iemode = E("iemode");
  if (iemode)
  {
    newMode = iemode.value;
  }
  if (Prefs.compatMode != newMode)
  {
    requiresRestart = true;
    Prefs.compatMode = newMode;
    Options.applyIECompatMode();
  }

  //update UI
  Options.updateApplyButton(false);

  //notify of restart requirement
  if (requiresRestart && !quiet)
  {
    alert(Utils.getString("fireie.options.alert.restart"));
  }
}

Options.applyIECompatMode = function()
{
  let mode = Services.prefs.getCharPref("extensions.fireie.compatMode");
  let value = 7000;
  switch (mode)
  {
  case 'ie7mode':
    value = 7000;
    break;
  case 'ie8mode':
    value = 8000;
    break;
  case 'ie9mode':
    value = 9000;
    break;
  default:
    value = 7000;
    break;
  }
  
  let wrk = Components.classes["@mozilla.org/windows-registry-key;1"].createInstance(Components.interfaces.nsIWindowsRegKey);
  try
  {
	wrk.create(wrk.ROOT_KEY_CURRENT_USER, "SOFTWARE\\Microsoft\\Internet Explorer\\Main\\FeatureControl\\FEATURE_BROWSER_EMULATION", wrk.ACCESS_ALL);
	wrk.writeIntValue("firefox.exe", value);
	wrk.close();
  }
  catch (e)
  {
	Utils.ERROR(e);
  }
}

// Get IE's main version number
Options.getIEMainVersion = function()
{
  let wrk = Components.classes["@mozilla.org/windows-registry-key;1"].createInstance(Components.interfaces.nsIWindowsRegKey);
  let versionString = "0";
  try
  {
	wrk.create(wrk.ROOT_KEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Internet Explorer", wrk.ACCESS_READ);
    versionString = wrk.readStringValue("version");
    wrk.close();
  }
  catch (e)
  {
    Utils.ERROR(e);
  }  
  return parseInt(versionString);
}

Options.updateIEModeTab = function()
{
  let mainIEVersion = Options.getIEMainVersion();
  // Do not show this tab if IE8 or higher is not detected,
  // since IE7 or lower does not support compatible modes
  if (mainIEVersion < 8)
  {
    return;
  }
  switch (mainIEVersion)
  {
  case 9:
    document.getElementById("ie9mode-radio").hidden = false;
  case 8:
    document.getElementById("ie8mode-radio").hidden = false;
    document.getElementById("ie7mode-radio").hidden = false;
    break;
  }
  document.getElementById("iemode-tab").hidden = false;
  let mode = Prefs.compatMode;
  document.getElementById("iemode").value = mode;
}

Options.initDialog = function()
{
  // options for general features
  E("handleurl").checked = Prefs.handleUrlBar;
  E("disableAutoSwitch").checked = !Prefs.autoswitch_enabled;
  E("shortcut-modifiers").value = Prefs.shortcut_modifiers;
  E("shortcut-key").value = Prefs.shortcut_key;
  E("shortcutEnabled").checked = Prefs.shortcutEnabled;
  E("privatebrowsingwarning").checked = Prefs.privatebrowsingwarning;
  E("iconDisplay").value = Prefs.hideUrlBarButton ? "iconHidden" : (Prefs.showUrlBarLabel ? "iconAndText" : "iconOnly");
  E("showTooltipText").checked = Prefs.showTooltipText;
  E("showStatusText").checked = Prefs.showStatusText;
  E("forceMGSupport").checked = Prefs.forceMGSupport;

  // hide "showStatusText" if we don't handle status messages ourselves
  let ifHide = !AppIntegration.shouldShowStatusOurselves();
  E("statusBarGroup").hidden = ifHide;

  // disable MGS checkbox if we already detected some gesture extension
  //E("integration-tab").hidden = GesturePrefObserver.hasGestureExtension();
  if (GesturePrefObserver.hasGestureExtension())
  {
    E("forceMGSupport").disabled = true;
  }
  else
  {
    E("alreadyEnabledMGSupportLabel").hidden = true;
  }

  // updateStatus
  Options.updateApplyButton(false);
  Options.handleShortcutEnabled();

  // IE Compatibility Mode
  Options.updateIEModeTab();
}

Options.setIconDisplayValue = function(value)
{
  E("iconDisplay").value = value;
  this.updateApplyButton(true);
}

Options.updateApplyButton = function(e)
{
  document.getElementById("myApply").disabled = !e;
}

Options.handleShortcutEnabled = function(e)
{
  let disable = !E("shortcutEnabled").checked;
  E("shortcut-modifiers").disabled = disable;
  E("shortcut-plus").disabled = disable;
  E("shortcut-key").disabled = disable;
}

Options.init = function()
{
  function addEventListenerByTagName(tag, type, listener)
  {
    let objs = document.getElementsByTagName(tag);
    for (let i = 0; i < objs.length; i++)
    {
      objs[i].addEventListener(type, listener, false);
    }
  }
  Options.initDialog();
  addEventListenerByTagName("checkbox", "command", Options.updateApplyButton);
  addEventListenerByTagName("radio", "command", Options.updateApplyButton);
  addEventListenerByTagName("menulist", "command", Options.updateApplyButton);
  E("shortcutEnabled").addEventListener('command', Options.handleShortcutEnabled);
}

Options.close = function()
{
  let isModified = !document.getElementById("myApply").disabled;
  if (isModified)
  {
    if (confirm(Utils.getString("fireie.options.alert.modified")))
    {
      Options.apply(true);
    }
  }
}

Options._saveToFile = function(aList)
{
  let fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(Components.interfaces.nsIFilePicker);
  let stream = Components.classes["@mozilla.org/network/file-output-stream;1"].createInstance(Components.interfaces.nsIFileOutputStream);
  let converter = Components.classes["@mozilla.org/intl/converter-output-stream;1"].createInstance(Components.interfaces.nsIConverterOutputStream);

  fp.init(window, null, fp.modeSave);
  fp.defaultExtension = "txt";
  fp.defaultString = "FireIEPref";
  fp.appendFilters(fp.ruleText);

  if (fp.show() != fp.returnCancel)
  {
    try
    {
      if (fp.file.exists()) fp.file.remove(true);
      fp.file.create(fp.file.NORMAL_FILE_TYPE, 0666);
      stream.init(fp.file, 0x02, 0x200, null);
      converter.init(stream, "UTF-8", 0, 0x0000);

      for (var i = 0; i < aList.length; i++)
      {
        aList[i] = aList[i] + "\n";
        converter.writeString(aList[i]);
      }
    }
    finally
    {
      converter.close();
      stream.close();
    }
  }
}

Options._loadFromFile = function()
{
  let fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(Components.interfaces.nsIFilePicker);
  let stream = Components.classes["@mozilla.org/network/file-input-stream;1"].createInstance(Components.interfaces.nsIFileInputStream);
  let converter = Components.classes["@mozilla.org/intl/converter-input-stream;1"].createInstance(Components.interfaces.nsIConverterInputStream);

  fp.init(window, null, fp.modeOpen);
  fp.defaultExtension = "txt";
  fp.appendFilters(fp.ruleText);

  if (fp.show() != fp.returnCancel)
  {
    try
    {
      let input = {};
      stream.init(fp.file, 0x01, 0444, null);
      converter.init(stream, "UTF-8", 0, 0x0000);
      converter.readString(stream.available(), input);
      let linebreak = input.value.match(/(((\n+)|(\r+))+)/m)[1];
      return [true, input.value.split(linebreak)];
    }
    finally
    {
      converter.close();
      stream.close();
    }
  }
  return [false, null];
}

Options._getAllOptions = function(isDefault)
{
  let prefix = "extensions.fireie.";
  let prefs = (isDefault ? Services.prefs.getDefaultBranch("") : Services.prefs.getBranch(""));
  let preflist = prefs.getChildList(prefix, {});

  let aList = ["FireIEPref"];
  for (var i = 0; i < preflist.length; i++)
  {
    try
    {
      let value = null;
      switch (prefs.getPrefType(preflist[i]))
      {
      case prefs.PREF_BOOL:
        value = prefs.getBoolPref(preflist[i]);
        break;
      case prefs.PREF_INT:
        value = prefs.getIntPref(preflist[i]);
        break;
      case prefs.PREF_STRING:
        value = prefs.getComplexValue(preflist[i], Components.interfaces.nsISupportsString).data;
        break;
      }
      aList.push(preflist[i] + "=" + value);
    }
    catch (e)
    {
      Utils.ERROR(e);
    }
  }
  return aList;
}

Options._setAllOptions = function(aList)
{
  if (!aList) return;
  if (aList.length == 0) return;
  if (aList[0] != "FireIEPref") return;

  let prefs = Services.prefs.getBranch("");

  let aPrefs = [];
  for (let i = 1; i < aList.length; i++)
  {
    let index = aList[i].indexOf("=");
    if (index > 0)
    {
      var name = aList[i].substring(0, index);
      var value = aList[i].substring(index + 1, aList[i].length);
      aPrefs.push([name, value]);
    }
  }
  for (let i = 0; i < aPrefs.length; i++)
  {
    try
    {
      let name = aPrefs[i][0];
      let value = aPrefs[i][1];
      switch (prefs.getPrefType(name))
      {
      case prefs.PREF_BOOL:
        prefs.setBoolPref(name, /true/i.test(value));
        break;
      case prefs.PREF_INT:
        prefs.setIntPref(name, value);
        break;
      case prefs.PREF_STRING:
        if (value.indexOf('"') == 0) value = value.substring(1, value.length - 1);
        let sString = Components.classes["@mozilla.org/supports-string;1"].createInstance(Components.interfaces.nsISupportsString);
        sString.data = value;
        prefs.setComplexValue(name, Components.interfaces.nsISupportsString, sString);
        break;
      }
    }
    catch (e)
    {
      Utils.ERROR(e);
    }
  }
}
