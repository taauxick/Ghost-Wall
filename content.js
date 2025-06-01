function getThirdPartyScripts() {
  const scripts = Array.from(document.scripts);
  const currentDomain = window.location.hostname;
  return scripts
    .map(script => {
      try {
        const src = new URL(script.src);
        if (!src.hostname.includes(currentDomain)) {
          return src.hostname;
        }
      } catch {}
    })
    .filter(Boolean);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'startScan') {
    const trackers = getThirdPartyScripts();
    chrome.runtime.sendMessage({ action: 'scanResult', data: trackers });
  }
});