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

Components.utils.import(baseURL.spec + "AppIntegration.jsm");
Components.utils.import(baseURL.spec + "GesturePrefObserver.jsm");
Components.utils.import(baseURL.spec + "ABPObserver.jsm");
Components.utils.import(baseURL.spec + "UtilsPluginManager.jsm");
Components.utils.import(baseURL.spec + "LightweightTheme.jsm");

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
};

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
      Utils.alert(window, Utils.getString("fireie.options.import.error"), Utils.getString("fireie.options.alert.title"));
    }
  }
};

Options.restoreDefaultSettings = function()
{
  let aOld = Options._getAllOptions(false);
  let aDefault = Options._getAllOptions(true);
  Options._setAllOptions(aDefault);
  Options.initDialog(true);
  Options._setAllOptions(aOld);
  Options.updateApplyButton(true);
};

// Apply options
Options.apply = function(quiet)
{
  let requiresRestart = false;
  let requiresPluginRestart = false;

  // General
  Prefs.handleUrlBar = E("handleurl").checked;
  Prefs.autoswitch_enabled = !E("disableAutoSwitch").checked;
  Prefs.autoSwitchOnRuleMiss = E("autoSwitchOnRuleMiss").value;
  Prefs.autoSwitchOnExceptionalRuleHit = E("autoSwitchOnExceptionalRuleHit").value;

  let newKey = E("shortcut-key").value;
  if (Prefs.shortcut_key != newKey)
    requiresRestart = true;
  Prefs.shortcut_key = newKey;

  let newModifiers = E("shortcut-modifiers").value;
  if (Prefs.shortcut_modifiers != newModifiers)
    requiresRestart = true;
  Prefs.shortcut_modifiers = newModifiers;

  Prefs.shortcutEnabled = E("shortcutEnabled").checked;
  Prefs.privatebrowsingwarning = E("privatebrowsingwarning").checked;
  
  // UI
  Prefs.showSiteFavicon = E("favicon").value == "faviconSite";
  Prefs.showUrlBarLabel = (E("iconDisplay").value == "iconAndText");
  Prefs.hideUrlBarButton = (E("iconDisplay").value == "iconHidden");
  Prefs.showUrlBarButtonOnlyForIE = E("showUrlBarButtonOnlyForIE").checked;
  Prefs.fxLabel = E("fxLabel").value;
  Prefs.ieLabel = E("ieLabel").value;
  Prefs.showTooltipText = E("showTooltipText").checked;
  Prefs.showStatusText = E("showStatusText").checked;
  Prefs.showContextMenuItems = E("showContextMenuItems").checked;
  
  // Integration
  Prefs.forceMGSupport = E("forceMGSupport").checked;
  Prefs.abpSupportEnabled = E("abpSupportEnabled").checked;
  Prefs.cookieSyncEnabled = E("cookieSyncEnabled").checked;
  Prefs.privateCookieSyncEnabled = E("privateCookieSyncEnabled").checked;
  Prefs.historyEnabled = E("historyEnabled").checked;
  let newRedirect = E("disableFolderRedirection").checked;
  if (Prefs.disableFolderRedirection != newRedirect)
    requiresPluginRestart = true;
  Prefs.disableFolderRedirection = newRedirect;
  
  // IE compatibility mode
  let newMode = "ie7mode";
  let iemode = E("iemode-menulist");
  if (iemode)
  {
    newMode = iemode.value;
  }
  if (Prefs.compatMode != newMode)
  {
    requiresPluginRestart = true;
    Prefs.compatMode = newMode;
    Options.applyIECompatMode();
  }
  
  // GPU Rendering State
  let newGPURendering = E("gpuRendering").checked;
  if (Prefs.gpuRendering != newGPURendering)
  {
    requiresPluginRestart = true;
    Prefs.gpuRendering = newGPURendering;
    Options.applyGPURenderingState();
  }

  //update UI
  Options.updateApplyButton(false);
  
  if (requiresPluginRestart)
  {
    // Prompt user for reloading the plugin process
    let ifReload = UtilsPluginManager.isRunningOOP && !quiet &&
      Utils.confirm(window,
        Utils.getString("fireie.options.alert.restartPluginProcess"),
        Utils.getString("fireie.options.alert.title"));

    if (ifReload)
      UtilsPluginManager.reloadPluginProcess();
    else
      requiresRestart = true;
  }

  //notify of restart requirement
  if (requiresRestart && !quiet)
  {
    Utils.alert(window, Utils.getString("fireie.options.alert.restart"),
                        Utils.getString("fireie.options.alert.title"));
  }
};

Options.getIECompatMode = function()
{
  let wrk = Components.classes["@mozilla.org/windows-registry-key;1"].createInstance(Components.interfaces.nsIWindowsRegKey);
  let value = 7000;
  try
  {
    wrk.create(wrk.ROOT_KEY_CURRENT_USER, "SOFTWARE\\Microsoft\\Internet Explorer\\Main\\FeatureControl\\FEATURE_BROWSER_EMULATION", wrk.ACCESS_READ);
    value = wrk.readIntValue(AppIntegration.getPluginProcessName());
  }
  catch (e)
  {
    Utils.LOG("Failed to get IE Compat Mode from registry: " + e);
  }
  finally
  {
    wrk.close();
  }
  
  let mode = "ie7mode";
  switch (value)
  {
  case 7000:
    mode = "ie7mode";
    break;
  case 8000:
    mode = "ie8mode";
    break;
  case 8888:
    mode = "ie8forced";
    break;
  case 9000:
    mode = "ie9mode";
    break;
  case 9999:
    mode = "ie9forced";
    break;
  case 10000:
    mode = "ie10mode";
    break;
  case 10001:
    mode = "ie10forced";
    break;
  case 11000:
    mode = "ie11edge";
    break;
  case 11001:
    mode = "ie11forcededge";
    break;
  default:
    mode = "ie7mode";
    break;
  }
  
  Prefs.compatMode = mode;
};

Options.applyIECompatMode = function()
{
  let mode = Prefs.compatMode;
  let value = 7000;
  switch (mode)
  {
  case "ie7mode":
    value = 7000;
    break;
  case "ie8mode":
    value = 8000;
    break;
  case "ie8forced":
    value = 8888;
    break;
  case "ie9mode":
    value = 9000;
    break;
  case "ie9forced":
    value = 9999;
    break;
  case "ie10mode":
    value = 10000;
    break;
  case "ie10forced":
    value = 10001;
    break;
  case "ie11edge":
    value = 11000;
    break;
  case "ie11forcededge":
    value = 11001;
    break;
  default:
    value = 7000;
    break;
  }
  
  let wrk = Components.classes["@mozilla.org/windows-registry-key;1"].createInstance(Components.interfaces.nsIWindowsRegKey);
  try
  {
    wrk.create(wrk.ROOT_KEY_CURRENT_USER, "SOFTWARE\\Microsoft\\Internet Explorer\\Main\\FeatureControl\\FEATURE_BROWSER_EMULATION", wrk.ACCESS_WRITE);
    wrk.writeIntValue(AppIntegration.getPluginProcessName(), value);
  }
  catch (e)
  {
    Utils.ERROR("Failed to write IE Compat Mode into registry: " + e);
  }
  finally
  {
    wrk.close();
  }
};

Options.getGPURenderingState = function()
{
  let wrk = Components.classes["@mozilla.org/windows-registry-key;1"].createInstance(Components.interfaces.nsIWindowsRegKey);
  let state = false;
  try
  {
    wrk.create(wrk.ROOT_KEY_CURRENT_USER, "SOFTWARE\\Microsoft\\Internet Explorer\\Main\\FeatureControl\\FEATURE_GPU_RENDERING", wrk.ACCESS_READ);
    state = wrk.readIntValue(AppIntegration.getPluginProcessName()) == 1;
  }
  catch (e)
  {
    Utils.LOG("Failed to get GPU Rendering State from registry: " + e);
  }
  finally
  {
    wrk.close();
  }
  
  Prefs.gpuRendering = state;
};

Options.applyGPURenderingState = function()
{
  let wrk = Components.classes["@mozilla.org/windows-registry-key;1"].createInstance(Components.interfaces.nsIWindowsRegKey);
  try
  {
    wrk.create(wrk.ROOT_KEY_CURRENT_USER, "SOFTWARE\\Microsoft\\Internet Explorer\\Main\\FeatureControl\\FEATURE_GPU_RENDERING", wrk.ACCESS_WRITE);
    wrk.writeIntValue(AppIntegration.getPluginProcessName(), Prefs.gpuRendering ? 1 : 0);
  }
  catch (e)
  {
    Utils.ERROR("Failed to write GPU Rendering State into registry: " + e);
  }
  finally
  {
    wrk.close();
  }
};

// Get IE's main version number
Options.getIEMainVersion = function()
{
  return Utils.ieMajorVersion;
};

Options.updateIEModeTab = function(restore)
{
  let mainIEVersion = Options.getIEMainVersion();
  // IE7 or lower does not support compatible modes and GPU rendering
  if (mainIEVersion < 8)
  {
    return;
  }
  if (mainIEVersion >= 11)
  {
    E("ie11edge-menuitem").hidden = false;
    E("ie11forcededge-menuitem").hidden = false;
  }
  if (mainIEVersion >= 10)
  {
    E("ie10mode-menuitem").hidden = false;
    E("ie10forced-menuitem").hidden = false;
  }
  if (mainIEVersion >= 9)
  {
    E("ie9mode-menuitem").hidden = false;
    E("ie9forced-menuitem").hidden = false;
    // IE9+ supports hardware accelerated rendering
    E("ieFeatures").hidden = false;
    E("gpuRendering").hidden = false;
  }
  // mainIEVersion >= 8
  E("ie8mode-menuitem").hidden = false;
  E("ie8forced-menuitem").hidden = false;
  E("ie7mode-menuitem").hidden = false;
  E("iecompat").hidden = false;
  
  E("iemodeNotSupported").hidden = true;
  E("iemodeRestartDescr").hidden = UtilsPluginManager.isRunningOOP;
  E("iemodeReloadDescr").hidden = !UtilsPluginManager.isRunningOOP;
  
  // do not attempt to get values from registry if we are restoring default
  if (!restore)
    Options.getIECompatMode();
  let mode = Prefs.compatMode;
  E("iemode-menulist").value = mode;
  Options.updateIECompatDescription();
  
  if (!restore)
    Options.getGPURenderingState();
  E("gpuRendering").checked = Prefs.gpuRendering;
};

// Update ABP status according to ABPObserver
Options.updateABPStatus = function()
{
  let status = ABPObserver.getStatus();
  E("abpStatusNotDetected").hidden = (status != ABPStatus.NotDetected);
  E("abpStatusEnabled").hidden = (status != ABPStatus.Enabled);
  E("abpStatusDisabled").hidden = (status != ABPStatus.Disabled);
  E("abpStatusLoading").hidden = (status != ABPStatus.Loading);
  E("abpStatusLoadFailed").hidden = (status != ABPStatus.LoadFailed);
  
  E("abpSupportEnabled").disabled = (status == ABPStatus.NotDetected);
  
  if (status == ABPStatus.NotDetected)
    E("abpStatusAdblockerName").hidden = true;
  else
  {
    E("abpStatusAdblockerName").value = "(" + ABPObserver.getAdblockerName() + ")";
    E("abpStatusAdblockerName").hidden = false;
  }
};

// Hide customLabels UI if icon display mode is not iconAndText
Options.updateCustomLabelsUI = function()
{
  E("customLabels").hidden = (E("iconDisplay").value != "iconAndText");
  E("showUrlBarButtonOnlyForIE").hidden = (E("iconDisplay").value == "iconHidden");
  E("fxLabel").disabled = E("showUrlBarButtonOnlyForIE").checked;
  let images = LightweightTheme.getThemeImages();
  if (images && images.fxURL && images.ieURL)
  {
    E("customLabels-fxIcon").setAttribute("src", images.fxURL);
    E("customLabels-ieIcon").setAttribute("src", images.ieURL);
  }
  Options.sizeToContent();
};

Options.updateIECompatDescription = function()
{
  E("iemode-descr").textContent =
    Utils.getString("fireie.options.iemodeDescr." + E("iemode-menulist").value);
  Options.sizeToContent();
};

Options.updateAutoSwitchElements = function()
{
  let disabled = E("disableAutoSwitch").checked;
  [].forEach.call(document.querySelectorAll(".auto-switch-element"), function(element)
  {
    element.disabled = disabled;
  });
};

Options._getGroupValue = function(value, allowedValues, defValue)
{
  if (allowedValues.indexOf(value) !== -1)
    return value;
  return defValue;
};

Options.initDialog = function(restore)
{
  // General
  E("handleurl").checked = Prefs.handleUrlBar;
  E("disableAutoSwitch").checked = !Prefs.autoswitch_enabled;
  E("autoSwitchOnRuleMiss").value =
    Options._getGroupValue(Prefs.autoSwitchOnRuleMiss, ["fx", "ie"], "no");
  E("autoSwitchOnExceptionalRuleHit").value =
    Options._getGroupValue(Prefs.autoSwitchOnExceptionalRuleHit, ["fx"], "no");
  E("shortcutEnabled").checked = Prefs.shortcutEnabled;
  E("shortcut-modifiers").value = Prefs.shortcut_modifiers;
  E("shortcut-key").value = Prefs.shortcut_key;
  E("privatebrowsingwarning").checked = Prefs.privatebrowsingwarning;

  // UI
  E("favicon").value = Prefs.showSiteFavicon ? "faviconSite" : "faviconIE";
  E("iconDisplay").value = Prefs.hideUrlBarButton ? "iconHidden" : (Prefs.showUrlBarLabel ? "iconAndText" : "iconOnly");
  E("showUrlBarButtonOnlyForIE").checked = Prefs.showUrlBarButtonOnlyForIE;
  E("fxLabel").value = Prefs.fxLabel; E("fxLabel").placeholder = Utils.getString("fireie.urlbar.switch.label.fx");
  E("ieLabel").value = Prefs.ieLabel; E("ieLabel").placeholder = Utils.getString("fireie.urlbar.switch.label.ie");
  E("showTooltipText").checked = Prefs.showTooltipText;
  E("showStatusText").checked = Prefs.showStatusText;
  E("showContextMenuItems").checked = Prefs.showContextMenuItems;
  // hide "showStatusText" if we don't handle status messages ourselves
  let ifHide = !AppIntegration.shouldShowStatusOurselves();
  E("statusBarGroup").hidden = ifHide;

  // Integration
  E("forceMGSupport").checked = Prefs.forceMGSupport;
  E("abpSupportEnabled").checked = Prefs.abpSupportEnabled;
  E("cookieSyncEnabled").checked = Prefs.cookieSyncEnabled;
  E("privateCookieSyncEnabled").checked = Prefs.privateCookieSyncEnabled;
  E("privateCookieSyncEnabled").disabled = !Prefs.cookieSyncEnabled;
  E("historyEnabled").checked = Prefs.historyEnabled;
  // disable MGS checkbox if we already detected some gesture extension
  if (GesturePrefObserver.hasGestureExtension())
    E("forceMGSupport").disabled = true;
  else
    E("alreadyEnabledMGSupportLabel").hidden = true;
  E("disableFolderRedirection").checked = Prefs.disableFolderRedirection;
  if (Options.getIEMainVersion() >= 10)
  {
    E("disableFolderRedirection").hidden = true;
  }
  if (!E("disableFolderRedirection").hidden)
  {
    E("integrationRestartDescr").hidden = UtilsPluginManager.isRunningOOP;
    E("integrationReloadDescr").hidden = !UtilsPluginManager.isRunningOOP;
  }

  // IE Compatibility Mode
  Options.updateIEModeTab(restore);

  // updateStatus
  Options.updateAutoSwitchElements();
  Options.handleShortcutEnabled();
  Options.updateCustomLabelsUI();
  Options.updateABPStatus();
  Options.updateApplyButton(false);
};

Options.setIconDisplayValue = function(value)
{
  E("iconDisplay").value = value;
  Options.updateCustomLabelsUI();
  Options.updateApplyButton(true);
};

Options.onCookieSyncChanged = function()
{
  let enabled = E("cookieSyncEnabled").checked;
  E("privateCookieSyncEnabled").disabled = !enabled;
};

Options.onPrivateCookieSyncChanged = function()
{
  let enabled = E("privateCookieSyncEnabled").checked;
  // Let user confirm potential privacy issue
  if (enabled && !Utils.confirm(window, Utils.getString("fireie.options.alert.privateCookieSync"), 
                                Utils.getString("fireie.options.alert.title")))
  {
    E("privateCookieSyncEnabled").checked = false;
  }
};

Options.updateApplyButton = function(e)
{
  document.getElementById("myApply").disabled = !e;
};

Options.handleShortcutEnabled = function(e)
{
  let disable = !E("shortcutEnabled").checked;
  E("shortcut-modifiers").disabled = disable;
  E("shortcut-plus").disabled = disable;
  E("shortcut-key").disabled = disable;
};

Options.sizeToContent = function()
{
  doSizeToContent(window, document);
};

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
  Options.sizeToContent();
  
  addEventListenerByTagName("checkbox", "command", Options.updateApplyButton);
  addEventListenerByTagName("radio", "command", Options.updateApplyButton);
  addEventListenerByTagName("menulist", "command", Options.updateApplyButton);
  addEventListenerByTagName("html:input", "input", Options.updateApplyButton);
  addEventListenerByTagName("html:input", "focus", function() { this.select(); });
  
  E("disableAutoSwitch").addEventListener("command", Options.updateAutoSwitchElements, false);
  E("shortcutEnabled").addEventListener('command', Options.handleShortcutEnabled);
  
  E("iconDisplay").addEventListener("command", Options.updateCustomLabelsUI, false);
  E("showUrlBarButtonOnlyForIE").addEventListener("command", Options.updateCustomLabelsUI, false);
  E("iemode-menulist").addEventListener("command", Options.updateIECompatDescription, false);

  ABPObserver.addListener(Options.updateABPStatus);
  window.addEventListener("unload", function()
  {
    ABPObserver.removeListener(Options.updateABPStatus);
  });
};

Options.close = function()
{
  let isModified = !document.getElementById("myApply").disabled;
  if (isModified)
  {
    if (Utils.confirm(window, Utils.getString("fireie.options.alert.modified"), Utils.getString("fireie.options.alert.title")))
    {
      Options.apply();
    }
  }
};

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
};

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
};

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
};

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
};
