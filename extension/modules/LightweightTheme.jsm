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
 * @fileOverview Manages the themes
 */

let EXPORTED_SYMBOLS = ["LightweightTheme"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);

Cu.import("resource://gre/modules/Services.jsm");

Cu.import(baseURL.spec + "Utils.jsm");
Cu.import(baseURL.spec + "Prefs.jsm");

let _defaultTheme = {
  id: "hi@fireie.org/default",
  fxURL: "chrome://fireie/skin/engine-fx.png",
  ieURL: "chrome://fireie/skin/engine-ie.png",
  textcolor: "",
};

let _appliedTheme = _defaultTheme;

let LightweightTheme = {

  lazyStartup: function()
  {
    // Try to cache theme images if not already cached
    this.tryCacheThemeImages(this.currentTheme);
  },
  
  shutdown: function()
  {
  },
  
  /**
   * Check to make sure that the themeData has the required fields
   */
  isValidThemeData: function(themeData)
  {
    return typeof(themeData.id) === "string" &&
           Utils.isValidUrl(themeData.fxURL) &&
           Utils.isValidUrl(themeData.ieURL) &&
           typeof(themeData.textcolor) === "string";
  },
  
  /**
   * Gets current theme from preferences.
   * @returns {object} JSON object of current theme. If no theme data is set, returns the default value.
   */
  get currentTheme()
  {
    if (Prefs.currentTheme)
    {
      try
      {
        return JSON.parse(Prefs.currentTheme);
      }
      catch (e)
      {
        Utils.ERROR("Error getting current theme: " + e);
      }
    }
    return _defaultTheme;
  },

  /**
   * Sets current theme to preferences and caches theme images.
   */
  set currentTheme(themeData)
  {
    try
    {
      // Check to make sure that the themeData has the required fields
      if (!this.isValidThemeData(themeData))
      {
        throw "incorrect theme data format";
      }
      
      Prefs.currentTheme = JSON.stringify(themeData);
      this.tryCacheThemeImages(themeData);
    }
    catch (e)
    {
      Utils.ERROR("Error setting current theme: " + e);
    }
  },
  
  /**
   * Saves information of applied theme
   */
  setAppliedTheme: function(themeData)
  {
    _appliedTheme = themeData;
  },
  
  /** ID of the applied theme */
  get appliedThemeId()
  {
    return _appliedTheme.id;
  },
  
  /** Get the URL of IE icon for applied theme */
  get ieIconUrl()
  {
    return _appliedTheme.ieURL;
  },

  /** Get the URL of Firefox icon for applied theme */
  get fxIconUrl()
  {
    return _appliedTheme.fxURL;
  },
  
  /** Are we using the default theme? */
  get isDefaultTheme()
  {
    return this.currentTheme.id === _defaultTheme.id;
  },

  /**
   * Install a theme
   * @param {object} themeData JSON object storing theme data of the following format:
   *               themeData =
   *               {  
   *                 id: "hi@fireie.org/20120404",  // Unique ID of the theme
   *                 fxURL: "http://www.example.com/firefox/personas/01/fx.jpg",  // Absolute URL of the Firefox engine icon  
   *                 ieURL: "http://www.example.com/firefox/personas/01/ie.jpg",  // Absolute URL of the IE engine icon
   *                 textcolor: "#f00",  // Text color of the URL bar engine button
   *               };
   */
  installTheme: function(themeData)
  {
    this.currentTheme = themeData;
  },
  
  /**
   * Reset to default theme
   */
  changeToDefaultTheme: function()
  {
    Prefs.currentTheme = "";
  },

  /**
   * Obtains the cached images of the given theme. This are stored in the
   * _cacheThemeImages method under the directory
   * [profile]/fireie/theme/[FileUtils.getSHA1Name(themeData.id)].
   * @param themeData The data of the theme for which to look the cached images.
   *    Refers to the installTheme method for details about this paramter.
   * @return An object with "fxURL" and "ieURL" properties, each containing
   * the file URL of the image. Null otherwise.
   */
  getCachedThemeImages: function(themeData)
  {
    let cacheDirectory = FileUtils.getThemeCacheDirectory();
    if (!cacheDirectory || !cacheDirectory.exists())
    {
      return null;
    }
    
    let themeDir = FileUtils.getDirectory(cacheDirectory, FileUtils.getSHA1Name(themeData.id), true);
    if (themeDir && themeDir.exists())
    {

      let fxFile = themeDir.clone();
      let ieFile = themeDir.clone();

      let fxFileExtension = Utils.makeURI(themeData.fxURL).QueryInterface(Ci.nsIURL).fileExtension;
      let ieFileExtension = Utils.makeURI(themeData.ieURL).QueryInterface(Ci.nsIURL).fileExtension;

      fxFile.append("fx-engine" + "." + fxFileExtension);
      ieFile.append("ie-engine" + "." + ieFileExtension);
      
      if (fxFile.exists() && ieFile.exists())
      {
        let fxURI = Services.io.newFileURI(fxFile);
        let ieURI = Services.io.newFileURI(ieFile);           
        return {
          fxURL: fxURI.spec,
          ieURL: ieURI.spec
        };
      }
    }
    return null;
  },
  
  /**
   * Obtains the cached images of the given theme if possible. If there's no cached version,
   * online version will be returned.
   * @param themeData The data of the theme for which to look the cached images.
   *    Refers to the installTheme method for details about this paramter.
   * @return An object with "fxURL" and "ieURL" properties, each containing
   * the file URL of the image. Null otherwise.
   */
  getThemeImages: function(themeData)
  {
    if (!themeData) themeData = this.currentTheme;
    
    let images = this.getCachedThemeImages(themeData);
    if (images) return images;
    return {
      fxURL: themeData.fxURL,
      ieURL: themeData.ieURL
    };
  },
  
  /**
   * Tries to cache theme images if they are not yet cached. Does nothing if they are cached already.
   * @param themeData The data of the theme for which to cache the images.
   *    Refers to the installTheme method for details about this paramter.
   */
  tryCacheThemeImages: function(themeData)
  {
    if (themeData.id == _defaultTheme.id)
    {
      Utils.LOG("[Theme] Default theme, no need to cache.");
      return;
    }
    if (this.getCachedThemeImages(themeData))
    {
      Utils.LOG("[Theme] Theme images already cached.");
      return;
    }
    Utils.LOG("[Theme] Caching theme images...");
    this._cacheThemeImages(themeData);

    // Use local cached version 3 sec later
    Utils.runAsyncTimeout(function()
    {
      if (themeData.id == _appliedTheme.id)
      {
        let images = this.getCachedThemeImages(themeData);
        if (images)
        {
          _appliedTheme.fxURL = images.fxURL;
          _appliedTheme.ieURL = images.ieURL;
          // notify windows (AppIntegration.jsm::WindowWrapper) to update theme image URLs
          Services.obs.notifyObservers(null, "fireie-reload-prefs", null);
        }
      }
    }, this, 3000);
  },

  /**
   * Caches images of the given theme inside the
   * directory [profile]/fireie/theme/[FileUtils.getSHA1Name(themeData.id)]. It removes all other
   * existing themes directories before doing so.
   * @param themeData The data of the theme for which to cache the images.
   */
  _cacheThemeImages: function(themeData)
  {
    // Check the paramter
    if (!themeData || !themeData.fxURL || !themeData.ieURL || !themeData.id)
    {
      return;
    }

    let cacheDirectory = FileUtils.getThemeCacheDirectory();

    // Remove all other subdirectories in the cache directory
    let subdirs = FileUtils.getDirectoryEntries(cacheDirectory);
    let subdirName = FileUtils.getSHA1Name(themeData.id);
    for (let i = 0; i < subdirs.length; i++)
    {
      if (subdirs[i].isDirectory() && subdirs[i].leafName != subdirName) subdirs[i].remove(true);
    }

    // Create directory for the given theme
    let themeDir = FileUtils.getDirectory(cacheDirectory, subdirName, false);

    let downloads = [
    {
      url: themeData.fxURL,
      baseName: "fx-engine"
    }, {
      url: themeData.ieURL,
      baseName: "ie-engine"
    }, ];

    for (let i = 0; i < 2; i++)
    {
      // The header can be a base64 string or a malformed URL, in which case
      // the error can be safely ignored.
      try
      {
        let uri = Utils.makeURI(downloads[i].url).QueryInterface(Ci.nsIURL);
        FileUtils.saveFileFromURL(uri, themeDir, downloads[i].baseName + "." + uri.fileExtension);
      }
      catch (e)
      {
        Utils.ERROR("Failed to cache \"" + downloads[i].url + "\": " + e);
      }
    }
  },
};

let FileUtils = {
  /** 
   * DEPRECATED: base64 does not ensure unique names on Windows! Use getSHA1Name instead.
   * Generate a base64-based name for the theme id, safe to use as a file name
   * @param id The theme ids
   * @return The dir name used to cache theme images
   */
  getBase64Name: function(id)
  {
    return btoa(unescape(encodeURIComponent(id))).replace(/\//g, "-");
  },
  
  _converter: Cc["@mozilla.org/intl/scriptableunicodeconverter"]
                .createInstance(Ci.nsIScriptableUnicodeConverter),
  
  _cryptoHash: Cc["@mozilla.org/security/hash;1"]
                 .createInstance(Ci.nsICryptoHash),
  
  /** 
   * Generate a SHA1-based name for the theme id, safe to use as a file name
   * The collision rate should be very very low.
   * @param id The theme ids
   * @return The dir name used to cache theme images
   */
  getSHA1Name: function(id)
  {
    this._converter.charset = "UTF-8";
    // result is an out parameter,
    // result.value will contain the array length
    var result = {};
    // data is an array of bytes
    var data = this._converter.convertToByteArray(id, result);
    this._cryptoHash.init(this._cryptoHash.SHA1);
    this._cryptoHash.update(data, data.length);
    var hash = this._cryptoHash.finish(false);
     
    // return the two-digit hexadecimal code for a byte
    function toHexString(charCode)
    {
      return ("0" + charCode.toString(16)).slice(-2);
    }
     
    // convert the binary hash data to a hex string.
    return [toHexString(hash.charCodeAt(i)) for (i in hash)].join("");
  },
  
  /**
   * Gets the [profile]/fireie/theme directory.
   * @return The reference to the theme cache directory (nsIFile).
   */
  getThemeCacheDirectory: function()
  {
    let profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile);
    let dir = this.getDirectory(profileDir, "fireie", false);
    return this.getDirectory(dir, "theme", false);
  },

  /**
   * Gets a reference to a directory (nsIFile) specified by the given name,
   * located inside the given parent directory.
   * @param aParentDirectory The parent directory of the directory to obtain.
   * @param aDirectoryName The name of the directory to obtain.
   * @param aDontCreate (Optional) Whether or not to create the directory if it
   * does not exist.
   * @return The reference to the directory (nsIFile).
   */
  getDirectory: function(aParentDirectory, aDirectoryName, aDontCreate)
  {
    let dir = aParentDirectory.clone();
    try
    {
      dir.append(aDirectoryName);
      if (!dir.exists() || !dir.isDirectory())
      {
        if (!aDontCreate)
        {
          // read and write permissions to owner and group, read-only for others.
          dir.create(Ci.nsIFile.DIRECTORY_TYPE, 0774);
        }
      }
    }
    catch (ex)
    {
      Utils.ERROR("Could not create '" + aDirectoryName + "' directory");
      dir = null;
    }
    return dir;
  },

  /**
   * Gets an array of the entries (nsIFile) found in the given directory.
   * @param aDirectory The directory from which to obtain the entries.
   * @return The array of entries.
   */
  getDirectoryEntries: function(aDirectory)
  {
    let entries = [];
    try
    {
      let enu = aDirectory.directoryEntries;
      while (enu.hasMoreElements())
      {
        let entry = enu.getNext().QueryInterface(Ci.nsIFile);
        entries.push(entry);
      }
    }
    catch (ex)
    {
      Utils.ERROR("Could not read entries of directory");
    }
    return entries;
  },

  /**
   * Downloads and save a file with given URL.
   * @param {nsIURI} uri The URI of the downloading target.
   * @param {nsIFile} directory The directory in which the file will be written.
   * @param {String} fileName The name of the file to be written.
   */
  saveFileFromURL: function(uri, directory, fileName)
  {
    let jsm = {};
    try
    {
      Cu.import("resource://gre/modules/Downloads.jsm", jsm);
    }
    catch (ex)
    {
    }
    
    let file = directory.clone();
    file.append(fileName);

    if (jsm.Downloads)
    {
      jsm.Downloads.fetch(uri.spec, file.path, {
        isPrivate: true
      }).then(null, function(ex)
      {
        Utils.ERROR("Failed to download \"" + file.path + "\": " + ex);
      });
    }
    else
    {
      // create a persist  
      let persist = Cc["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"].createInstance(Ci.nsIWebBrowserPersist);

      // with persist flags if desired. See nsIWebBrowserPersist page for more PERSIST_FLAGS.  
      const nsIWBP = Ci.nsIWebBrowserPersist;
      const flags = nsIWBP.PERSIST_FLAGS_REPLACE_EXISTING_FILES;
      persist.persistFlags = flags | nsIWBP.PERSIST_FLAGS_AUTODETECT_APPLY_CONVERSION;

      // do the save  
      persist.saveURI(uri, null, null, null, "", file, null);
    }
  }
};
