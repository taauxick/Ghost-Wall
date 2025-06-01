const fs = require('fs');

// Import tracker domains from trackers.js
const { TRACKER_CATEGORIES } = require('./trackers.js');

const resourceTypes = ["script", "xmlhttprequest", "sub_frame"];
let id = 1;
const rules = [];

for (const domain in TRACKER_CATEGORIES) {
  rules.push({
    id: id++,
    priority: 1,
    action: { type: "block" },
    condition: {
      urlFilter: domain,
      resourceTypes
    }
  });
}

fs.writeFileSync('rules.json', JSON.stringify(rules, null, 2));
console.log('rules.json generated with', rules.length, 'rules.');