function classifyDomain(domain) {
  domain = domain.toLowerCase();
  if (domain.match(/doubleclick|adservice|adsystem|2o7\.net|adnxs|googletag|amazon-adsystem|taboola|outbrain|scorecardresearch|zedo|criteo|rubiconproject|pubmatic|openx|casalemedia|advertising\.com/)) return 'Ads';
  if (domain.match(/facebook|twitter|linkedin|instagram|pinterest|snapchat|tiktok|reddit/)) return 'Social';
  if (domain.match(/google-analytics|mixpanel|segment|matomo|bitmovin|hotjar|newrelic|appdynamics|clicky|statcounter|licensing\.bitmovin\.com/)) return 'Analytics';
  if (domain.match(/cdn|cloudfront|akamai|fastly|stackpathcdn|jsdelivr/)) return 'CDN';
  if (domain.match(/google|gstatic|accounts\.google/)) return 'Google';
  if (domain.match(/amazonaws|azureedge|cloudflare/)) return 'Cloud';
  return 'Other';
}

function getDangerLevel(category) {
  if (category === 'Ads' || category === 'Social') return 'badge-danger';   // Red
  if (category === 'Analytics') return 'badge-mid';                         // Yellow
  if (category === 'CDN' || category === 'Google') return 'badge-safe';     // Green
  return 'badge-other';                                                     // Grey
}

function getStatus(domain, userRules) {
  if (userRules && userRules.blacklist && userRules.blacklist.includes(domain)) return 'Blocked';
  if (userRules && userRules.whitelist && userRules.whitelist.includes(domain)) return 'Allowed';
  return 'Allowed';
}

document.addEventListener('DOMContentLoaded', () => {
  const status = document.getElementById('status');
  const results = document.getElementById('results');
  const summary = document.getElementById('summary');
  const blockToggle = document.getElementById('blockToggle');
  const siteSettings = document.getElementById('siteSettings');
  const customRuleInput = document.getElementById('customRuleInput');
  const addCustomRuleBtn = document.getElementById('addCustomRuleBtn');
  const disableForSiteBtn = document.getElementById('disableForSiteBtn');

  // Blocking toggle (global)
  chrome.storage.local.get({ blockingEnabled: true }, (data) => {
    blockToggle.checked = data.blockingEnabled;
  });
  blockToggle.addEventListener('change', () => {
    chrome.storage.local.set({ blockingEnabled: blockToggle.checked }, () => {
      chrome.runtime.sendMessage({ action: 'toggleBlocking', enabled: blockToggle.checked }, () => {
        // Refresh the current tab after toggling
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          chrome.tabs.reload(tabs[0].id);
        });
      });
    });
  });

  // Per-site blocking toggle
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = new URL(tabs[0].url);
    const domain = url.hostname;
    chrome.storage.local.get({ siteBlocking: {} }, (data) => {
      const siteBlocking = data.siteBlocking;
      const enabled = siteBlocking[domain] !== false; // default true
      blockToggle.checked = enabled;
      blockToggle.addEventListener('change', () => {
        siteBlocking[domain] = blockToggle.checked;
        chrome.storage.local.set({ siteBlocking }, () => {
          chrome.runtime.sendMessage({ action: 'toggleBlockingForSite', domain, enabled: blockToggle.checked });
        });
      });
    });
  });

  // Site-specific settings display
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = new URL(tabs[0].url);
    const domain = url.hostname;
    chrome.runtime.sendMessage({ action: 'getSiteSettings' }, (data) => {
      renderSiteSettings(data, domain);
    });
  });

  // Custom rule add (ab yeh direct blacklist me add karega)
  addCustomRuleBtn.addEventListener('click', () => {
    const domain = customRuleInput.value.trim();
    if (domain) {
      chrome.storage.local.get({ userRules: { whitelist: [], blacklist: [] } }, (data) => {
        if (!data.userRules.blacklist.includes(domain)) {
          data.userRules.blacklist.push(domain);
          chrome.storage.local.set({ userRules: data.userRules }, () => {
            customRuleInput.value = '';
            alert('Domain blacklisted!');
            renderLists(); // Blacklist UI update
            // Site settings bhi update ho
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              const url = new URL(tabs[0].url);
              const domain = url.hostname;
              chrome.storage.local.get({ userRules: { whitelist: [], blacklist: [] } }, (data) => {
                renderSiteSettings(data, domain);
              });
            });
          });
        } else {
          alert('Domain already blacklisted!');
        }
      });
    }
  });

  status.textContent = 'Scanning...';

  chrome.runtime.sendMessage({ action: 'scanPage' }, () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'startScan' });
    });
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'scanResult') {
      status.textContent = '';
      results.innerHTML = '';
      summary.style.display = 'none';

      // Deduplicate domains
      const uniqueDomains = [...new Set(msg.data)];

      if (uniqueDomains.length === 0) {
        results.textContent = 'No third-party scripts found!';
      } else {
        // Count categories
        const categoryCount = {};
        uniqueDomains.forEach(domain => {
          let category = 'Other';
          if (typeof classifyDomain === 'function') {
            category = classifyDomain(domain);
          }
          categoryCount[category] = (categoryCount[category] || 0) + 1;
        });

        // Show summary
        const total = uniqueDomains.length;
        const cats = Object.entries(categoryCount)
          .map(([cat, count]) => `<b>${cat}</b>: ${count}`)
          .join(' &middot; ');
        summary.innerHTML = `Detected <b>${total}</b> third-party scripts<br>${cats}`;
        summary.style.display = 'block';

        // Show details with whitelist/blacklist buttons
        uniqueDomains.forEach(domain => {
          const div = document.createElement('div');
          div.className = 'domain';
          let category = 'Other';
          if (typeof classifyDomain === 'function') {
            category = classifyDomain(domain);
          }
          const danger = getDangerLevel(category);
          div.innerHTML = `
            ${domain}
            <span class="badge ${danger}">${category}</span>
            <button class="whitelist-btn" data-domain="${domain}">Whitelist</button>
            <button class="blacklist-btn" data-domain="${domain}">Blacklist</button>
          `;
          results.appendChild(div);
        });

        // Add event listeners for whitelist/blacklist
        results.querySelectorAll('.whitelist-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const domain = e.target.dataset.domain;
            chrome.runtime.sendMessage({ action: 'whitelistDomain', domain }, () => {
              alert(domain + ' whitelisted!');
            });
          });
        });
        results.querySelectorAll('.blacklist-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const domain = e.target.dataset.domain;
            chrome.runtime.sendMessage({ action: 'blacklistDomain', domain }, () => {
              alert(domain + ' blacklisted!');
            });
          });
        });
      }
    }
  });

  // Manage Whitelist/Blacklist UI
  const manageListsBtn = document.getElementById('manageListsBtn');
  const manageListsSection = document.getElementById('manageListsSection');
  const whitelistList = document.getElementById('whitelistList');
  const blacklistList = document.getElementById('blacklistList');
  const closeManageLists = document.getElementById('closeManageLists');

  function renderSiteSettings(data, domain) {
    let html = `<div style="margin-bottom:6px;"><span style="font-weight:500;">Site:</span> <span style="color:#2d7dd2">${domain}</span></div>`;
    html += `<div><span style="font-weight:500;">Whitelisted:</span> ${
      data.userRules.whitelist.length
        ? data.userRules.whitelist.map(d => `<span class="badge badge-safe">${d}</span>`).join(' ')
        : '<span style="color:#888;">None</span>'
    }</div>`;
    html += `<div><span style="font-weight:500;">Blacklisted:</span> ${
      data.userRules.blacklist.length
        ? data.userRules.blacklist.map(d => `<span class="badge badge-danger">${d}</span>`).join(' ')
        : '<span style="color:#888;">None</span>'
    }</div>`;
    // Midlist (optional)
    if (data.userRules.midlist && data.userRules.midlist.length) {
      html += `<div><span style="font-weight:500;">Mid:</span> ${
        data.userRules.midlist.map(d => `<span class="badge badge-mid">${d}</span>`).join(' ')
      }</div>`;
    }
    document.getElementById('siteSettings').innerHTML = html;
  }

  function renderLists() {
    chrome.storage.local.get({ userRules: { whitelist: [], blacklist: [] } }, (data) => {
      // Whitelist
      whitelistList.innerHTML = '';
      if (data.userRules.whitelist.length === 0) {
        whitelistList.innerHTML = '<span style="color:#888;">None</span>';
      } else {
        data.userRules.whitelist.forEach(domain => {
          const row = document.createElement('div');
          row.className = 'domain-row';
          row.innerHTML = `
            <span class="badge badge-safe">${domain}</span>
            <button class="remove-btn" data-domain="${domain}" data-list="whitelist" title="Remove from whitelist">✕</button>
          `;
          whitelistList.appendChild(row);
        });
      }
      // Blacklist
      blacklistList.innerHTML = '';
      if (data.userRules.blacklist.length === 0) {
        blacklistList.innerHTML = '<span style="color:#888;">None</span>';
      } else {
        data.userRules.blacklist.forEach(domain => {
          const row = document.createElement('div');
          row.className = 'domain-row';
          row.innerHTML = `
            <span class="badge badge-danger">${domain}</span>
            <button class="remove-btn" data-domain="${domain}" data-list="blacklist" title="Remove from blacklist">✕</button>
          `;
          blacklistList.appendChild(row);
        });
      }

      // Remove button logic
      manageListsSection.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const domain = btn.dataset.domain;
          const list = btn.dataset.list;
          chrome.storage.local.get({ userRules: { whitelist: [], blacklist: [] } }, (data) => {
            const arr = data.userRules[list];
            const idx = arr.indexOf(domain);
            if (idx !== -1) arr.splice(idx, 1);
            chrome.storage.local.set({ userRules: data.userRules }, () => {
              renderLists();
              // Site settings bhi update ho
              chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const url = new URL(tabs[0].url);
                const domain = url.hostname;
                chrome.storage.local.get({ userRules: { whitelist: [], blacklist: [] } }, (data) => {
                  renderSiteSettings(data, domain);
                });
              });
            });
          });
        });
      });
    });
  }

  if (manageListsBtn && manageListsSection) {
    manageListsBtn.addEventListener('click', () => {
      manageListsSection.style.display = 'block';
      renderLists();
    });
  }
  if (closeManageLists) {
    closeManageLists.addEventListener('click', () => {
      manageListsSection.style.display = 'none';
    });
  }

  function renderResults(trackers) {
    const resultsBody = document.getElementById('resultsBody');
    resultsBody.innerHTML = '';
    if (!trackers.length) {
      resultsBody.innerHTML = `<tr><td colspan="3" style="color:#888;text-align:center;">No third-party scripts found!</td></tr>`;
      return;
    }
    trackers.forEach(tracker => {
      const badgeClass = getDangerLevel(tracker.category); // <-- category based!
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${tracker.domain}</td>
        <td><span class="badge ${badgeClass}">${tracker.category}</span></td>
        <td>${tracker.status || ''}</td>
      `;
      resultsBody.appendChild(tr);
    });
  }

  // Example usage after scan:
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'scanResult') {
      // Deduplicate domains
      const uniqueDomains = [...new Set(msg.data)];
      // Suppose you classify trackers here:
      const classified = uniqueDomains.map(domain => ({
        domain,
        category: classifyDomain(domain),
        status: (['Ads', 'Social'].includes(classifyDomain(domain))) ? 'Blocked' : 'Allowed'
      }));
      renderResults(classified);
      document.getElementById('status').textContent = '';
    }
  });

  // Theme toggle logic
  const themeToggle = document.getElementById('themeToggle');
  const sunIcon = document.getElementById('sunIcon');
  const moonIcon = document.getElementById('moonIcon');

  function updateThemeIcons(isDark) {
    if (isDark) {
      sunIcon.style.opacity = '0.4';
      moonIcon.style.opacity = '1';
    } else {
      sunIcon.style.opacity = '1';
      moonIcon.style.opacity = '0.4';
    }
  }

  // Load theme from storage and set icons
  chrome.storage.local.get({ darkTheme: false }, (data) => {
    if (data.darkTheme) {
      document.body.classList.add('dark');
      themeToggle.checked = true;
    }
    updateThemeIcons(data.darkTheme);
  });

  themeToggle.addEventListener('change', () => {
    if (themeToggle.checked) {
      document.body.classList.add('dark');
      chrome.storage.local.set({ darkTheme: true });
    } else {
      document.body.classList.remove('dark');
      chrome.storage.local.set({ darkTheme: false });
    }
    updateThemeIcons(themeToggle.checked);
  });

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = new URL(tabs[0].url);
    const domain = url.hostname;
    disableForSiteBtn.addEventListener('click', () => {
      chrome.storage.local.get({ siteBlocking: {} }, (data) => {
        const siteBlocking = data.siteBlocking;
        siteBlocking[domain] = false;
        chrome.storage.local.set({ siteBlocking }, () => {
          alert('Blocking disabled for this site!');
          location.reload();
        });
      });
    });
  });
});

// Upar site settings render karne wala code ek function me daal dein:
function renderSiteSettings(data, domain) {
  let html = `<div style="margin-bottom:6px;"><span style="font-weight:500;">Site:</span> <span style="color:#2d7dd2">${domain}</span></div>`;
  html += `<div><span style="font-weight:500;">Whitelisted:</span> ${
    data.userRules.whitelist.length
      ? data.userRules.whitelist.map(d => `<span class="badge badge-safe">${d}</span>`).join(' ')
      : '<span style="color:#888;">None</span>'
  }</div>`;
  html += `<div><span style="font-weight:500;">Blacklisted:</span> ${
    data.userRules.blacklist.length
      ? data.userRules.blacklist.map(d => `<span class="badge badge-danger">${d}</span>`).join(' ')
      : '<span style="color:#888;">None</span>'
  }</div>`;
  // Midlist (optional)
  if (data.userRules.midlist && data.userRules.midlist.length) {
    html += `<div><span style="font-weight:500;">Mid:</span> ${
      data.userRules.midlist.map(d => `<span class="badge badge-mid">${d}</span>`).join(' ')
    }</div>`;
  }
  document.getElementById('siteSettings').innerHTML = html;
}

// Aur jahan pehle aapka site settings render ho raha tha, wahan is function ko call karein:
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = new URL(tabs[0].url);
  const domain = url.hostname;
  chrome.storage.local.get({ userRules: { whitelist: [], blacklist: [] } }, (data) => {
    renderSiteSettings(data, domain);
  });
});

// content.js
const scripts = Array.from(document.scripts)
  .map(s => s.src)
  .filter(src => src && !src.startsWith(window.location.origin));
chrome.runtime.sendMessage({ action: 'scanResult', data: scripts });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'scanResult') {
    // Deduplicate domains
    const uniqueDomains = [...new Set(msg.data)];
    const resultsBody = document.getElementById('resultsBody');
    resultsBody.innerHTML = '';
    uniqueDomains.forEach(domain => {
      const category = classifyDomain(domain);
      const badgeClass = getDangerLevel(category);
      const status = getStatus(domain, userRules); // userRules ko pehle fetch kar lo
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><span class="badge ${badgeClass}">${category}</span></td>
        <td>${domain}</td>
        <td>${status}</td>
      `;
      resultsBody.appendChild(row);
    });
  }
});