/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

/**
 * Implementation of backup and restore functionality.
 * @class
 */
var Backup =
{
  /**
   * Template for menu items to be displayed in the Restore menu (for automated
   * backups).
   * @type Element
   */
  restoreTemplate: null,

  /**
   * Element after which restore items should be inserted.
   * @type Element
   */
  restoreInsertionPoint: null,

  /**
   * Regular expression to recognize checksum comments.
   */
  CHECKSUM_REGEXP: /^!\s*checksum[\s\-:]+([\w\+\/]+)/i,

  /**
   * Regular expression to recognize group title comments.
   */
  GROUPTITLE_REGEXP: /^!\s*\[(.*)\]((?:\/\w+)*)\s*$/,


  /**
   * Initializes backup UI.
   */
  init: function()
  {
    this.restoreTemplate = E("restoreBackupTemplate");
    this.restoreInsertionPoint = this.restoreTemplate.previousSibling;
    this.restoreTemplate.parentNode.removeChild(this.restoreTemplate);
    this.restoreTemplate.removeAttribute("id");
    this.restoreTemplate.removeAttribute("hidden");
  },

  /**
   * Gets the default download dir, as used by the browser itself.
   */
  getDefaultDir: function() /**nsIFile*/
  {
    try
    {
      return Services.prefs.getComplexValue("browser.download.lastDir", Ci.nsILocalFile);
    }
    catch (e)
    {
      // No default download location. Default to desktop.
      return Services.dirsvc.get("Desk", Ci.nsILocalFile);
    }
  },

  /**
   * Saves new default download dir after the user chose a different directory to
   * save his files to.
   */
  saveDefaultDir: function(/**nsIFile*/ dir)
  {
    try
    {
      Services.prefs.setComplexValue("browser.download.lastDir", Ci.nsILocalFile, dir);
    } catch(e) {};
  },

  /**
   * Called when the Restore menu is being opened, fills in "Automated backup"
   * entries.
   */
  fillRestorePopup: function()
  {
    while (this.restoreInsertionPoint.nextSibling && !this.restoreInsertionPoint.nextSibling.id)
      this.restoreInsertionPoint.parentNode.removeChild(this.restoreInsertionPoint.nextSibling);

    let files = RuleStorage.getBackupFiles().reverse();
    for (let i = 0; i < files.length; i++)
    {
      let file = files[i];
      let item = this.restoreTemplate.cloneNode(true);
      let label = item.getAttribute("label");
      label = label.replace(/\?1\?/, Utils.formatTime(file.lastModifiedTime));
      item.setAttribute("label", label);
      item.addEventListener("command", function()
      {
        Backup.restoreAllData(file);
      }, false);
      this.restoreInsertionPoint.parentNode.insertBefore(item, this.restoreInsertionPoint.nextSibling);
    }
  },

  /**
   * Lets the user choose a file to restore rules from.
   */
  restoreFromFile: function()
  {
    let picker = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    picker.init(window, E("backupButton").getAttribute("_restoreDialogTitle"), picker.modeOpen);
    picker.defaultExtension = ".ini";
    picker.appendFilter(E("backupButton").getAttribute("_fileRuleCustom"), "*.txt");
    picker.appendFilter(E("backupButton").getAttribute("_fileRuleComplete"), "*.ini");

    if (picker.show() != picker.returnCancel)
    {
      this.saveDefaultDir(picker.file.parent);
      if (picker.filterIndex == 1)
        this.restoreAllData(picker.file);
      else
        this.restoreCustomRules(picker.file);
    }
  },

  /**
   * Restores patterns.ini from a file.
   */
  restoreAllData: function(/**nsIFile*/ file)
  {
    let fileStream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
    fileStream.init(file, 0x01, 0444, 0);

    let stream = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(Ci.nsIConverterInputStream);
    stream.init(fileStream, "UTF-8", 16384, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
    stream = stream.QueryInterface(Ci.nsIUnicharLineInputStream);

    let lines = [];
    let line = {value: null};
    if (stream.readLine(line))
      lines.push(line.value);
    if (stream.readLine(line))
      lines.push(line.value);
    stream.close();

    if (lines.length < 2 || lines[0] != "# Fire-IE preferences" || !/version=(\d+)/.test(lines[1]))
    {
      Utils.alert(window, E("backupButton").getAttribute("_restoreError"), E("backupButton").getAttribute("_restoreDialogTitle"));
      return;
    }

    let warning = E("backupButton").getAttribute("_restoreCompleteWarning");
    let minVersion = parseInt(RegExp.$1, 10);
    if (minVersion > RuleStorage.formatVersion)
      warning += "\n\n" + E("backupButton").getAttribute("_restoreVersionWarning");

    if (!Utils.confirm(window, warning, E("backupButton").getAttribute("_restoreDialogTitle")))
      return;

    RuleStorage.loadFromDisk(file);
  },

  /**
   * Restores custom rules from a file.
   */
  restoreCustomRules: function(/**nsIFile*/ file)
  {
    let fileStream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
    fileStream.init(file, 0x01, 0444, 0);

    let stream = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(Ci.nsIConverterInputStream);
    stream.init(fileStream, "UTF-8", 16384, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
    stream = stream.QueryInterface(Ci.nsIUnicharLineInputStream);

    let lines = [];
    let line = {value: null};
    while (stream.readLine(line))
      lines.push(line.value);
    if (line.value)
      lines.push(line.value);
    stream.close();

    if (!lines.length || !/\[Fire-IE(?:\s*([\d\.]+(?:(?:a|alpha|b|beta|pre|rc)\d*)?)?)?\]/i.test(lines[0]))
    {
      Utils.alert(window, E("backupButton").getAttribute("_restoreError"), E("backupButton").getAttribute("_restoreDialogTitle"));
      return;
    }

    let warning = E("backupButton").getAttribute("_restoreCustomWarning");
    let minVersion = RegExp.$1;
    if (minVersion && Services.vc.compare(minVersion, Utils.addonVersion) > 0)
      warning += "\n\n" + E("backupButton").getAttribute("_restoreVersionWarning");

    if (!Utils.confirm(window, warning, E("backupButton").getAttribute("_restoreDialogTitle")))
      return;

    let subscriptions = RuleStorage.subscriptions.filter(function(s) s instanceof SpecialSubscription);
    for (let i = 0; i < subscriptions.length; i++)
      RuleStorage.removeSubscription(subscriptions[i]);

    let subscription = null;
    for (let i = 1; i < lines.length; i++)
    {
      if (this.CHECKSUM_REGEXP.test(lines[i]))
        continue;
      else if (this.GROUPTITLE_REGEXP.test(lines[i]))
      {
        if (subscription)
          RuleStorage.addSubscription(subscription);
        subscription = SpecialSubscription.create(RegExp.$1);

        let options = RegExp.$2;
        let defaults = [];
        if (options)
          options = options.split("/");
        for (let j = 0; j < options.length; j++)
          if (options[j] in SpecialSubscription.defaultsMap)
            defaults.push(options[j]);
        if (defaults.length)
          subscription.defaults = defaults;
      }
      else
      {
        let rule = Rule.fromText(Rule.normalize(lines[i]));
        if (!rule)
          continue;
        if (!subscription)
          subscription = SpecialSubscription.create(Utils.getString("switchGroup.title"));
        subscription.rules.push(rule);
      }
    }
    if (subscription)
      RuleStorage.addSubscription(subscription);
    E("tabs").selectedIndex = 1;
  },

  /**
   * Lets the user choose a file to backup rules to.
   */
  backupToFile: function()
  {
    let picker = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    picker.init(window, E("backupButton").getAttribute("_backupDialogTitle"), picker.modeSave);
    picker.defaultExtension = ".ini";
    picker.appendFilter(E("backupButton").getAttribute("_fileRuleCustom"), "*.txt");
    picker.appendFilter(E("backupButton").getAttribute("_fileRuleComplete"), "*.ini");

    if (picker.show() != picker.returnCancel)
    {
      this.saveDefaultDir(picker.file.parent);
      if (picker.filterIndex == 1)
        this.backupAllData(picker.file);
      else
        this.backupCustomRules(picker.file);
    }
  },

  /**
   * Writes all patterns.ini data to a file.
   */
  backupAllData: function(/**nsIFile*/ file)
  {
    RuleStorage.saveToDisk(file);
  },

  /**
   * Writes user's custom rules to a file.
   */
  backupCustomRules: function(/**nsIFile*/ file)
  {
    let subscriptions = RuleStorage.subscriptions.filter(function(s) s instanceof SpecialSubscription);
    let list = ["[Fire-IE %v]".replace(/%v/, Utils.addonVersion)];
    for (let i = 0; i < subscriptions.length; i++)
    {
      let subscription = subscriptions[i];
      let typeAddition = "";
      if (subscription.defaults)
        typeAddition = "/" + subscription.defaults.join("/");
      list.push("! [" + subscription.title + "]" + typeAddition);
      for (let j = 0; j < subscription.rules.length; j++)
      {
        let rule = subscription.rules[j];
        // Skip checksums
        if (rule instanceof CommentRule && this.CHECKSUM_REGEXP.test(rule.text))
          continue;
        // Skip group headers
        if (rule instanceof CommentRule && this.GROUPTITLE_REGEXP.test(rule.text))
          continue;
        list.push(rule.text);
      }
    }

    // Insert checksum
    let checksum = Utils.generateChecksum(list);
    if (checksum)
      list.splice(1, 0, "! Checksum: " + checksum);

    try
    {
      let fileStream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
      fileStream.init(file, 0x02 | 0x08 | 0x20, 0644, 0);

      let stream = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(Ci.nsIConverterOutputStream);
      stream.init(fileStream, "UTF-8", 16384, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);

      stream.writeString(list.join(Utils.getLineBreak()));

      stream.close();
    }
    catch (e)
    {
      Cu.reportError(e);
      Utils.alert(window, E("backupButton").getAttribute("_backupError"), E("backupButton").getAttribute("_backupDialogTitle"));
    }
  }
};

window.addEventListener("load", function()
{
  Backup.init();
}, false);
