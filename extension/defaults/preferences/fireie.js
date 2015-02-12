// OOPP related
pref("dom.ipc.plugins.enabled.npfireie32.dll", true);
pref("dom.ipc.plugins.enabled.npfireie64.dll", true);

// Miscellaneous
pref("extensions.fireie.currentVersion", "0.0.9");
pref("extensions.fireie.subscriptions_defaultAdded", false);
pref("extensions.fireie.subscriptions_autoupdate", true);
pref("extensions.fireie.subscriptions_listurl", "http://fireie.org/sites/rules/subscriptions.xml");
pref("extensions.fireie.subscriptions_fallbackurl", "https://fireie.org/getSubscription?version=%VERSION%&url=%SUBSCRIPTION%&downloadURL=%URL%&error=%ERROR%&channelStatus=%CHANNELSTATUS%&responseStatus=%RESPONSESTATUS%");
pref("extensions.fireie.subscriptions_fallbackerrors", 5);
pref("extensions.fireie.data_directory", "fireie");
pref("extensions.fireie.contentPolicy_ignoredSchemes", "http https about irc moz-safe-about news resource snews x-jsd addbook cid imap mailbox nntp pop data javascript moz-icon telnet");
pref("extensions.fireie.documentation_link", "http://fireie.org/%LANG%/%LINK%");
pref("extensions.fireie.doc_link_languages", "{ \"default\": \"en\", \"zh-CN\": \"zh-CN\", \"zh-TW\": \"zh-CN\", \"en-US\": \"en\" }");
pref("extensions.fireie.esr_user_agent", "Mozilla/5.0 (Windows NT 6.1; rv:10.0) Gecko/20100101 Firefox/10.0");
pref("extensions.fireie.savestats", true);
pref("extensions.fireie.logCookies", false);
pref("extensions.fireie.clearIETracks", true);
pref("extensions.fireie.OOPP_crashCheckIntervalMillis", 5000);
pref("extensions.fireie.OOPP_remoteSetCookie", true);

// General
pref("extensions.fireie.handleUrlBar", false);
pref("extensions.fireie.autoswitch_enabled", true);
pref("extensions.fireie.autoSwitchOnExceptionalRuleHit", "fx"); // "no"/"fx"
pref("extensions.fireie.autoSwitchOnRuleMiss", "no"); // "no"/"fx"/"ie"
pref("extensions.fireie.shortcutEnabled", true);
pref("extensions.fireie.shortcut_modifiers", "alt");
pref("extensions.fireie.shortcut_key", "C");
pref("extensions.fireie.privatebrowsingwarning", true);

// UI
pref("extensions.fireie.showUrlBarLabel", true);
pref("extensions.fireie.hideUrlBarButton", false);
pref("extensions.fireie.showTooltipText", true);
pref("extensions.fireie.showStatusText", true);
pref("extensions.fireie.showSiteFavicon", true);
pref("extensions.fireie.fxLabel", "");
pref("extensions.fireie.ieLabel", "");
pref("extensions.fireie.showUrlBarButtonOnlyForIE", false);
pref("extensions.fireie.showContextMenuItems", true);

// Integration
pref("extensions.fireie.forceMGSupport", false);
pref("extensions.fireie.abpSupportEnabled", true);
pref("extensions.fireie.cookieSyncEnabled", true);
pref("extensions.fireie.privateCookieSyncEnabled", false);
pref("extensions.fireie.abpAdditionalFiltersEnabled", true);
pref("extensions.fireie.historyEnabled", true);
pref("extensions.fireie.historyPrefix", "[Fire IE] ");
pref("extensions.fireie.disableFolderRedirection", false);

// IE Options
pref("extensions.fireie.compatMode", "ie7mode");
pref("extensions.fireie.gpuRendering", false);

// Lightweight Theme
pref("extensions.fireie.currentTheme", "");
pref("extensions.fireie.allowedThemeHosts", "[\"fireie.org\"]");

// History & Privacy control
pref("privacy.cpd.extensions-fireie-cache", true);
pref("privacy.cpd.extensions-fireie-cookies", true);
pref("privacy.clearOnShutdown.extensions-fireie-cache", true);
pref("privacy.clearOnShutdown.extensions-fireie-cookies", true);
