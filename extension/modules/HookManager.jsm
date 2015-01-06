/*
This file is part of Fire-IE.

Fire-IE is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Fire-IE is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with Fire-IE. If not, see <http://www.gnu.org/licenses/>.
*/

/**
 * @fileOverview HookManager, manages code hooking routines
 */

let EXPORTED_SYMBOLS = ["HookManager"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let baseURL = Cc["@fireie.org/fireie/private;1"].getService(Ci.nsIURI);

Cu.import(baseURL.spec + "Utils.jsm");

/**
 * Stores information about a hooked function
 * @param name - describes the original function's name (for error logging)
 * @param orgFunc - original function reference
 * @param myFuncHead - function that executes before original function
 * @param myFuncTail - function that executes after original function
 * @constructor
 */
let HookFunction = function(name, orgFunc, myFuncHead, myFuncTail) {
  this.name = name;
  this.orgFunc = orgFunc;
  this.myFuncHead = myFuncHead;
  this.myFuncTail = myFuncTail;
};

/**
 * HookManager class, provides closure-preserving hooks without introducing new closures
 * @param globalScope - the global scope that hooked function names can be referenced in
 * @param globalReferencableName - the name that can be used to reference this HM instance
 *                                 in the global scope
 * @constructor
 */
let HookManager = function(globalScope, globalReferencableName) {
  this._scope = globalScope;
  this._refName = globalReferencableName;
  this._hookFunctions = [];
  this._recycledIndices = [];
};

HookManager.prototype = {
  get globalScope() { return this._scope; },
  get globalReferencableName() { return this._refName; },
  get utils() { return Utils; },
  _emptyFunction: function() {},
  
  _addHookFunction: function(hf)
  {
    let idx = 0;
    if (this._recycledIndices.length == 0)
    {
      idx = this._hookFunctions.length;
      this._hookFunctions.push(hf);
    }
    else
    {
      idx = this._recycledIndices.pop();
      this._hookFunctions[idx] = hf;
    }
    return idx;
  },
  
  _recycleFunc: function(func)
  {
    let idx = func.FireIE_orgFuncIdx;
    let HM = func.FireIE_hookManager;
    if (idx == HM._hookFunctions.length - 1)
      HM._hookFunctions.pop();
    else
    {
      HM._hookFunctions[idx] = null;
      HM._recycledIndices.push(idx);
    }
  },
  
  _evalInScope: function(expression)
  {
    return eval("with (this._scope) { " + expression + " }");
  },
  
  _assignInScope: function(name, value)
  {
    // Creates an assign delegate function in this._scope
    // Can't just assign it here cause "value" might be a property of this._scope
    // We must have something that passes value safely into the assignment
    let assignDelegate =
        eval("with (this._scope) { (function() { return " + name + " = arguments[0]; }) }");
    return assignDelegate(value);
  },
  
  _genHookedFunction: function(idx, code)
  {
    let func = this._evalInScope(code);
    func.FireIE_orgFuncIdx = idx;
    func.FireIE_hookManager = this;
    return func;
  },
  
  _closureVarsCode: "  let grn = [grn];\n"
                  + "  let hf = grn._hookFunctions[[idx]];\n"
                  + "  let Utils = grn.utils;\n"
                  + "  let funcName = hf.name;\n"
                  + "  let orgFunc = hf.orgFunc || grn._emptyFunction;\n"
                  + "  let myFuncHead = hf.myFuncHead;\n"
                  + "  let myFuncTail = hf.myFuncTail;\n",
  
  _genClosureVarsCode: function(idx)
  {
    return this._closureVarsCode.replace(/\[grn\]/, this._refName).replace(/\[idx\]/, idx);
  },
  
  _wrapFunctionHeadCode: 
        "(function() {\n"
      + "[gcvc]"
      + "  let ret = null;\n"
      + "  try {\n"
      + "    ret = myFuncHead.apply(this, arguments);\n"
      + "    if (ret && ret.shouldReturn)\n"
      + "      return ret.value;\n"
      + "  } catch (ex) {\n"
      + "    Utils.ERROR('Failed executing hooked function: \"' + funcName + '\"@head: ' + ex);\n"
      + "  }\n"
      + "  let newArgs = (ret && ret.args) || arguments;\n"
      + "  return orgFunc.apply(this, newArgs);\n"
      + "})",

  _wrapFunctionHead: function(orgFunc, myFunc, funcName)
  {
    let idx = this._addHookFunction(new HookFunction(funcName, orgFunc, myFunc, null));
    let code = this._wrapFunctionHeadCode.replace(/\[gcvc\]/, this._genClosureVarsCode(idx));
    return this._genHookedFunction(idx, code);
  },
  
  _wrapFunctionTailCode:
        "(function() {\n"
      + "[gcvc]"
      + "  let ret = orgFunc.apply(this, arguments);\n"
      + "  Array.prototype.splice.call(arguments, 0, 0, ret);\n"
      + "  let myRet = null;\n"
      + "  try {\n"
      + "    myRet = myFuncTail.apply(this, arguments);\n"
      + "  } catch (ex) {\n"
      + "    Utils.ERROR('Failed executing hooked function: \"' + funcName + '\"@tail: ' + ex);\n"
      + "  }\n"
      + "  return (myRet && myRet.shouldModify) ? myRet.value : ret;\n"
      + "})",
      
  _wrapFunctionTail: function(orgFunc, myFunc, funcName)
  {
    let idx = this._addHookFunction(new HookFunction(funcName, orgFunc, null, myFunc));
    let code = this._wrapFunctionTailCode.replace(/\[gcvc\]/, this._genClosureVarsCode(idx));
    return this._genHookedFunction(idx, code);
  },
  
  _wrapFunctionHeadTailCode:
        "(function() {\n"
      + "[gcvc]"
      + "  let ret = null;\n"
      + "  try {\n"
      + "    ret = myFuncHead.apply(this, arguments);\n"
      + "    if (ret && ret.shouldReturn)\n"
      + "      return ret.value;\n"
      + "  } catch (ex) {\n"
      + "    Utils.ERROR('Failed executing hooked function: \"' + funcName + '\"@head: ' + ex);\n"
      + "  }\n"
      + "  let newArgs = (ret && ret.args) || arguments;\n"
      + "  let orgRet = null, myRet = null;\n"
      + "  try {\n"
      + "    orgRet = orgFunc.apply(this, newArgs);\n"
      + "  } finally {\n"
      + "    Array.prototype.splice.call(newArgs, 0, 0, orgRet);\n"
      + "    try {\n"
      + "      myRet = myFuncTail.apply(this, newArgs);\n"
      + "    } catch (ex) {\n"
      + "      Utils.ERROR('Failed executing hooked function: \"' + funcName + '\"@tail: ' + ex);\n"
      + "    }\n"
      + "  }\n"
      + "  return (myRet && myRet.shouldModify) ? myRet.value : orgRet;\n"
      + "})",
      
  _wrapFunctionHeadTail: function(orgFunc, myFuncHead, myFuncTail, funcName)
  {
    let idx = this._addHookFunction(new HookFunction(funcName, orgFunc, myFuncHead, myFuncTail));
    let code = this._wrapFunctionHeadTailCode.replace(/\[gcvc\]/, this._genClosureVarsCode(idx));
    return this._genHookedFunction(idx, code);
  },
  
  _wrapFunction: function(orgFunc, myFuncHead, myFuncTail, funcName)
  {
    if (myFuncHead)
    {
      if (myFuncTail) return this._wrapFunctionHeadTail(orgFunc, myFuncHead, myFuncTail, funcName);
      else return this._wrapFunctionHead(orgFunc, myFuncHead, funcName);
    }
    else
    {
      if (myFuncTail) return this._wrapFunctionTail(orgFunc, myFuncTail, funcName);
      else return orgFunc;
    }
  },
  
  _getOriginalFunc: function(func)
  {
    let idx = func.FireIE_orgFuncIdx;
    let HM = func.FireIE_hookManager;
    if (typeof(idx) == "number" && HM instanceof HookManager)
    {
      let hf = HM._hookFunctions[idx];
      if (hf instanceof HookFunction)
        return hf.orgFunc;
    }
    return null;
  },
  
  _lookupPropertyDescriptor: function(obj, prop)
  {
    while (obj !== undefined && obj !== null)
    {
      let desc = Object.getOwnPropertyDescriptor(obj, prop);
      if (desc !== undefined)
      {
        if (desc.hasOwnProperty("value"))
        {
          // convert this data property into an accessor property
          let value = desc.value;
          desc = {
            get: function() value,
            set: function(val) { value = val },
            enumerable: desc.enumerable,
            configurable: desc.configurable
          };
        }
        return desc;
      }
      obj = Object.getPrototypeOf(obj);
    }
    return null;
  },
  
  // specify hook function return values
  RET: {
    // hook @ head should return without calling orgFunc
    shouldReturn: function(value)
    {
      return { shouldReturn: true, value: value };
    },
    // hook @ head should modify arguments passed to orgFunc
    modifyArguments: function(args)
    {
      return { shouldReturn: false, args: args };
    },
    // hook @ tail should modify the return value
    modifyValue: function(value)
    {
      return { shouldModify: true, value: value };
    }
  },
  
  /** 
   * Add a hook to the beginning of a globally referencable function
   * The safer way: hook code while preserving original function's closures
   * @param orgFuncName - the name that can reference the function to hook in global scope
   * @param myFunc - hook function to call at the beginning of the original function
   * @returns the original function
   */
  hookCodeHead: function(orgFuncName, myFunc)
  {
    try
    {
      let orgFunc = this._evalInScope(orgFuncName);
      if (typeof(orgFunc) == "function")
      {
        let wrappedFunc = this._wrapFunctionHead(orgFunc, myFunc, orgFuncName);
        // execute the assignment
        this._assignInScope(orgFuncName, wrappedFunc);
        // check whether we are successful
        let orgFuncNew = this._evalInScope(orgFuncName);
        if (wrappedFunc !== orgFuncNew)
        {
          this._recycleFunc(wrappedFunc);
          throw "eval assignment failure";
        }

        return orgFunc;
      }
      else throw "not a function";
    }
    catch (ex)
    {
      Utils.ERROR("Failed to hook function " + orgFuncName + "@head: " + ex);
      return null;
    }
  },
  
  /** 
   * Add a hook to the end of a globally referencable function
   * @param orgFuncName - the name that can reference the function to hook in global scope
   * @param myFunc - hook function to call at the end of the original function
   * @returns the original function
   */
  hookCodeTail: function(orgFuncName, myFunc)
  {
    try
    {
      let orgFunc = this._evalInScope(orgFuncName);
      if (typeof(orgFunc) == "function")
      {
        let wrappedFunc = this._wrapFunctionTail(orgFunc, myFunc, orgFuncName);
        // execute the assignment
        this._assignInScope(orgFuncName, wrappedFunc);
        // check whether we are successful
        let orgFuncNew = this._evalInScope(orgFuncName);
        if (wrappedFunc !== orgFuncNew)
        {
          this._recycleFunc(wrappedFunc);
          throw "eval assignment failure";
        }

        return orgFunc;
      }
      else throw "not a function";
    }
    catch (ex)
    {
      Utils.ERROR("Failed to hook function " + orgFuncName + "@tail: " + ex);
      return null;
    }
  },
  
  /** 
   * Add hooks to the beginning & end of a globally referencable function
   * @param orgFuncName - the name that can reference the function to hook in global scope
   * @param myFuncHead - hook function to call at the beginning of the original function
   * @param myFuncTail - hook function to call at the end of the original function
   * @returns the original function
   */
  hookCodeHeadTail: function(orgFuncName, myFuncHead, myFuncTail)
  {
    try
    {
      let orgFunc = this._evalInScope(orgFuncName);
      if (typeof(orgFunc) == "function")
      {
        let wrappedFunc = this._wrapFunctionHeadTail(orgFunc, myFuncHead, myFuncTail, orgFuncName);
        // execute the assignment
        this._assignInScope(orgFuncName, wrappedFunc);
        // check whether we are successful
        let orgFuncNew = this._evalInScope(orgFuncName);
        if (wrappedFunc !== orgFuncNew)
        {
          this._recycleFunc(wrappedFunc);
          throw "eval assignment failure";
        }

        return orgFunc;
      }
      else throw "not a function";
    }
    catch (ex)
    {
      Utils.ERROR("Failed to hook function " + orgFuncName + "@head&tail: " + ex);
      return null;
    }
  },
  
  /** 
   * Unhook a previously hooked function
   * @param orgFuncName - the name that can reference the hooked function in global scope
   * @returns the hooked function, or null if the function is not hooked,
   *          or the hook is broken by some third-party code
   */
  unhookCode: function(orgFuncName)
  {
    try
    {
      let hookedFunc = this._evalInScope(orgFuncName);
      if (typeof(hookedFunc) == "function")
      {
        let orgFunc = this._getOriginalFunc(hookedFunc);
        if (orgFunc)
        {
          // execute the eval that restores original function
          this._assignInScope(orgFuncName, orgFunc);
          // check whether we are successful
          let orgFuncNew = this._evalInScope(orgFuncName);
          if (orgFunc !== orgFuncNew)
            throw "eval assignment failure";
          // successful, reclaim func idx
          this._recycleFunc(hookedFunc);
          return hookedFunc;
        }
      }
      throw "not hooked or broken hook";
    }
    catch (ex)
    {
      Utils.ERROR("Failed to unhook function " + orgFuncName + ": " + ex);
      return null;
    }
  },
  
  /** 
   * Reclaim the hook index, without actually unhooking the function
   * @param hookedFunc - the hooked function
   * @returns true if successful, false otherwise
   */
  reclaimHookIndex: function(hookedFunc)
  {
    try
    {
      if (this._getOriginalFunc(hookedFunc))
      {
        this._recycleFunc(hookedFunc);
        return true;
      }
      throw "not hooked or broken hook";
    }
    catch (ex)
    {
      Utils.ERROR("Failed to reclaim hook index: " + ex);
      return false;
    }
  },

  /**
   * Replace attribute's value V with (myFunc + V) (or (V + myFunc) if insertAtEnd is set to true)
   * @param parentNode - the node whose attribute is to be hooked
   * @param attrName - the name of the attribute to hook
   * @param myFunc - the code string to append
   * @param insertAtEnd - whether insert the code at the beginning or the end
   * @returns original attribute value, or null if the hook failed
   */
  hookAttr: function(parentNode, attrName, myFunc, insertAtEnd)
  {
    try
    {
      if (typeof(parentNode) == "string")
        throw "Hook attr using string name of the node is not supported."
      let attr = parentNode.getAttribute(attrName);
      parentNode.setAttribute(attrName,
        insertAtEnd ? attr + myFunc : myFunc + attr);
      return attr;
    }
    catch (ex)
    {
      Utils.ERROR("Failed to hook attribute " + attrName + ": " + ex);
      return null;
    }
  },
  
  /**
   * The insert-at-end version of hookAttr
   */
  hookAttrTail: function(parentNode, attrName, myFunc)
  {
    return this.hookAttr(parentNode, attrName, myFunc, true);
  },
  
  /**
   * Add some code at the beginning/end of Property's getter and setter
   * This one uses _wrapFunction,
   * which is safe to preserve original getter/setter's closure
   * @param parentNode - the node whose property is to be hooked
   * @param propName - the name of the property to hook
   * @param myGetterBegin - the function to be called at the beginning of the getter
   * @param mySetterBegin - the function to be called at the beginning of the setter
   * @param myGetterEnd - the function to be called at the end of the getter
   * @param mySetterEnd - the function to be called at the end of the setter
   * @returns an object with properties: { getter: original getter, setter: original setter }
   */
  hookProp: function(parentNode, propName, myGetterBegin, mySetterBegin, myGetterEnd, mySetterEnd)
  {
    try
    {
      let desc = this._lookupPropertyDescriptor(parentNode, propName);

      let oGetter = desc.get;
      let oSetter = desc.set;
      if (myGetterBegin || myGetterEnd)
      {
        let newGetter = this._wrapFunction(oGetter, myGetterBegin, myGetterEnd, parentNode.toString() + ".get " + propName);
        desc.get = newGetter;
      }
      if (mySetterBegin || mySetterEnd)
      {
        let newSetter = this._wrapFunction(oSetter, mySetterBegin, mySetterEnd, parentNode.toString() + ".set " + propName);
        desc.set = newSetter;
      }
      
      Object.defineProperty(parentNode, propName, desc);
      
      return { getter: oGetter, setter: oSetter };
    }
    catch (ex)
    {
      Utils.ERROR("Failed to hook property " + propName + ": " + ex);
      return { getter: null, setter: null };
    }
  },
  
  /**
   * Unhook previously hooked property getter and setter
   * @param parentNode - the node whose property is to be unhooked
   * @param propName - the name of the property to unhook
   * @returns an object with properties: { getter: hooked getter, setter: hooked setter }
   */
  unhookProp: function(parentNode, propName)
  {
    let desc = this._lookupPropertyDescriptor(parentNode, propName);
    let myGetter = desc.get;
    let mySetter = desc.set;
    let oGetter = (myGetter && this._getOriginalFunc(myGetter)) || myGetter;
    let oSetter = (mySetter && this._getOriginalFunc(mySetter)) || mySetter;
    desc.get = oGetter;
    desc.set = oSetter;
    Object.defineProperty(parentNode, propName, desc);
    if (oGetter != myGetter) this._recycleFunc(myGetter);
    if (oSetter != mySetter) this._recycleFunc(mySetter);
    return { getter: myGetter, setter: mySetter };
  },
  
  /**
   * Redirects dangerous source-patching hook functions to the original one
   * @param funcName - the globally referencable name of the function used to do source-patching hook
   * @param funcIdx - the index of function parameter in the above function
   * @returns original function that does the source-patching hook
   */
  redirectSourcePatchingHook: function(funcName, funcIdx)
  {
    let orgFunc = null, orgHookFunction = null, HM = this;
    return this.hookCodeHeadTail(funcName, function()
    {
      let func = arguments[funcIdx];
      orgFunc = func;
      let bModify = false;
      // use "while" in case we wrapped several hook levels ourselves
      while (typeof(func) == "function" && typeof(func.FireIE_orgFuncIdx) == "number" &&
             func.FireIE_hookManager instanceof HookManager)
      {
        bModify = true;
        orgHookFunction = func.FireIE_hookManager._hookFunctions[func.FireIE_orgFuncIdx];
        func = orgHookFunction.orgFunc;
      }
      if (bModify)
      {
        Utils.LOG("Redirected source-patching hook for " + orgHookFunction.name);
        arguments[funcIdx] = func;
        return HM.RET.modifyArguments(arguments);
      }
    },
    function(ret)
    {
      if (orgFunc != arguments[funcIdx + 1])
      {
        if (ret) orgHookFunction.orgFunc = ret;
        return HM.RET.modifyValue(orgFunc);
      }
    });
  },
  
  /**
   * Redirects dangerous source-patching hook functions to the original one
   * @param funcName - the globally referencable name of the function used to do source-patching hook
   * @param nameIdx - the index of function name parameter in the above function
   * @param funcIdx - the index of function parameter in the above function
   * @returns original function that does the source-patching hook
   */
  redirectSPHNameFunc: function(funcName, nameIdx, funcIdx)
  {
    let HM = this;
    return this.hookCodeHead(funcName, function()
    {
      let func = arguments[funcIdx];
      let bModify = false;
      let orgHookFunctionIdx = null;
      let orgHookManager = null;
      // use "while" in case we wrapped several hook levels ourselves
      while (typeof(func) == "function" && typeof(func.FireIE_orgFuncIdx) == "number" &&
             func.FireIE_hookManager instanceof HookManager)
      {
        bModify = true;
        orgHookFunctionIdx = func.FireIE_orgFuncIdx;
        orgHookManager = func.FireIE_hookManager;
        func = orgHookManager._hookFunctions[orgHookFunctionIdx].orgFunc;
      }
      if (bModify)
      {
        arguments[nameIdx] = orgHookManager._refName + "._hookFunctions[" + orgHookFunctionIdx + "].orgFunc";
        arguments[funcIdx] = func;
        Utils.LOG("Redirected name-func SPH from " + orgHookManager._hookFunctions[orgHookFunctionIdx].name + " to " + arguments[nameIdx]);
        return HM.RET.modifyArguments(arguments);
      }
    });
  }
};
