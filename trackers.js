const TRACKER_CATEGORIES = {
  'google-analytics.com': 'Analytics',
  'googletagmanager.com': 'Analytics',
  'doubleclick.net': 'Ads',
  'amazon-adsystem.com': 'Ads',
  'adsafeprotected.com': 'Ads',
  'optimizely.com': 'A/B Testing',
  'chartbeat.com': 'Analytics',
  'quantserve.com': 'Analytics',
  'facebook.net': 'Social',
  'facebook.com': 'Social',
  'cdn.jsdelivr.net': 'CDN',
  'cdn.cnn.com': 'CDN',
  'turner.com': 'CDN',
  'permutive.app': 'Analytics',
  'onetag.com': 'Ads',
  'videoplayerhub.com': 'Video'
};

function classifyDomain(domain) {
  for (const key in TRACKER_CATEGORIES) {
    if (domain.includes(key)) {
      return TRACKER_CATEGORIES[key];
    }
  }
  return 'Other';
}