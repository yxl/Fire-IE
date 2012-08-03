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
    if (idx == this._hookFunctions.length - 1)
      this._hookFunctions.pop();
    else
    {
      this._hookFunctions[idx] = null;
      this._recycledIndices.push(idx);
    }
  },
  
  _closureVarsCode: "  let grn = [grn];\n"
                  + "  let hf = grn._hookFunctions[[idx]];\n"
                  + "  let Utils = grn.utils;\n"
                  + "  let funcName = hf.name;\n"
                  + "  let orgFunc = hf.orgFunc;\n"
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
      + "  let newArguments = (ret && ret.arguments) || arguments;\n"
      + "  return orgFunc.apply(this, newArguments);\n"
      + "})",

  _wrapFunctionHead: function(orgFunc, myFunc, funcName)
  {
    let idx = this._addHookFunction(new HookFunction(funcName, orgFunc, myFunc, null));
    let code = this._wrapFunctionHeadCode.replace(/\[gcvc\]/, this._genClosureVarsCode(idx));
    with (this._scope) // in order to let the reference [grn] work
    {
      let func = eval(code);
      func.FireIE_orgFuncIdx = idx;
      return func;
    }
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
    with (this._scope) // in order to let the reference [grn] work
    {
      let func = eval(code);
      func.FireIE_orgFuncIdx = idx;
      return func;
    }
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
      + "  let newArguments = (ret && ret.arguments) || arguments;\n"
      + "  let orgRet = null, myRet = null;\n"
      + "  try {\n"
      + "    orgRet = orgFunc.apply(this, newArguments);\n"
      + "  } finally {\n"
      + "    Array.prototype.splice.call(newArguments, 0, 0, orgRet);\n"
      + "    try {\n"
      + "      myRet = myFuncTail.apply(this, newArguments);\n"
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
    let func;
    with (this._scope)
    {
      let func = eval(code);
      func.FireIE_orgFuncIdx = idx;
      return func;
    }
  },
  
  _getOriginalFunc: function(func)
  {
    let idx = func.FireIE_orgFuncIdx;
    if (typeof(idx) == "number")
    {
      let hf = this._hookFunctions[idx];
      if (hf instanceof HookFunction)
        return hf.orgFunc;
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
    modifyArguments: function(arguments)
    {
      return { shouldReturn: false, arguments: arguments };
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
   */
  hookCodeHead: function(orgFuncName, myFunc)
  {
    try
    {
      let orgFunc;
      with (this._scope) { orgFunc = eval(orgFuncName); }
      if (typeof(orgFunc) == "function")
      {
        let wrappedFunc = this._wrapFunctionHead(orgFunc, myFunc, orgFuncName);
        // execute the assignment
        eval("with (this._scope) { " + orgFuncName + "=wrappedFunc; }");
        let orgFuncNew;
        // check whether we are successful
        with (this._scope) { orgFuncNew = eval(orgFuncName); }
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
    }
  },
  
  /** 
   * Add a hook to the end of a globally referencable function
   * @param orgFuncName - the name that can reference the function to hook in global scope
   * @param myFunc - hook function to call at the end of the original function
   */
  hookCodeTail: function(orgFuncName, myFunc)
  {
    try
    {
      let orgFunc;
      with (this._scope) { orgFunc = eval(orgFuncName); }
      if (typeof(orgFunc) == "function")
      {
        let wrappedFunc = this._wrapFunctionTail(orgFunc, myFunc, orgFuncName);
        // execute the assignment
        eval("with (this._scope) { " + orgFuncName + "=wrappedFunc; }");
        let orgFuncNew;
        // check whether we are successful
        with (this._scope) { orgFuncNew = eval(orgFuncName); }
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
    }
  },
  
  /** 
   * Add hooks to the beginning & end of a globally referencable function
   * @param orgFuncName - the name that can reference the function to hook in global scope
   * @param myFuncHead - hook function to call at the beginning of the original function
   * @param myFuncTail - hook function to call at the end of the original function
   */
  hookCodeHeadTail: function(orgFuncName, myFuncHead, myFuncTail)
  {
    try
    {
      let orgFunc;
      with (this._scope) { orgFunc = eval(orgFuncName); }
      if (typeof(orgFunc) == "function")
      {
        let wrappedFunc = this._wrapFunctionHeadTail(orgFunc, myFuncHead, myFuncTail, orgFuncName);
        // execute the assignment
        eval("with (this._scope) { " + orgFuncName + "=wrappedFunc; }");
        let orgFuncNew;
        // check whether we are successful
        with (this._scope) { orgFuncNew = eval(orgFuncName); }
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
    }
  },
  
  /** 
   * Unhook a previously hooked function
   * @param orgFuncName - the name that can reference the hooked function in global scope
   */
  unhookCode: function(orgFuncName)
  {
    try
    {
      let hookedFunc;
      with (this._scope) { hookedFunc = eval(orgFuncName); }
      if (typeof(hookedFunc) == "function")
      {
        let orgFunc = this._getOriginalFunc(hookedFunc);
        if (orgFunc)
        {
          // execute the eval that restores original function
          eval("with (this._scope) { " + orgFuncName + " = orgFunc; }");
          // check whether we are successful
          let orgFuncNew;
          with (this._scope) { orgFuncNew = eval(orgFuncName); }
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
    }
  },

  /**
   * Replace attribute's value V with (myFunc + V) (or (V + myFunc) if insertAtEnd is set to true)
   * @param parentNode - the node whose attribute is to be hooked
   * @param attrName - the name of the attribute to hook
   * @param myFunc - the code string to append
   * @param insertAtEnd - whether insert the code at the beginning or the end
   */
  hookAttr: function(parentNode, attrName, myFunc, insertAtEnd)
  {
    if (typeof(parentNode) == "string")
      throw "Hook attr using string name of the node is not supported."
    try
    {
      let attr = parentNode.getAttribute(attrName);
      parentNode.setAttribute(attrName,
        insertAtEnd ? attr + myFunc : myFunc + attr);
      return attr;
    }
    catch (ex)
    {
      Utils.ERROR("Failed to hook attribute " + attrName + ": " + ex);
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
   * Add some code at the beginning of Property's getter and setter
   * This one uses wrapFunctionHead,
   * which is safe to preserve original getter/setter's closure
   * @param parentNode - the node whose property is to be hooked
   * @param propName - the name of the property to hook
   * @param myGetter - the function to be called at the beginning of the getter
   * @param mySetter - the function to be called at the beginning of the setter
   */
  hookProp: function(parentNode, propName, myGetter, mySetter)
  {
    // must set both getter and setter or the other will be missing
    let oGetter = parentNode.__lookupGetter__(propName);
    let oSetter = parentNode.__lookupSetter__(propName);
    if (oGetter && myGetter)
    {
      let newGetter = this._wrapFunctionHead(oGetter, myGetter, parentNode.toString() + ".get " + propName);
      try
      {
        parentNode.__defineGetter__(propName, newGetter);
      }
      catch (ex)
      {
        Utils.ERROR("Failed to hook property Getter " + propName + ": " + ex);
      }
    }
    else if (oGetter)
    {
      parentNode.__defineGetter__(propName, oGetter);
    }
    if (oSetter && mySetter)
    {
      let newSetter = this._wrapFunctionHead(oSetter, mySetter, parentNode.toString() + ".set " + propName);
      try
      {
        parentNode.__defineSetter__(propName, newSetter);
      }
      catch (ex)
      {
        Utils.ERROR("Failed to hook property Setter " + propName + ": " + ex);
      }
    }
    else if (oSetter)
    {
      parentNode.__defineSetter__(propName, oSetter);
    }
    return { getter: oGetter, setter: oSetter };
  },
  
  /**
   * Unhook previously hooked property getter and setter
   * @param parentNode - the node whose property is to be unhooked
   * @param propName - the name of the property to unhook
   */
  unhookProp: function(parentNode, propName)
  {
    // must set both getter and setter or the other will be missing
    let myGetter = parentNode.__lookupGetter__(propName);
    let mySetter = parentNode.__lookupSetter__(propName);
    let oGetter = (myGetter && this._getOriginalFunc(myGetter)) || myGetter;
    let oSetter = (mySetter && this._getOriginalFunc(mySetter)) || mySetter;
    if (oGetter) parentNode.__defineGetter__(propName, oGetter);
    if (oSetter) parentNode.__defineSetter__(propName, oSetter);
    if (oGetter != myGetter) this._recycleFunc(myGetter);
    if (oSetter != mySetter) this._recycleFunc(mySetter);
    return { getter: myGetter, setter: mySetter };
  },
  
  /**
   * Redirects dangerous source-patching hook functions to the original one
   * @param funcName - the globally referencable name of the function used to do source-patching hook
   * @param funcIdx - the index of function parameter in the above function
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
      while (typeof(func) == "function" && typeof(func.FireIE_orgFuncIdx) == "number")
      {
        bModify = true;
        orgHookFunction = HM._hookFunctions[func.FireIE_orgFuncIdx];
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
   */
  redirectSPHNameFunc: function(funcName, nameIdx, funcIdx)
  {
    let HM = this;
    return this.hookCodeHead(funcName, function()
    {
      let func = arguments[funcIdx];
      let bModify = false;
      let orgHookFunctionIdx = null;
      // use "while" in case we wrapped several hook levels ourselves
      while (typeof(func) == "function" && typeof(func.FireIE_orgFuncIdx) == "number")
      {
        bModify = true;
        orgHookFunctionIdx = func.FireIE_orgFuncIdx;
        func = HM._hookFunctions[orgHookFunctionIdx].orgFunc;
      }
      if (bModify)
      {
        arguments[nameIdx] = HM._refName + "._hookFunctions[" + orgHookFunctionIdx + "].orgFunc";
        arguments[funcIdx] = func;
        Utils.LOG("Redirected name-func SPH from " + HM._hookFunctions[orgHookFunctionIdx].name + " to " + arguments[nameIdx]);
        return HM.RET.modifyArguments(arguments);
      }
    });
  }
};
