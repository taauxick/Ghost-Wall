chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Blocking toggle (global)
  if (request.action === 'toggleBlocking') {
    if (request.enabled) {
      chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: ['block-trackers'] });
    } else {
      chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: ['block-trackers'] });
    }
    sendResponse({ success: true });
  }

  // Per-site blocking
  if (request.action === 'toggleBlockingForSite') {
    chrome.storage.local.get({ siteBlocking: {} }, (data) => {
      data.siteBlocking[request.domain] = request.enabled;
      chrome.storage.local.set({ siteBlocking: data.siteBlocking });
      sendResponse({ success: true });
    });
    return true;
  }

  // Whitelist/Blacklist
  if (request.action === 'whitelistDomain' || request.action === 'blacklistDomain') {
    chrome.storage.local.get({ userRules: { whitelist: [], blacklist: [] } }, (data) => {
      const { whitelist, blacklist } = data.userRules;
      if (request.action === 'whitelistDomain') {
        if (!whitelist.includes(request.domain)) whitelist.push(request.domain);
        const idx = blacklist.indexOf(request.domain);
        if (idx !== -1) blacklist.splice(idx, 1);
      } else {
        if (!blacklist.includes(request.domain)) blacklist.push(request.domain);
        const idx = whitelist.indexOf(request.domain);
        if (idx !== -1) whitelist.splice(idx, 1);
      }
      chrome.storage.local.set({ userRules: { whitelist, blacklist } });
      sendResponse({ success: true });
    });
    return true;
  }

  // Custom user rule add
  if (request.action === 'addCustomRule') {
    chrome.storage.local.get({ customRules: [] }, (data) => {
      if (!data.customRules.includes(request.domain)) {
        data.customRules.push(request.domain);
        chrome.storage.local.set({ customRules: data.customRules });
      }
      sendResponse({ success: true });
    });
    return true;
  }

  // Site-specific settings fetch
  if (request.action === 'getSiteSettings') {
    chrome.storage.local.get(['siteBlocking', 'userRules', 'customRules'], (data) => {
      sendResponse({
        siteBlocking: data.siteBlocking || {},
        userRules: data.userRules || { whitelist: [], blacklist: [] },
        customRules: data.customRules || []
      });
    });
    return true;
  }

  // Detection
  if (request.action === 'scanPage') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0].id;
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      sendResponse({ success: true });
    });
    return true;
  }
});