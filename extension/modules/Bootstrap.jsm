/*
 * This Source Code is subject to the terms of the Mozilla Public License
 * version 2.0 (the "License"). You can obtain a copy of the License at
 * http://mozilla.org/MPL/2.0/.
 */

/**
 * @fileOverview Bootstrap module, will initialize Adblock Plus when loaded
 */

var EXPORTED_SYMBOLS = ["Bootstrap"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

let chromeSupported = true;
let ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
let publicURL = ioService.newURI("resource://fireie/Public.jsm", null, null);
let baseURL = publicURL.clone().QueryInterface(Ci.nsIURL);
baseURL.fileName = "";

Cu.import(baseURL.spec + "Utils.jsm");

if (publicURL instanceof Ci.nsIMutable)
	publicURL.mutable = false;
if (baseURL instanceof Ci.nsIMutable)
	baseURL.mutable = false;
		
const cidPublic = Components.ID("{205D5CF8-A382-4D5E-BE4C-86012C7161FF}");
const contractIDPublic = "@fireie.org/fireie/public;1";

const cidPrivate = Components.ID("{B264B58F-2948-4E8A-9824-45AA6C19697E}");
const contractIDPrivate = "@fireie.org/fireie/private;1";

let factoryPublic = {
	createInstance: function(outer, iid)
	{
		if (outer)
			throw Cr.NS_ERROR_NO_AGGREGATION;
		return publicURL.QueryInterface(iid);
	}
};

let factoryPrivate = {
	createInstance: function(outer, iid)
	{
		if (outer)
			throw Cr.NS_ERROR_NO_AGGREGATION;
		return baseURL.QueryInterface(iid);
	}
};

let defaultModules = [
	baseURL.spec + "Prefs.jsm",
	baseURL.spec + "FilterListener.jsm",
	baseURL.spec + "ContentPolicy.jsm",
	baseURL.spec + "Synchronizer.jsm"
];

let loadedModules = {__proto__: null};

let initialized = false;

/**
 * Allows starting up and shutting down Adblock Plus functions.
 * @class
 */
var Bootstrap =
{
	/**
	 * Initializes add-on, loads and initializes all modules.
	 */
	startup: function()
	{
		if (initialized)
			return;
		initialized = true;

		// Register component to allow retrieving private and public URL
		
		let registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
		registrar.registerFactory(cidPublic, "Fire-IE public module URL", contractIDPublic, factoryPublic);
		registrar.registerFactory(cidPrivate, "Fire-IE private module URL", contractIDPrivate, factoryPrivate);
	
		// Load and initialize modules
	
		for each (let url in defaultModules)
			Bootstrap.loadModule(url);

		let categoryManager = Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager);
		let enumerator = categoryManager.enumerateCategory("fireie-module-location");
		while (enumerator.hasMoreElements())
		{
			let uri = enumerator.getNext().QueryInterface(Ci.nsISupportsCString).data;
			Bootstrap.loadModule(uri);
		}

		let observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
		observerService.addObserver(BootstrapPrivate, "xpcom-category-entry-added", true);
		observerService.addObserver(BootstrapPrivate, "xpcom-category-entry-removed", true);
	
	},

	/**
	 * Shuts down add-on.
	 */
	shutdown: function()
	{
		if (!initialized)
			return;

		// Shut down modules
		for (let url in loadedModules)
			Bootstrap.shutdownModule(url);
	},

	/**
	 * Loads and initializes a module.
	 */
	loadModule: function(/**String*/ url)
	{
		if (url in loadedModules)
			return;

		let module = {};
		try
		{
			Cu.import(url, module);
		}
		catch (e)
		{
			Cu.reportError("Fire-IE: Failed to load module " + url + ": " + e);
			return;
		}

		for each (let obj in module)
		{
			if ("startup" in obj)
			{
				try
				{
					obj.startup();
					loadedModules[url] = obj;
				}
				catch (e)
				{
					Cu.reportError("Fire-IE: Calling method startup() for module " + url + " failed: " + e);
				}
				return;
			}
		}

		Cu.reportError("Fire-IE: No exported object with startup() method found for module " + url);
	},

	/**
	 * Shuts down a module.
	 */
	shutdownModule: function(/**String*/ url)
	{
		if (!(url in loadedModules))
			return;

		let obj = loadedModules[url];
		if ("shutdown" in obj)
		{
			try
			{
				obj.shutdown();
			}
			catch (e)
			{
				Cu.reportError("Fire-IE: Calling method shutdown() for module " + url + " failed: " + e);
			}
			return;
		}
	}
};

/**
 * Observer called on modules category changes.
 * @class
 */
var BootstrapPrivate =
{
	QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference]),

	observe: function(subject, topic, data)
	{
		if (data != "fireie-module-location")
			return;

		switch (topic)
		{
			case "xpcom-category-entry-added":
				Bootstrap.loadModule(subject.QueryInterface(Ci.nsISupportsCString).data);
				break;
			case "xpcom-category-entry-removed":
				Bootstrap.unloadModule(subject.QueryInterface(Ci.nsISupportsCString).data, true);
				break;
		}
	}
};
