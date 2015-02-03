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
 * @fileOverview Manipulation between file path and URI
 */

var EXPORTED_SYMBOLS = ["WinPathURI"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/ctypes.jsm");
Cu.import(baseURL.spec + "Utils.jsm");

try
{
  Cu.import("resource://gre/modules/osfile.jsm");
}
catch (ex)
{
  Utils.LOG("WinPathURI.jsm: osfile.jsm not found. Using alternative implementation.");
  Cu.import("resource://gre/modules/FileUtils.jsm");
  this.OS = {
    Path: {
      fromFileURI: function(fileURI)
      {
        let fileHandler = Services.io.getProtocolHandler("file").QueryInterface(Ci.nsIFileProtocolHandler);
        let file = fileHandler.getFileFromURLSpec(fileURI);
        return file.path;
      },
      
      toFileURI: function(filePath)
      {
        let file = new FileUtils.File(filePath);
        return Services.io.newFileURI(file).spec;
      }
    }
  };
}

let Path = OS.Path;

/**
HRESULT PathCreateFromUrlW(
  _In_     PCWSTR pszUrl,
  _Out_    PWSTR pszPath,
  _Inout_  DWORD *pcchPath,
  DWORD dwFlags
);
*/
let PathCreateFromUrlW = null;

/**
HRESULT UrlCreateFromPathW(
  _In_     PCWSTR pszPath,
  _Out_    PWSTR pszUrl,
  _Inout_  DWORD *pcchUrl,
  DWORD dwFlags
);
*/
let UrlCreateFromPathW = null;

/**
 * Types definition
 */
let HRESULT = ctypes.int32_t;
let PCWSTR = ctypes.jschar.ptr;
let PWSTR = ctypes.jschar.ptr;
let WSTR = ctypes.jschar.array();
let DWORD = ctypes.uint32_t;

/**
 * Constants definiton
 */
let NULL = 0;
let INTERNET_MAX_URL_LENGTH = 2084;
let MAX_PATH = 260;
let S_OK = 0;

let libShlwapi = null;
let abi = ctypes.winapi_abi;

let WinPathURI = {
  startup: function()
  {
    try
    {
      libShlwapi = ctypes.open("Shlwapi.dll");
      PathCreateFromUrlW = libShlwapi.declare("PathCreateFromUrlW", abi,
        HRESULT, PCWSTR, PWSTR, DWORD.ptr, DWORD);
      UrlCreateFromPathW = libShlwapi.declare("UrlCreateFromPathW", abi,
        HRESULT, PCWSTR, PWSTR, DWORD.ptr, DWORD);
    }
    catch (ex)
    {
      Utils.ERROR("Failed to initialize WinPathURI: " + ex);
    }
  },
  
  shutdown: function()
  {
    if (libShlwapi)
      libShlwapi.close();
  },
  
  filePathFromIEURI: function(ieFileURI)
  {
    if (!PathCreateFromUrlW)
      return null;
    
    let localFilePathData = new WSTR(MAX_PATH);
    let cch = new DWORD(MAX_PATH);
    let ret = PathCreateFromUrlW(ieFileURI,
              localFilePathData.addressOfElement(0), cch.address(), NULL);
    if (ret != S_OK)
    {
      Utils.ERROR("PathCreateFromUrlW failed with error " + ret);
      return null;
    }
    let localFilePath = localFilePathData.readString();
    return localFilePath;
  },

  filePathFromFxURI: function(fxFileURI)
  {
    let localFilePath = Path.fromFileURI(fxFileURI);
    return localFilePath;
  },
  
  filePathToIEURI: function(localFilePath)
  {
    if (!UrlCreateFromPathW)
      return null;
    
    let ieFileURIData = new WSTR(INTERNET_MAX_URL_LENGTH);
    let cch = new DWORD(INTERNET_MAX_URL_LENGTH);
    let ret = UrlCreateFromPathW(localFilePath,
              ieFileURIData.addressOfElement(0), cch.address(), NULL);
    if (ret != S_OK)
    {
      Utils.ERROR("UrlCreateFromPathW failed with error " + ret);
      return null;
    }
    let ieFileURI = ieFileURIData.readString();
    return ieFileURI;
  },
  
  filePathToFxURI: function(localFilePath)
  {
    let fxFileURI = Path.toFileURI(localFilePath);
    return fxFileURI;
  },
  
  convertToFxFileURI: function(ieFileURI)
  {
    // {IE File URI} -> {Local File Path}
    let localFilePath = this.filePathFromIEURI(ieFileURI);
    if (!localFilePath)
      return null;

    // {Local File Path} -> {Fx File URI}
    return this.filePathToFxURI(localFilePath);
  },
  
  convertToIEFileURI: function(fxFileURI)
  {
    // {Fx File URI} -> {Local File Path}
    let localFilePath = this.filePathFromFxURI(fxFileURI);
    if (!localFilePath)
      return null;
    
    // {Local File Path} -> {IE File URI}
    return this.filePathToIEURI(localFilePath);
  },
};
