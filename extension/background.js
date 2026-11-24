/* ═══════════════════════════════════════════
   ECOAUDIT — Background Service Worker (MV3)
   Handles: auth cache, badge updates, messaging,
   audit API calls, purchase storage, history,
   and notification dispatching.
═══════════════════════════════════════════ */

'use strict';

/* ── Constants ── */
const STORAGE_KEY_HISTORY    = 'ecoaudit_audit_history';
const STORAGE_KEY_SETTINGS   = 'ecoaudit_settings';
const STORAGE_KEY_AUTH       = 'ecoaudit_extension_user';
const STORAGE_KEY_PURCHASES  = 'ecoaudit_pending_purchases';
const API_BASE               = 'http://localhost:3000';

/* ── Default settings ── */
const DEFAULT_SETTINGS = {
  autoAudit:           true,
  showBadge:           true,
  suggestAlternatives: true,
  greenwashAlerts:     true,
  weeklyReport:        true,
};

/* ── Grade thresholds ── */
const GRADE_THRESHOLDS = [
  { min: 90, grade: 'A',  label: 'Excellent' },
  { min: 80, grade: 'A-', label: 'Very Good' },
  { min: 73, grade: 'B+', label: 'Good' },
  { min: 65, grade: 'B',  label: 'Above Average' },
  { min: 58, grade: 'B-', label: 'Above Average' },
  { min: 50, grade: 'C+', label: 'Moderate Risk' },
  { min: 42, grade: 'C',  label: 'Moderate Risk' },
  { min: 35, grade: 'C-', label: 'Below Average' },
  { min: 28, grade: 'D+', label: 'High Risk' },
  { min: 20, grade: 'D',  label: 'High Risk' },
  { min: 10, grade: 'D-', label: 'Very High Risk' },
  { min:  0, grade: 'F',  label: 'Very High Risk' },
];

function getGrade(score) {
  return GRADE_THRESHOLDS.find(t => score >= t.min) || GRADE_THRESHOLDS[GRADE_THRESHOLDS.length - 1];
}

/* ═══ AUTH HELPERS ═══ */
async function getAuthUser() {
  return new Promise(resolve => {
    chrome.storage.local.get(STORAGE_KEY_AUTH, data => {
      resolve(data[STORAGE_KEY_AUTH] || null);
    });
  });
}

async function setAuthUser(user) {
  return chrome.storage.local.set({ [STORAGE_KEY_AUTH]: user });
}

async function clearAuthUser() {
  return chrome.storage.local.remove(STORAGE_KEY_AUTH);
}

/* ═══ SETTINGS ═══ */
async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(STORAGE_KEY_SETTINGS, data => {
      resolve(data[STORAGE_KEY_SETTINGS] || DEFAULT_SETTINGS);
    });
  });
}

/* ═══ Extension installed / updated ═══ */
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: DEFAULT_SETTINGS });
    console.log('[EcoAudit] Extension installed — defaults set.');
  }
  if (details.reason === 'update') {
    console.log(`[EcoAudit] Updated to v${chrome.runtime.getManifest().version}`);
  }
  chrome.action.setBadgeBackgroundColor({ color: '#2D6A4F' });
});

/* ═══ EXTERNAL MESSAGE HANDLER (website → extension) ═══ */
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    sendResponse({ ok: false, error: 'invalid_message' });
    return;
  }

  switch (message.type) {
    case 'ECOAUDIT_AUTH_SYNC': {
      const user = message.user;
      if (!user || !user.email) {
        sendResponse({ ok: false, error: 'missing_user_data' });
        return;
      }
      const snapshot = {
        name:     user.name || '',
        email:    user.email,
        initials: user.initials || '',
        provider: user.provider || 'email',
        joined:   user.joined || new Date().toISOString(),
        location: user.location || null,
      };
      setAuthUser(snapshot).then(() => {
        console.log('[EcoAudit] Auth synced from website:', snapshot.email);
        sendResponse({ ok: true });
      });
      return true; // async
    }

    case 'ECOAUDIT_SIGN_OUT': {
      clearAuthUser().then(() => {
        console.log('[EcoAudit] Auth cleared from website sign-out.');
        sendResponse({ ok: true });
      });
      return true;
    }

    case 'ECOAUDIT_PING': {
      sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
      return;
    }

    case 'ecoaudit-get-pending-purchases': {
      const email = message.email;
      if (!email) {
        sendResponse({ ok: false, error: 'missing_email', purchases: [] });
        return;
      }
      getPendingPurchases(email).then(purchases => {
        sendResponse({ ok: true, purchases });
      });
      return true;
    }

    case 'ecoaudit-clear-pending-purchases': {
      const email = message.email;
      if (!email) { sendResponse({ ok: false }); return; }
      clearPendingPurchases(email).then(() => {
        sendResponse({ ok: true });
      });
      return true;
    }

    default:
      sendResponse({ ok: false, error: 'unknown_type' });
  }
});

/* ═══ INTERNAL MESSAGE HANDLER ═══ */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {

    case 'getAuthUser':
      getAuthUser().then(user => sendResponse({ user }));
      return true;

    case 'setAuthUser':
      setAuthUser(message.user).then(() => sendResponse({ ok: true }));
      return true;

    case 'productPageDetected':
      handleProductDetected(message, sender);
      sendResponse({ received: true });
      break;

    case 'requestAudit':
      runAudit(message.productData).then(result => sendResponse({ result }));
      return true;

    case 'requestAlternatives':
      fetchAlternatives(message.auditData).then(alts => sendResponse({ alternatives: alts }));
      return true;

    case 'savePurchase':
      savePurchaseItem(message.email, message.product).then(() => sendResponse({ saved: true }));
      return true;

    case 'openAudit':
      openAuditPage(message.domain, message.product);
      sendResponse({ opened: true });
      break;

    case 'findAlternatives':
      openAlternativesPage(message.domain, message.product);
      sendResponse({ opened: true });
      break;

    case 'openDashboard':
      chrome.tabs.create({ url: API_BASE + '/index.html' });
      sendResponse({ opened: true });
      break;

    case 'openLanding':
      chrome.tabs.create({ url: API_BASE + '/landing.html' + (message.params || '') });
      sendResponse({ opened: true });
      break;

    case 'getHistory':
      getAuditHistory().then(history => sendResponse({ history }));
      return true;

    case 'clearHistory':
      chrome.storage.local.remove(STORAGE_KEY_HISTORY, () => sendResponse({ cleared: true }));
      return true;

    case 'getSettings':
      chrome.storage.local.get(STORAGE_KEY_SETTINGS, data => {
        sendResponse({ settings: data[STORAGE_KEY_SETTINGS] || DEFAULT_SETTINGS });
      });
      return true;

    case 'updateSettings':
      chrome.storage.local.get(STORAGE_KEY_SETTINGS, data => {
        const current = data[STORAGE_KEY_SETTINGS] || DEFAULT_SETTINGS;
        const updated = { ...current, ...message.settings };
        chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: updated }, () => {
          sendResponse({ settings: updated });
        });
      });
      return true;

    default:
      sendResponse({ error: 'Unknown action' });
  }
});

/* ═══ AUDIT API ═══ */
async function runAudit(productData) {
  try {
    const user = await getAuthUser();
    const res = await fetch(API_BASE + '/api/extension/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product:         productData.productName || productData.name || '',
        productBrand:    productData.productBrand || '',
        brand:           productData.productBrand || productData.brand || '',
        retailer:        productData.retailer || '',
        brandConfidence: productData.brandConfidence || 'low',
        brandSource:     productData.brandSource || '',
        url:             productData.url || '',
        materials:       productData.materials || '',
        claims:          productData.claims || '',
        category:        productData.category || '',
        price:           productData.price || '',
        userEmail:       user?.email || '',
      }),
    });
    if (!res.ok) throw new Error('Audit API returned ' + res.status);
    return await res.json();
  } catch (err) {
    console.error('[EcoAudit] Audit API error:', err);
    return null;
  }
}

async function fetchAlternatives(auditData) {
  try {
    const user = await getAuthUser();
    const res = await fetch(API_BASE + '/api/extension/alternatives', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productName: auditData.productName || '',
        category:    auditData.category || '',
        brand:       auditData.brand || '',
        retailer:    auditData.retailer || '',
        score:       auditData.score || 50,
        location:    user?.location || null,
      }),
    });
    if (!res.ok) throw new Error('Alternatives API returned ' + res.status);
    const data = await res.json();
    return data.alternatives || [];
  } catch (err) {
    console.error('[EcoAudit] Alternatives API error:', err);
    return [];
  }
}

/* ═══ PURCHASE STORAGE ═══ */
async function savePurchaseItem(email, product) {
  if (!email) return;
  const key = STORAGE_KEY_PURCHASES;
  return new Promise(resolve => {
    chrome.storage.local.get(key, data => {
      const all = data[key] || {};
      if (!all[email]) all[email] = [];
      // Dedupe: same URL within 24h
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const isDupe = all[email].some(p =>
        p.url === product.url &&
        p.productName === product.productName &&
        new Date(p.createdAt).getTime() > dayAgo
      );
      if (!isDupe) {
        all[email].push({
          purchaseId:   'ext-' + crypto.randomUUID(),
          productName:  product.productName || 'Unknown Product',
          brand:        product.brand || '',
          score:        product.score || 50,
          grade:        product.grade || 'C',
          gradeClass:   product.gradeClass || 'grade-c',
          summary:      product.summary || '',
          materials:    product.materials || '',
          concerns:     product.concerns || '',
          positives:    product.positives || '',
          category:     product.category || 'Other',
          url:          product.url || '',
          image:        product.image || '',
          price:        product.price || '',
          retailer:     product.retailer || '',
          source:       'extension',
          createdAt:    new Date().toISOString(),
        });
      }
      chrome.storage.local.set({ [key]: all }, resolve);
    });
  });
}

async function getPendingPurchases(email) {
  return new Promise(resolve => {
    chrome.storage.local.get(STORAGE_KEY_PURCHASES, data => {
      const all = data[STORAGE_KEY_PURCHASES] || {};
      resolve(all[email] || []);
    });
  });
}

async function clearPendingPurchases(email) {
  return new Promise(resolve => {
    chrome.storage.local.get(STORAGE_KEY_PURCHASES, data => {
      const all = data[STORAGE_KEY_PURCHASES] || {};
      delete all[email];
      chrome.storage.local.set({ [STORAGE_KEY_PURCHASES]: all }, resolve);
    });
  });
}
/* ═══ SAFE TAB HELPERS ═══ */
async function tabExists(tabId) {
  return new Promise(resolve => {
    chrome.tabs.get(tabId, () => {
      if (chrome.runtime.lastError) resolve(false);
      else resolve(true);
    });
  });
}

async function safeSetBadge(tabId, text, color) {
  if (!(await tabExists(tabId))) return;
  return new Promise(resolve => {
    const queue = [];
    if (text !== undefined) {
      queue.push(new Promise(r => chrome.action.setBadgeText({ text, tabId }, () => {
        chrome.runtime.lastError; // consume error if any
        r();
      })));
    }
    if (color !== undefined) {
      queue.push(new Promise(r => chrome.action.setBadgeBackgroundColor({ color, tabId }, () => {
        chrome.runtime.lastError;
        r();
      })));
    }
    Promise.all(queue).then(() => resolve());
  });
}

async function safeClearBadge(tabId) {
  if (!(await tabExists(tabId))) return;
  return new Promise(resolve => {
    chrome.action.setBadgeText({ text: '', tabId }, () => {
      chrome.runtime.lastError; // consume error to prevent console spam
      resolve();
    });
  });
}

/* ═══ PRODUCT DETECTION ═══ */
async function handleProductDetected(message, sender) {
  const { domain, product, score, grade } = message;
  const tabId = sender.tab?.id;
  if (!tabId) return;

  const settings = await getSettings();

  if (settings.showBadge && score != null) {
    const badgeColor = score >= 65 ? '#2D6A4F'
                     : score >= 40 ? '#E65100'
                     : '#C62828';
    await safeSetBadge(tabId, grade || '', badgeColor);
  }

  await saveAuditEntry({ domain, product, score, grade, url: sender.tab?.url, timestamp: Date.now() });

  if (settings.greenwashAlerts && score < 40) {
    sendGreenwashNotification(product, domain, score, grade);
  }

  console.log(`[EcoAudit] Audited: ${product} (${domain}) → ${grade} (${score})`);
}

/* ═══ Dashboard links ═══ */
function openAuditPage(domain, product) {
  const url = API_BASE + `/index.html?page=scanner&query=${encodeURIComponent(product || domain)}`;
  chrome.tabs.create({ url });
}

function openAlternativesPage(domain, product) {
  const url = API_BASE + `/index.html?page=map&product=${encodeURIComponent(product || domain)}`;
  chrome.tabs.create({ url });
}

/* ═══ AUDIT HISTORY ═══ */
async function saveAuditEntry(entry) {
  return new Promise(resolve => {
    chrome.storage.local.get(STORAGE_KEY_HISTORY, data => {
      const history = data[STORAGE_KEY_HISTORY] || [];
      const recent = Date.now() - 5 * 60 * 1000;
      const isDupe = history.some(h => h.url === entry.url && h.timestamp > recent);
      if (!isDupe) {
        history.unshift(entry);
        chrome.storage.local.set({ [STORAGE_KEY_HISTORY]: history.slice(0, 100) }, resolve);
      } else {
        resolve();
      }
    });
  });
}

async function getAuditHistory() {
  return new Promise(resolve => {
    chrome.storage.local.get(STORAGE_KEY_HISTORY, data => {
      resolve(data[STORAGE_KEY_HISTORY] || []);
    });
  });
}

/* ═══ NOTIFICATIONS ═══ */
function sendGreenwashNotification(product, domain, score, grade) {
  if (!chrome.notifications) return;
  chrome.notifications.create({
    type:    'basic',
    iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRUEFTuQmCC',
    title:   `⚠️ EcoAudit — Greenwash Alert`,
    message: `"${(product || '').substring(0, 60)}" scored ${grade} (${score}/100). Possible greenwashing detected on ${domain}.`,
    priority: 1,
  });
}

/* ═══ Tab update listener ═══ */
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    safeClearBadge(tabId);
  }
});

/* ═══ Weekly alarm ═══ */
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'weeklyReport') {
    chrome.notifications?.create({
      type:    'basic',
      iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRUEFTuQmCC',
      title:   '🌿 Your Weekly EcoAudit Report',
      message: 'Your sustainability report for this week is ready. Open the dashboard to see your impact.',
      priority: 0,
    });
  }
});

chrome.alarms.get('weeklyReport', alarm => {
  if (!alarm) {
    chrome.alarms.create('weeklyReport', {
      periodInMinutes: 7 * 24 * 60,
    });
  }
});

console.log('[EcoAudit] Background service worker ready.');
