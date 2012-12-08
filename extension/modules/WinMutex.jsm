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
 * @fileOverview Windows system-wide mutex implementation using Win32 API
 */
 
var EXPORTED_SYMBOLS = ["WinMutex"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);

Cu.import("resource://gre/modules/ctypes.jsm");

Cu.import(baseURL.spec + "Utils.jsm");

let CreateMutexW = null;
let WaitForSingleObject = null;
let ReleaseMutex = null;
let CloseHandle = null;

const HANDLE = new ctypes.PointerType(new ctypes.StructType("HANDLE"));
const BOOL = ctypes.int32_t;
const DWORD = ctypes.uint32_t;
const PVOID = ctypes.voidptr_t;
const LPCWSTR = ctypes.jschar.ptr;

// The infinite timeout constant
const INFINITE = 0xFFFFFFFF;

// WaitForSingleObject return values
const WAIT_ABANDONED = 0x80;
const WAIT_OBJECT_0 = 0;
const WAIT_TIMEOUT = 0x102;
const WAIT_FAILED = 0xFFFFFFFF;

function init()
{
  let CallBackABI = ctypes.stdcall_abi;
  let WinABI = ctypes.winapi_abi;
  if (ctypes.size_t.size == 8)
  {
    CallBackABI = ctypes.default_abi;
    WinABI = ctypes.default_abi;
  }
  
  try
  {
    let kernel32dll = ctypes.open("kernel32.dll");
    if (!kernel32dll)
      throw "Failed to load kernel32.dll";
      
    /**
     * HANDLE WINAPI CreateMutex(
     *   _In_opt_  LPSECURITY_ATTRIBUTES lpMutexAttributes,
     *   _In_      BOOL bInitialOwner,
     *   _In_opt_  LPCTSTR lpName
     * );
     */
    CreateMutexW = kernel32dll.declare("CreateMutexW", WinABI, HANDLE,
      PVOID, BOOL, LPCWSTR);
    
    /**
     * DWORD WINAPI WaitForSingleObject(
     *   _In_  HANDLE hHandle,
     *   _In_  DWORD dwMilliseconds
     * );
     */
    WaitForSingleObject = kernel32dll.declare("WaitForSingleObject", WinABI, DWORD,
      HANDLE, DWORD);
    
    /**
     * BOOL WINAPI ReleaseMutex(
     *   _In_  HANDLE hMutex
     * );
     */
    ReleaseMutex = kernel32dll.declare("ReleaseMutex", WinABI, BOOL,
      HANDLE);
    
    /**
     * BOOL WINAPI CloseHandle(
     *   _In_  HANDLE hObject
     * );
     */
    CloseHandle = kernel32dll.declare("CloseHandle", WinABI, BOOL,
      HANDLE);
  } catch (ex) {
    Utils.ERROR("Failed to initialize WinMutex.jsm: " + ex);
  }
}

let WinMutex = function(mutexName)
{
  this.name = mutexName;
  let hMutex = CreateMutexW(null, 0, this.name);
  
  if (!hMutex)
    throw "CreateMutexW failed with ERROR " + (ctypes.winLastError || 0);
    
  this.handle = hMutex;
}

WinMutex.prototype = {
  
  /** name of the mutex */
  name: null,
  
  /** whether it's acquired or not */
  acquired: false,
  
  /** handle of the system mutex */
  handle: null,
  
  /**
   * Try to acquire the mutex
   * @param timeout milliseconds to wait, null for waiting forever
   * @returns true if successful, false otherwise
   */
  acquire: function(timeout)
  {
    if (timeout == null)
      timeout = INFINITE;
    
    let ret = WaitForSingleObject(this.handle, timeout);
    
    switch (ret)
    {
    case WAIT_ABANDONED:
    case WAIT_OBJECT_0:
      return this.acquired = true;
    case WAIT_TIMEOUT:
      return false;
    default:
      throw "WaitForSingleObject failed with ERROR " + (ctypes.winLastError || 0);
    }
  },
  
  /**
   * Release the acquired the mutex
   */
  release: function()
  {
    let ret = ReleaseMutex(this.handle);
    
    if (ret == 0)
      throw "ReleaseMutex failed with ERROR " + (ctypes.winLastError || 0);
    
    this.acquired = false;
  },
  
  /**
   * Close the mutex and release the handle
   * REMEMBER TO CALL THIS before object get GCed
   */
  close: function()
  {
    if (this.handle == null)
      return;
    
    let ret = CloseHandle(this.handle);
    
    if (ret == 0)
      Utils.ERROR("CloseHandle failed with ERROR " + (ctypes.winLastError || 0));
    
    this.handle = null;
  },
  
  /**
   * Returns the javascript string representation of this mutex
   */
  toString: function()
  {
    return "WinMutex(name=\"[name]\", acquired=\"[acquired]\")".replace(/\[name\]/, this.name)
      .replace(/\[acquired\]/, this.acquired);
  }
};

init();
