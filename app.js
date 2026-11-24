/* ═══════════════════════════════════════════
   ECOAUDIT — Dashboard App Logic
   Brand data sourced from: B Lab, Good On You,
   MSCI ESG, Sustainalytics, CDP, EcoVadis (2024-2026)
═══════════════════════════════════════════ */

(function () {
  'use strict';

  /* Escape text that came from the AI (or from emails it read) before putting it in HTML. */
  const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  /* "Hand-checked" for the curated brand database, "AI estimate" for anything Claude generated. */
  const provenanceBadge = isAI => isAI
    ? '<span class="provenance provenance-ai" title="Estimated by AI from public information. Treat as a starting point.">AI estimate</span>'
    : '<span class="provenance provenance-checked" title="Researched by hand from the sources listed below.">Hand-checked</span>';
  const scoreColor = n => n >= 70 ? '#2F7A4A' : n >= 50 ? '#6E8F2E' : n >= 35 ? '#B7841C' : '#BF5B2C';
  const claimDot = status => `<span class="claim-dot claim-dot-${status === 'verified' ? 'good' : status === 'negative' ? 'bad' : 'mixed'}" aria-label="${status === 'verified' ? 'Verified' : status === 'negative' ? 'Problem' : 'Unclear'}"></span>`;

  /* ── Extension Auth Bridge ── */
  const ECOAUDIT_EXTENSION_ID = window.ecoauditExtensionId || 'jgdahdonhelocfmhmfioenpeeokmnadp';

  function extensionIdForDebug(newId) {
    if (!newId) return;
    window.ecoauditExtensionId = newId;
    return newId;
  }

  function sendExtensionMessage(msg, cb) {
    if (!ECOAUDIT_EXTENSION_ID) {
      console.warn('[EcoAudit] No extension ID configured. Set window.ecoauditExtensionId to your unpacked extension ID.');
      return;
    }
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      console.warn('[EcoAudit] Chrome extension API not available on this page.');
      return;
    }
    try {
      chrome.runtime.sendMessage(ECOAUDIT_EXTENSION_ID, msg, response => {
        if (chrome.runtime.lastError) {
          console.log('[EcoAudit] Extension not reachable:', chrome.runtime.lastError.message);
          if (cb) cb({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        if (cb) cb(response);
      });
    } catch (e) {
      console.log('[EcoAudit] Extension bridge error:', e);
      if (cb) cb({ ok: false, error: e.message || String(e) });
    }
  }

  function pingExtension(cb) {
    sendExtensionMessage({ type: 'ECOAUDIT_PING' }, cb);
  }

  function syncUserWithExtension(user) {
    if (!user || !user.email) return;
    sendExtensionMessage({
      type: 'ECOAUDIT_AUTH_SYNC',
      user: {
        name: user.name || '',
        email: user.email,
        initials: user.initials || '',
        provider: user.provider || 'web',
        joined: user.joined || new Date().toISOString(),
        location: user.location || null,
      },
    }, response => {
      if (!response?.ok) {
        console.warn('[EcoAudit] extension auth sync unexpected response', response);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const user = (() => {
      try { return JSON.parse(localStorage.getItem('ecoaudit_user')); } catch { return null; }
    })();
    if (user && user.email) {
      syncUserWithExtension(user);
    }
    pingExtension(response => {
      if (response?.ok) {
        console.log('[EcoAudit] Extension is active (v' + response.version + ')');
      }
    });
  });

  function clearExtensionAuth() {
    sendExtensionMessage({ type: 'ECOAUDIT_SIGN_OUT' });
  }

  /* ── Navigation ── */
  const navItems  = document.querySelectorAll('.nav-item[data-page], .topbar-logo[data-page]');
  const pages     = document.querySelectorAll('.page');
  const pageTitle = document.getElementById('pageTitle');
  const topbarNav = document.getElementById('topbarNav');
  const topbarNavWrap = document.getElementById('topbarNavWrap');
  const topbar = document.querySelector('.topbar.topbar--full');
  const menuToggle = document.getElementById('menuToggle');

  function updateTopbarNavMode() {
    if (!topbar || !topbarNavWrap || !topbarNav) return;
    if (window.matchMedia('(max-width: 820px)').matches) {
      topbar.classList.add('topbar--nav-dropdown');
      topbarNav.classList.remove('open');
      return;
    }
    topbar.classList.remove('topbar--nav-dropdown');
    topbarNav.classList.remove('open');
    requestAnimationFrame(() => {
      const needed = topbarNav.scrollWidth;
      const avail = topbarNavWrap.clientWidth;
      if (needed > avail + 2) topbar.classList.add('topbar--nav-dropdown');
    });
  }

  updateTopbarNavMode();
  window.addEventListener('resize', () => {
    window.requestAnimationFrame(updateTopbarNavMode);
  });
  if (typeof ResizeObserver !== 'undefined' && topbarNavWrap) {
    new ResizeObserver(() => window.requestAnimationFrame(updateTopbarNavMode)).observe(topbarNavWrap);
  }

  const pageTitles = {
    dashboard: 'Impact Dashboard',
    track:     'Upload Products',
    library:   'Products',
    map:       'Map',
    brands:    'Brands',
    settings:  'Settings',
  };

  navItems.forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const target = item.dataset.page;
      const pageEl = document.getElementById('page-' + target);
      if (!pageEl) return;
      navItems.forEach(n => n.classList.remove('active'));
      navItems.forEach(n => { if (n.dataset.page === target) n.classList.add('active'); });
      pages.forEach(p => p.classList.remove('active'));
      pageEl.classList.add('active');
      if (pageTitle) pageTitle.textContent = pageTitles[target] || target;
      if (topbar?.classList.contains('topbar--nav-dropdown') && topbarNav) topbarNav.classList.remove('open');
      if (target === 'library' && typeof window.ecoauditRefreshLibrary === 'function') {
        window.ecoauditRefreshLibrary();
      }
    });
  });

  menuToggle?.addEventListener('click', () => topbarNav?.classList.toggle('open'));

  document.addEventListener('click', e => {
    if (!topbar?.classList.contains('topbar--nav-dropdown') || !topbarNav?.classList.contains('open')) return;
    if (topbarNav.contains(e.target) || menuToggle?.contains(e.target)) return;
    topbarNav.classList.remove('open');
  });

  /* ── Dynamic greeting based on real time ── */
  function setGreeting() {
    const h = new Date().getHours();
    const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const el = document.querySelector('.hero-text h1');
    const user = (() => { try { return JSON.parse(localStorage.getItem('ecoaudit_user')); } catch { return null; } })();
    const name = user ? user.name.split(' ')[0] : 'there';
    if (el) el.textContent = `${greeting}, ${name}`;
  }
  setGreeting();

  /* ═══════════════════════════════════════
     USER STATS ENGINE
     Tracks audits, CO₂, greenwash alerts, etc.
     Persisted in localStorage, updated on user actions.
  ═══════════════════════════════════════ */
  const defaultStats = { audits: 0, co2Saved: 0, alerts: 0, saved: 0, uploads: 0, water: 0, plastic: 0, shippingCO2: 0, totalDistance: 0, scoreSum: 0, originCountries: {}, scannedBrands: [] };

  function getStats() {
    try { return { ...defaultStats, ...JSON.parse(localStorage.getItem('ecoaudit_stats')) }; }
    catch { return { ...defaultStats }; }
  }
  function saveStats(s) { localStorage.setItem('ecoaudit_stats', JSON.stringify(s)); }

  function getNotifs() {
    try { return JSON.parse(localStorage.getItem('ecoaudit_notifs')) || []; }
    catch { return []; }
  }
  function saveNotifs(n) { localStorage.setItem('ecoaudit_notifs', JSON.stringify(n)); }

  function addNotification(icon, text) {
    const notifs = getNotifs();
    notifs.unshift({ id: Date.now(), icon, text, time: 'Just now', unread: true });
    if (notifs.length > 20) notifs.length = 20;
    saveNotifs(notifs);
  }

  function purchaseStorageKeyGlobal() {
    try {
      const u = JSON.parse(localStorage.getItem('ecoaudit_user') || 'null');
      const em = u && u.email ? String(u.email).trim().toLowerCase() : '';
      return 'ecoaudit_footprint_store:' + (em || 'guest');
    } catch { return 'ecoaudit_footprint_store:guest'; }
  }

  /** Recompute product count, distances, origins from saved purchase rows (source of truth). */
  function syncPurchaseAggregatesIntoStats() {
    const s = getStats();
    let purchases = [];
    try {
      const raw = localStorage.getItem(purchaseStorageKeyGlobal());
      if (raw) {
        const o = JSON.parse(raw);
        if (Array.isArray(o.purchases)) purchases = o.purchases;
      }
    } catch {}
    let scoreSum = 0;
    let totalDistance = 0;
    let shippingCO2 = 0;
    const originCountries = {};
    for (const p of purchases) {
      const sc = Math.max(1, Math.min(100, Number(p.aiScore) || 50));
      scoreSum += sc;
      const oc = normalizeCountryName((p.originCountry || '').trim());
      if (oc) {
        originCountries[oc] = (originCountries[oc] || 0) + 1;
        const dist = estimateShippingDistanceKm(oc);
        totalDistance += dist;
        shippingCO2 += dist * 0.00005;
      }
    }
    s.uploads = purchases.length;
    s.scoreSum = scoreSum;
    s.totalDistance = totalDistance;
    s.shippingCO2 = shippingCO2;
    s.originCountries = originCountries;
    saveStats(s);
  }

  /** Pastel fills for category donut (readable on white legend dots). */
  const DASHBOARD_CATEGORY_COLORS = {
    Fashion: '#A8D5BA',
    Electronics: '#B8D4F0',
    Food: '#D4E8B8',
    Beauty: '#F5C6D6',
    Home: '#FFD4B8',
    Sports: '#B2DFDB',
    Other: '#CFD8DC',
  };

  /** Shipping CO₂e → 0–100 quality (lower kg = higher score). */
  function computeEmissionsQualityScore(s) {
    const kg = s.shippingCO2 || 0;
    const nOrig = Object.keys(s.originCountries || {}).length;
    if (kg <= 0 && nOrig === 0) return 70;
    if (kg <= 0) return 88;
    const REF_KG = 40;
    return Math.round(100 * Math.max(0, 1 - Math.min(1, kg / REF_KG)));
  }

  /** Eco Score from library only: avg AI sustainability + estimated shipping emissions. */
  function computeEcoScoreFromLibrary(s) {
    const uploads = s.uploads || 0;
    if (uploads <= 0) return 0;
    const avgScore = Math.round((s.scoreSum || 0) / uploads);
    const emQ = computeEmissionsQualityScore(s);
    return Math.min(100, Math.round(0.52 * avgScore + 0.48 * emQ));
  }

  const GREENWASH_HINT = /greenwash|misleading|unverified|vague|washing|token|no evidence|lack of transparency|questionable|exaggerat|greenwashing|ambiguous|unsubstantiated|false claim|overstated/i;

  function purchasesWithGreenwashSignals(purchases) {
    const out = [];
    for (const p of purchases) {
      const concerns = String(p.aiConcerns || '').trim();
      const summary = String(p.aiSummary || '');
      if (!concerns || /^none identified\.?$/i.test(concerns)) continue;
      if (GREENWASH_HINT.test(concerns) || GREENWASH_HINT.test(summary)) {
        out.push(p);
        continue;
      }
      if (concerns.length > 24 && /concern|risk|warn|unclear|verify|claim/i.test(concerns)) out.push(p);
    }
    return out;
  }

  function escapeHtmlLite(t) {
    const d = document.createElement('div');
    d.textContent = t == null ? '' : String(t);
    return d.innerHTML;
  }

  function buildGreenwashModalHtml() {
    const purchases = getPurchasesFromStore();
    const flagged = purchasesWithGreenwashSignals(purchases);
    let html = '<p class="modal-lead">This number matches your dashboard: <strong>' + flagged.length + '</strong> product' + (flagged.length === 1 ? '' : 's') + ' in your products where we flagged sustainability concerns that match common greenwash or risk patterns (vague claims, missing evidence, misleading language, etc.). It only uses data from <strong>your saved products</strong>, not brand scans.</p>';
    if (!flagged.length) {
      html += '<p class="modal-muted">We did not find matching risk-style wording in your Products analyses yet. Add or re-import products under <strong>Upload Products</strong> so we can assess concerns for each item.</p>';
      return html;
    }
    html += '<p class="modal-muted" style="margin-bottom:14px">Below is the full <strong>Concerns</strong> text we stored for each flagged product (same order as your products signals).</p>';
    html += '<div class="modal-gw-stack">';
    flagged.forEach(p => {
      const name = escapeHtmlLite(p.aiName || 'Product');
      const brand = escapeHtmlLite(p.aiBrand || '—');
      const raw = String(p.aiConcerns || '').trim();
      const concernsBlock = escapeHtmlLite(raw);
      const summary = String(p.aiSummary || '').trim();
      const sumBlock = summary ? '<div class="modal-gw-label" style="margin-top:10px">Summary</div><div class="modal-gw-text">' + escapeHtmlLite(summary) + '</div>' : '';
      html += '<div class="modal-gw-card"><div class="modal-gw-title">' + name + ' · ' + brand + '</div>';
      html += '<div class="modal-gw-label">Concerns</div><div class="modal-gw-text">' + concernsBlock + '</div>';
      html += sumBlock + '</div>';
    });
    html += '</div>';
    return html;
  }

  function goToAppPage(page) {
    const link = document.querySelector('.nav-item[data-page="' + page + '"]');
    if (link) link.click();
  }

  function closeGreenwashModal() {
    const modal = document.getElementById('greenwashModal');
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';
  }

  (function initDashboardMetricActions() {
    document.getElementById('fpBtnLibrary')?.addEventListener('click', () => {
      goToAppPage('library');
      if (typeof window.ecoauditRefreshLibrary === 'function') window.ecoauditRefreshLibrary();
    });
    document.getElementById('fpBtnMapShipping')?.addEventListener('click', () => goToAppPage('map'));
    document.getElementById('fpBtnMapCountries')?.addEventListener('click', () => goToAppPage('map'));
    const modal = document.getElementById('greenwashModal');
    const body = document.getElementById('greenwashModalBody');
    document.getElementById('fpBtnGreenwashExplain')?.addEventListener('click', () => {
      if (body) body.innerHTML = buildGreenwashModalHtml();
      if (modal) modal.hidden = false;
      document.body.style.overflow = 'hidden';
    });
    document.getElementById('greenwashModalClose')?.addEventListener('click', closeGreenwashModal);
    modal?.addEventListener('click', e => { if (e.target === modal) closeGreenwashModal(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal && !modal.hidden) closeGreenwashModal();
    });
  })();

  function normalizeDashboardCategory(raw) {
    const c = String(raw || '').toLowerCase();
    if (!c.trim()) return 'Other';
    if (/fashion|clothing|apparel|textile|wear/.test(c)) return 'Fashion';
    if (/electronic|tech|computer|phone|gadget|audio|gaming/.test(c)) return 'Electronics';
    if (/food|beverage|grocery|drink|snack/.test(c)) return 'Food';
    if (/beauty|cosmetic|personal care|skincare|makeup|hair care/.test(c)) return 'Beauty';
    if (/home|furniture|decor|bedding|kitchen|living/.test(c)) return 'Home';
    if (/sports|outdoor|fitness|athletic/.test(c)) return 'Sports';
    return 'Other';
  }

  function getPurchasesFromStore() {
    try {
      const raw = localStorage.getItem(purchaseStorageKeyGlobal());
      if (!raw) return [];
      const o = JSON.parse(raw);
      return Array.isArray(o.purchases) ? o.purchases : [];
    } catch { return []; }
  }

  function updateCategoryDonut() {
    const legend = document.getElementById('donutLegend');
    const countEl = document.getElementById('donutCount');
    const arcGroup = document.getElementById('donutArcGroup');
    const svgNS = 'http://www.w3.org/2000/svg';
    if (!legend || !arcGroup || !countEl) return;

    const purchases = getPurchasesFromStore();
    const buckets = {};
    for (const p of purchases) {
      const k = normalizeDashboardCategory(p.aiCategory);
      buckets[k] = (buckets[k] || 0) + 1;
    }
    const total = purchases.length;
    countEl.textContent = total;

    arcGroup.innerHTML = '';
    const R = 44;
    const cx = 60;
    const cy = 60;
    const C = 2 * Math.PI * R;

    if (total === 0) {
      const bg = document.createElementNS(svgNS, 'circle');
      bg.setAttribute('cx', String(cx));
      bg.setAttribute('cy', String(cy));
      bg.setAttribute('r', String(R));
      bg.setAttribute('fill', 'none');
      bg.setAttribute('stroke', '#D8F3DC');
      bg.setAttribute('stroke-width', '18');
      arcGroup.appendChild(bg);
      legend.innerHTML = '<div class="donut-empty">No data yet — add products under Upload Products.</div>';
      return;
    }

    const order = ['Fashion', 'Electronics', 'Food', 'Beauty', 'Home', 'Sports', 'Other'];
    const segments = order.filter(k => buckets[k] > 0).map(k => ({
      key: k,
      count: buckets[k],
      pct: buckets[k] / total,
    }));

    let cum = 0;
    segments.forEach(({ key, pct }) => {
      const len = Math.min(C, pct * C);
      const seg = document.createElementNS(svgNS, 'circle');
      seg.setAttribute('cx', String(cx));
      seg.setAttribute('cy', String(cy));
      seg.setAttribute('r', String(R));
      seg.setAttribute('fill', 'none');
      seg.setAttribute('stroke', DASHBOARD_CATEGORY_COLORS[key] || '#78909C');
      seg.setAttribute('stroke-width', '18');
      seg.setAttribute('stroke-linecap', 'butt');
      seg.setAttribute('stroke-dasharray', `${len} ${C}`);
      seg.setAttribute('stroke-dashoffset', String(-cum));
      cum += len;
      arcGroup.appendChild(seg);
    });

    legend.innerHTML = segments.map(({ key, count }) => {
      const pct = Math.round((count / total) * 100);
      const col = DASHBOARD_CATEGORY_COLORS[key] || '#78909C';
      return '<div class="legend-item"><span class="dot" style="background:' + col + '"></span>' + key + '<b>' + count + ' (' + pct + '%)</b></div>';
    }).join('');
  }

  function renderHeroScoreExplanation() {
    const el = document.getElementById('heroExplainContent');
    if (!el) return;
    syncPurchaseAggregatesIntoStats();
    const s = getStats();
    const uploads = s.uploads || 0;
    const ecoScore = computeEcoScoreFromLibrary(s);
    const avgProduct = uploads > 0 ? Math.round((s.scoreSum || 0) / uploads) : 0;
    const emQ = computeEmissionsQualityScore(s);
    const kg = s.shippingCO2 || 0;

    let html = '<p class="hero-explain-lead">Your Eco Score (<strong>' + ecoScore + '</strong>/100) reflects your <strong>Products</strong> only: average sustainability rating and estimated shipping emissions from product origins.</p>';
    if (uploads <= 0) {
      html += '<p class="hero-explain-context">Add products under <strong>Upload Products</strong> to calculate a score. The ring stays at 0 until you have at least one tracked item.</p>';
      el.innerHTML = html;
      return;
    }
    html += '<ul class="hero-explain-list">';
    html += '<li><strong>Sustainability mix (52%)</strong> — average score across <strong>' + uploads + '</strong> product' + (uploads === 1 ? '' : 's') + ': <strong>' + avgProduct + '/100</strong><span class="hero-explain-hint">Weighted scores from your products</span></li>';
    html += '<li><strong>Shipping emissions (48%)</strong> — estimated <strong>' + kg.toFixed(2) + ' kg</strong> CO₂e → emissions quality <strong>' + emQ + '/100</strong><span class="hero-explain-hint">Lower shipping footprint raises this part.</span></li>';
    html += '</ul>';
    html += '<p class="hero-explain-total">Total Score: 0.52 × ' + avgProduct + ' + 0.48 × ' + emQ + ' ≈ <strong>' + ecoScore + '</strong> (capped at 100).</p>';
    el.innerHTML = html;
  }

  function refreshAllUI() {
    syncPurchaseAggregatesIntoStats();
    const s = getStats();
    const purchases = getPurchasesFromStore();
    const ecoScore = computeEcoScoreFromLibrary(s);
    const libGreenwash = purchasesWithGreenwashSignals(purchases).length;

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const setW = (id, v) => { const el = document.getElementById(id); if (el) el.style.width = v; };

    set('heroBadgeNum', ecoScore);
    set('sidebarEcoScore', ecoScore);
    set('pStatScore', ecoScore);
    set('pStatAudits', s.scannedBrands.length || s.audits);
    {
      const ship = s.shippingCO2 || 0;
      set('pStatCO2', ship < 1 ? (ship * 1000).toFixed(0) + ' g' : ship.toFixed(1) + ' kg');
    }

    const ring = document.getElementById('ecoRingFill');
    if (ring) ring.setAttribute('stroke-dashoffset', 289 - (289 * ecoScore / 100));

    const heroSub = document.getElementById('heroSubtext');
    if (heroSub) {
      heroSub.innerHTML = s.uploads > 0
        ? `You've tracked <strong>${s.uploads} product${s.uploads === 1 ? '' : 's'}</strong> with <strong>${(s.shippingCO2 || 0).toFixed(1)} kg</strong> shipping CO₂e.`
        : 'Start scanning brands and uploading receipts to track your impact!';
    }

    /* ── Footprint page: real measurable metrics ── */
    set('fpProducts', s.uploads);
    set('fpProductsCmp', s.uploads > 0
      ? s.uploads + ' product' + (s.uploads === 1 ? '' : 's') + ' analyzed'
      : 'Add purchases to start tracking');

    const shipCO2 = s.shippingCO2 || 0;
    set('fpShipping', shipCO2 < 1 ? (shipCO2 * 1000).toFixed(0) + ' g' : shipCO2.toFixed(1) + ' kg');
    const shipEquiv = document.getElementById('fpShipEquiv');
    if (shipEquiv) {
      if (shipCO2 > 0) {
        const miDriven = (shipCO2 / 0.404 * 1.609).toFixed(0);
        const phonesCharged = Math.round(shipCO2 / 0.008);
        shipEquiv.textContent = '≈ ' + miDriven + ' km driven · ' + phonesCharged.toLocaleString() + ' phone charges';
      } else { shipEquiv.textContent = ''; }
    }
    set('fpShippingCmp', shipCO2 > 0
      ? 'Based on estimated shipping from product origins'
      : 'Import products to calculate');

    set('fpGreenwash', libGreenwash);
    if (libGreenwash === 0) {
      set('fpGreenwashCmp', 'No product matches yet — add products to analyze');
    } else {
      set('fpGreenwashCmp', libGreenwash + ' product' + (libGreenwash === 1 ? '' : 's') + ' with flagged concern text');
    }

    const numCountries = Object.keys(s.originCountries || {}).length;
    set('fpCountries', numCountries);
    set('fpCountriesCmp', numCountries > 0
      ? 'Sourced from ' + Object.keys(s.originCountries).slice(0, 3).join(', ') + (numCountries > 3 ? ' +' + (numCountries - 3) + ' more' : '')
      : 'Upload Products to see where they come from');

    const chartEmpty = document.getElementById('chartEmpty');
    if (chartEmpty) chartEmpty.style.display = s.audits > 0 ? 'none' : 'flex';

    updateFootprintChart(s);
    updateCategoryDonut();
    renderHeroScoreExplanation();
  }

  (function initHeroExplainToggle() {
    const btn = document.getElementById('heroExplainBtn');
    const panel = document.getElementById('heroExplainPanel');
    if (!btn || !panel) return;
    btn.addEventListener('click', () => {
      const willOpen = panel.hidden;
      panel.hidden = !willOpen;
      btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      btn.classList.toggle('is-open', willOpen);
    });
  })();

  function updateFootprintChart(s) {
    if (s.audits === 0) return;
    const areaP = document.getElementById('chartAreaPath');
    const lineP = document.getElementById('chartLinePath');
    const dotsG = document.getElementById('chartDots');
    if (!areaP || !lineP || !dotsG) return;

    const points = [];
    const total = s.audits;
    for (let i = 0; i < 6; i++) {
      const frac = Math.max(0, (total - (5 - i) * (total / 6))) / Math.max(1, total);
      const y = 178 - frac * 140;
      points.push({ x: i * 112, y: Math.max(10, y) });
    }
    if (total <= 3) {
      points.forEach((p, i) => { if (i < 5) p.y = 178; });
      points[5].y = 178 - Math.min(140, total * 25);
    }

    const lineParts = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x + ',' + p.y).join(' ');
    lineP.setAttribute('d', lineParts);
    areaP.setAttribute('d', lineParts + ' L560,180 L0,180 Z');

    dotsG.innerHTML = points.map(p =>
      `<circle cx="${p.x}" cy="${p.y}" r="4" fill="#2D6A4F"/>`
    ).join('');
    dotsG.lastElementChild?.setAttribute('fill', '#7FAE8A');
    dotsG.lastElementChild?.setAttribute('stroke', '#fff');
    dotsG.lastElementChild?.setAttribute('stroke-width', '2');
  }

  function recordScan(brandName, grade, hasGreenwash) {
    const s = getStats();
    s.audits++;
    const co2Delta = grade.charAt(0) === 'A' ? 2.5 : grade.charAt(0) === 'B' ? 1.5 : 0.5;
    s.co2Saved += co2Delta;
    s.water += co2Delta * 15;
    s.plastic += co2Delta * 0.08;
    if (hasGreenwash) s.alerts++;
    if (!s.scannedBrands.includes(brandName)) s.scannedBrands.push(brandName);
    saveStats(s);

    addNotification('🔍', `<strong>Scanned:</strong> ${brandName} — Grade ${grade}`);
    if (hasGreenwash) {
      addNotification('⚠️', `<strong>Greenwash detected:</strong> ${brandName} has unverified claims`);
    }

    addRecentAudit(brandName, grade);
    if (hasGreenwash) addGreenwashAlert(brandName);

    refreshAllUI();
  }

  /** Per-item legacy KPI bump (co₂/water/plastic). Product counts & shipping come from syncPurchaseAggregatesIntoStats. */
  function applyPurchaseFootprint(score, originCountry, opts) {
    const skipRefresh = opts && opts.skipRefresh;
    const s = getStats();
    const q = Math.max(1, Math.min(100, Number(score) || 50));
    s.co2Saved += 0.2 + (q / 100) * 0.25;
    s.water += 4 + (q / 100) * 8;
    s.plastic += 0.035 + ((100 - q) / 100) * 0.03;
    saveStats(s);
    if (!skipRefresh) refreshAllUI();
  }

  function estimateShippingDistanceKm(originCountry) {
    const userCoords = getUserCoords();
    const originCoords = getCountryCoords(originCountry);
    if (!originCoords) return 5000;
    return haversineKm(userCoords[0], userCoords[1], originCoords[0], originCoords[1]);
  }

  function getUserCoords() {
    try {
      const u = JSON.parse(localStorage.getItem('ecoaudit_user') || '{}');
      if (u.lat && u.lng) return [u.lat, u.lng];
    } catch {}
    return [37.09, -95.71];
  }

  /** Lowercase key for alias lookup (strips “The”, extra spaces, most punctuation). */
  function normalizeCountryKey(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replace(/\./g, '')
      .replace(/,/g, '')
      .replace(/\s+/g, ' ')
      .replace(/^the\s+/, '');
  }

  /** Maps normalized keys to one canonical English name (aggregation, coords, display). */
  const CANONICAL_COUNTRY_BY_KEY = {
    usa: 'United States',
    us: 'United States',
    'u s': 'United States',
    'u s a': 'United States',
    'united states of america': 'United States',
    america: 'United States',
    'united states': 'United States',
    uk: 'United Kingdom',
    'u k': 'United Kingdom',
    'great britain': 'United Kingdom',
    britain: 'United Kingdom',
    england: 'United Kingdom',
    scotland: 'United Kingdom',
    wales: 'United Kingdom',
    'northern ireland': 'United Kingdom',
    'united kingdom': 'United Kingdom',
    'south korea': 'South Korea',
    'republic of korea': 'South Korea',
    korea: 'South Korea',
    'north korea': 'North Korea',
    uae: 'United Arab Emirates',
    'u a e': 'United Arab Emirates',
    'united arab emirates': 'United Arab Emirates',
    'czech republic': 'Czechia',
    czechia: 'Czechia',
    russia: 'Russia',
    'russian federation': 'Russia',
    vietnam: 'Vietnam',
    'viet nam': 'Vietnam',
    holland: 'Netherlands',
    'the netherlands': 'Netherlands',
    netherlands: 'Netherlands',
  };

  function normalizeCountryName(raw) {
    const t = String(raw || '').trim();
    if (!t) return '';
    let key = normalizeCountryKey(t);
    if (CANONICAL_COUNTRY_BY_KEY[key]) return CANONICAL_COUNTRY_BY_KEY[key];
    key = key.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (CANONICAL_COUNTRY_BY_KEY[key]) return CANONICAL_COUNTRY_BY_KEY[key];
    return t;
  }

  function getCountryCoords(name) {
    if (!name) return null;
    const canon = normalizeCountryName(name);
    const lookup = {
      'China': [35.86, 104.20], 'Vietnam': [14.06, 108.28], 'Bangladesh': [23.68, 90.36],
      'India': [20.59, 78.96], 'Indonesia': [0.79, 113.92], 'Turkey': [38.96, 35.24],
      'Thailand': [15.87, 100.99], 'Cambodia': [12.57, 104.99], 'Pakistan': [30.38, 69.35],
      'Sri Lanka': [7.87, 80.77], 'Philippines': [12.88, 121.77], 'Malaysia': [4.21, 101.98],
      'Mexico': [23.63, -102.55], 'Brazil': [-14.24, -51.93], 'Italy': [41.87, 12.57],
      'Germany': [51.17, 10.45], 'France': [46.23, 2.21], 'Spain': [40.46, -3.75],
      'Portugal': [39.40, -8.22], 'United Kingdom': [55.38, -3.44], 'UK': [55.38, -3.44],
      'USA': [37.09, -95.71], 'United States': [37.09, -95.71], 'Canada': [56.13, -106.35],
      'Japan': [36.20, 138.25], 'South Korea': [35.91, 127.77], 'Taiwan': [23.70, 120.96],
      'Australia': [-25.27, 133.78], 'Sweden': [60.13, 18.64], 'Netherlands': [52.13, 5.29],
      'Switzerland': [46.82, 8.23], 'Poland': [51.92, 19.15], 'Singapore': [1.35, 103.82],
      'South Africa': [-30.56, 22.94], 'Egypt': [26.82, 30.80], 'Colombia': [4.57, -74.30],
      'United Arab Emirates': [23.42, 53.85], 'Russia': [61.52, 105.32], 'Czechia': [49.82, 15.47],
      'North Korea': [40.34, 127.51],
    };
    const tryNames = [canon, name.trim()].filter(Boolean);
    for (const n of tryNames) {
      if (lookup[n]) return lookup[n];
      const lower = n.toLowerCase();
      for (const [k, v] of Object.entries(lookup)) {
        if (k.toLowerCase() === lower) return v;
      }
    }
    return null;
  }

  /** Detect when the model echoed schema instructions instead of a real country name. */
  function isPlaceholderOriginText(s) {
    const t = String(s || '').trim();
    if (!t || t.length > 90) return true;
    const l = t.toLowerCase();
    if (/\b(required|infer|string|primary manufacturing|best guess|e\.g\.|unknown)\b/.test(l)) return true;
    if (l.includes('country where') || l.includes('typically manufactures')) return true;
    return false;
  }

  function extractOriginFromScanData(data) {
    if (!data || typeof data !== 'object') return { country: '', city: '' };
    const s = v => (v == null ? '' : String(v).trim());
    let country = s(
      data.origin_country ?? data.originCountry ?? data.country_of_origin ?? data.made_in ??
      data.manufacturing_country ?? data.country
    );
    let city = s(data.origin_city ?? data.originCity ?? data.manufacturing_city);
    if (isPlaceholderOriginText(country)) country = '';
    if (isPlaceholderOriginText(city)) city = '';
    const o = data.origin;
    if (typeof o === 'string' && o.trim()) {
      const parts = o.split(',').map(x => x.trim()).filter(Boolean);
      if (parts.length >= 2) {
        if (!city) city = parts[0];
        if (!country) country = parts[parts.length - 1];
      } else if (!country) country = o.trim();
    } else if (o && typeof o === 'object') {
      if (!country) country = s(o.country || o.nation);
      if (!city) city = s(o.city || o.region);
    }
    const loc = data.location || data.manufacturing_location;
    if (typeof loc === 'string' && loc.trim()) {
      const parts = loc.split(',').map(x => x.trim()).filter(Boolean);
      if (parts.length >= 2) {
        if (!city) city = parts[0];
        if (!country) country = parts[parts.length - 1];
      } else if (!country) country = loc.trim();
    }
    if (isPlaceholderOriginText(country)) country = '';
    if (isPlaceholderOriginText(city)) city = '';
    if (country) country = normalizeCountryName(country);
    return { country, city };
  }

  /** Ordered: longer / more specific brand phrases first. */
  const BRAND_ORIGIN_HINTS = [
    ['eileen fisher', 'USA', ''],
    ['organic valley', 'USA', ''],
    ['levi', 'Bangladesh', ''],
    ['everlane', 'USA', ''],
    ['fairphone', 'China', ''],
    ['patagonia', 'Vietnam', ''],
    ['primark', 'Bangladesh', ''],
    ['allbirds', 'China', ''],
    ['microsoft', 'USA', 'Redmond'],
    ['google', 'USA', 'Mountain View'],
    ['samsung', 'Vietnam', ''],
    ['apple', 'China', 'Shenzhen'],
    ['adidas', 'Vietnam', ''],
    ['puma', 'Vietnam', ''],
    ['nike', 'Vietnam', 'Ho Chi Minh City'],
    ['ikea', 'Sweden', 'Älmhult'],
    ['shein', 'China', 'Guangzhou'],
    ['uniqlo', 'China', 'Shanghai'],
    ['zara', 'Spain', 'Arteixo'],
    ['tesla', 'USA', 'Austin'],
    ['h&m', 'Bangladesh', 'Dhaka'],
    ['l\'oréal', 'France', ''],
    ['loreal', 'France', ''],
  ];

  function inferOriginFromBrandCategory(brand, category) {
    const b = String(brand || '').toLowerCase();
    const c = String(category || '').toLowerCase();
    for (const [sub, co, ci] of BRAND_ORIGIN_HINTS) {
      if (b.includes(sub)) return { country: co, city: ci };
    }
    if (c.includes('fashion') || c.includes('apparel') || c.includes('clothing')) return { country: 'Vietnam', city: '' };
    if (c.includes('electronic')) return { country: 'China', city: '' };
    if (c.includes('food')) return { country: 'USA', city: '' };
    if (c.includes('beauty') || c.includes('cosmetic')) return { country: 'France', city: '' };
    if (c.includes('home') || c.includes('furniture')) return { country: 'China', city: '' };
    if (c.includes('consumer')) return { country: 'China', city: '' };
    return { country: 'China', city: '' };
  }

  function mergeOriginIntoScanData(data) {
    if (!data || typeof data !== 'object') return data;
    const ext = extractOriginFromScanData(data);
    let country = ext.country;
    let city = ext.city;
    if (!country) {
      const fb = inferOriginFromBrandCategory(data.brand, data.category);
      country = fb.country;
      if (!city) city = fb.city;
    }
    if (country) country = normalizeCountryName(country);
    return { ...data, origin_country: country, origin_city: city };
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(a));
  }

  function recordUpload() {
    applyPurchaseFootprint(52);
  }

  function addRecentAudit(name, grade) {
    const list = document.getElementById('recentAuditsList');
    if (!list) return;
    const empty = list.querySelector('.empty-state');
    if (empty) empty.remove();

    const gc = grade.charAt(0);
    const cls = gc === 'A' ? 'score-a' : gc === 'B' ? 'score-b' : gc === 'C' ? 'score-c' : 'score-d';
    const thumbClass = ['fashion', 'electronics', 'food', 'beauty'][Math.floor(Math.random() * 4)];

    const el = document.createElement('div');
    el.className = 'audit-item';
    el.style.animation = 'slideIn .22s ease';
    el.innerHTML = `
      <div class="audit-thumb ${thumbClass}"></div>
      <div class="audit-info">
        <div class="audit-name">${name}</div>
        <div class="audit-brand">Scanned just now</div>
      </div>
      <div class="audit-score ${cls}">${grade}</div>`;
    list.prepend(el);

    while (list.children.length > 5) list.removeChild(list.lastChild);
  }

  function addGreenwashAlert(name) {
    const list = document.getElementById('greenwashAlertsList');
    if (!list) return;
    const empty = list.querySelector('.empty-state');
    if (empty) empty.remove();

    const el = document.createElement('div');
    el.className = 'alert-item warning';
    el.style.animation = 'slideIn .22s ease';
    el.innerHTML = `
      <div class="alert-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      </div>
      <div class="alert-body">
        <div class="alert-title">Greenwash risk detected</div>
        <div class="alert-sub">${name} — unverified sustainability claims</div>
      </div>
      <span class="alert-time">Just now</span>`;
    list.prepend(el);
    while (list.children.length > 5) list.removeChild(list.lastChild);
  }

  refreshAllUI();

  /* ── ESG Brand Audit ── */
  const scanResult = document.getElementById('scannerResult');

  /* ── ESG Scanner — Real brand data ──────────────────────────────────────
     Sources:
       Patagonia  — B Lab Global (B Corp 151.4), Good On You "Good" (2025),
                    SBTi verified, bluesign®, Fair Trade certified
       H&M        — Good On You "Not Good Enough" (Jan 2026), GHG +6% in 2024,
                    Norway court + EU greenwashing findings
       Apple      — MSCI BBB, Sustainalytics 16.9 Low Risk,
                    Corporate ops carbon-neutral since 2020, EPEAT Gold
       Nike       — Good On You "It's a Start" (Jan 2026), MSCI BB,
                    Sustainalytics 18.7 Medium Risk; People "Not Good Enough"
       Eileen Fisher — B Corp 109.4 (all-time high, 4th recert 2024),
                    SBTi Scope 3 exceeded target (51% vs 25%)
       Organic Valley — USDA Organic / Oregon Tilth, 100% renewable electricity,
                    farmer co-op (NOT B Corp — common misconception)
       L'Oreal    — MSCI AA, Sustainalytics 20.1 Medium Risk,
                    Leaping Bunny at parent level: NO (China retail presence)
       Fairphone  — B Corp 136.8, EcoVadis Platinum 2024 (top 1% of 114,000),
                    GHG -48% since 2022
  ── */
  /* ── Expanded brand database ── */
  const { brandData, getBrandKey } = window.ecoBrandData;

  const esgOverlay = document.getElementById('esgOverlay');
  const esgOverlayClose = document.getElementById('esgOverlayClose');
  const esgBackdrop = esgOverlay?.querySelector('.esg-overlay-backdrop');

  function openEsgOverlay() { esgOverlay?.classList.add('open'); }
  function closeEsgOverlay() { esgOverlay?.classList.remove('open'); }
  if (esgOverlayClose) esgOverlayClose.addEventListener('click', closeEsgOverlay);
  if (esgBackdrop) esgBackdrop.addEventListener('click', closeEsgOverlay);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeEsgOverlay(); });

  function renderResult(data) {
    const ai = !!data.isAI;
    const txt = v => ai ? esc(v) : v; // curated database text may contain intentional <strong> tags
    scanResult.innerHTML = `
      <div class="result-header">
        <div class="result-brand-info">
          <div class="result-brand-icon" style="background:${ai ? '#3F5A48' : data.gradientEnd}">${esc(data.initial)}</div>
          <div>
            <div class="result-brand-name">${txt(data.name)} ${provenanceBadge(ai)}</div>
            <div class="result-brand-type">${txt(data.type)}</div>
          </div>
        </div>
        <div class="result-grade ${data.gradeClass}">${data.grade}</div>
      </div>
      <div class="result-metrics">
        ${data.metrics.map(m => `
          <div class="metric-row">
            <span class="metric-name">${esc(m.name)}</span>
            <div class="metric-bar-wrap">
              <div class="metric-bar" style="width:0%; background:${scoreColor(m.score)}" data-target="${m.score}"></div>
            </div>
            <span class="metric-score">${m.score}%</span>
          </div>
        `).join('')}
      </div>
      <div class="result-claims">
        <h4>Claims <span style="font-weight:400;font-size:11px;color:var(--gray-600);margin-left:6px;">Source: ${txt(data.source)}</span></h4>
        ${data.claims.map(c => `<div class="claim ${esc(c.status)}">
            ${claimDot(c.status)}
            <span>${txt(c.text)}</span>
          </div>`).join('')}
      </div>
    `;
    openEsgOverlay();
    requestAnimationFrame(() => {
      scanResult.querySelectorAll('.metric-bar[data-target]').forEach(bar => {
        setTimeout(() => { bar.style.width = bar.dataset.target + '%'; }, 100);
      });
    });
  }

  async function fetchAIBrandAudit(query) {
    const prompt = `You are an ESG sustainability analyst. Audit the brand "${query}" and return a JSON object with these exact fields:
{
  "name": "Official brand name",
  "type": "Industry · key ESG rating · key certification",
  "grade": "A/A-/B+/B/B-/C+/C/C-/D+/D/D-/F",
  "gradeClass": "grade-a or grade-b or grade-c or grade-d",
  "initial": "First letter",
  "gradientStart": "hex color",
  "gradientEnd": "darker hex color",
  "metrics": [
    {"name": "Carbon & Climate", "score": 0-100, "color": "hex"},
    {"name": "Supply Chain Transparency", "score": 0-100, "color": "hex"},
    {"name": "Labour Rights", "score": 0-100, "color": "hex"},
    {"name": "Material Sustainability", "score": 0-100, "color": "hex"},
    {"name": "Packaging & Waste", "score": 0-100, "color": "hex"}
  ],
  "claims": [
    {"status": "verified or partial or negative", "text": "HTML-formatted claim with <strong> tags for emphasis"}
  ],
  "source": "Source citations"
}
Use real data from MSCI, Sustainalytics, B Lab, Good On You, CDP, SBTi, and brand sustainability reports. Use green hex colors (#52B788, #74C69D, #A5D6A7) for scores above 70, yellow (#FFF176, #FFCC80) for 40-70, red (#EF9A9A) for below 40. Include 3-4 claims. Use status "verified" for confirmed positive practices (green), "partial" for concerning or unverified claims (yellow), and "negative" for clearly bad findings like labour violations, greenwashing, rising emissions, or lack of transparency (red). Return ONLY valid JSON, no markdown.`;

    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const json = await res.json();
      const text = json.content?.[0]?.text || '';
      const match = text.match(/\{[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : null;
    } catch { return null; }
  }

  function renderAIResult(data, query) {
    if (!data) {
      scanResult.innerHTML = `
        <div class="result-header">
          <div class="result-brand-info">
            <div class="result-brand-icon" style="background:#455A64">${esc(query.charAt(0).toUpperCase())}</div>
            <div>
              <div class="result-brand-name">${query}</div>
              <div class="result-brand-type">Could not retrieve data — try another brand name</div>
            </div>
          </div>
          <div class="result-grade grade-c">?</div>
        </div>
        <div style="background:#FFF8E1;border-left:3px solid #F9A825;padding:10px 14px;border-radius:6px;margin:12px 0;font-size:12px;color:#5D4037;">
          Could not generate a sustainability audit for <strong>${esc(query)}</strong>. Try a more specific brand name.
        </div>`;
      return;
    }

    data.isAI = true;
    renderResult(data);
  }

  async function runScan(query) {
    if (!query) return;

    const key  = getBrandKey(query);
    const data = key ? brandData[key] : null;

    if (data) {
      renderResult(data);
      const hasGW = data.claims?.some(c => c.status !== 'verified');
      recordScan(data.name, data.grade, hasGW);
    } else {
      scanResult.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;padding:24px;">
          <div class="ac-loading-dot"></div><div class="ac-loading-dot"></div><div class="ac-loading-dot"></div>
          <span style="color:var(--gray-600);font-size:13px;">AI is auditing <strong>${query}</strong> — analyzing ESG data from MSCI, Sustainalytics, CDP, Good On You…</span>
        </div>`;
      openEsgOverlay();
      const aiData = await fetchAIBrandAudit(query);
      renderAIResult(aiData, query);
      if (aiData) {
        const hasGW = aiData.claims?.some(c => c.status !== 'verified');
        recordScan(aiData.name || query, aiData.grade || 'C', hasGW);
      }
    }
  }

  /* ── Brand row click → open ESG report, remove → delete row ── */
  function bindBrandRowEvents() {
    document.querySelectorAll('.brands-table tbody tr').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('.brand-remove-btn')) return;
        if (e.target.closest('.gw-warn-btn')) return;
        const brandKey = row.dataset.brand;
        if (brandKey && brandData[brandKey]) {
          renderResult(brandData[brandKey]);
        } else {
          const name = row.querySelector('.brand-cell')?.textContent.trim();
          if (name) runScan(name);
        }
      });
      row.querySelector('.brand-remove-btn')?.addEventListener('click', e => {
        e.stopPropagation();
        row.style.transition = 'opacity .25s, transform .25s';
        row.style.opacity = '0';
        row.style.transform = 'translateX(20px)';
        setTimeout(() => row.remove(), 260);
      });
    });
  }
  bindBrandRowEvents();

  /* ── "See all →" dashboard links ── */
  document.querySelectorAll('[data-nav]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const target = link.dataset.nav;
      navItems.forEach(n => n.classList.remove('active'));
      pages.forEach(p => p.classList.remove('active'));
      const navBtn = document.querySelector(`[data-page="${target}"]`);
      if (navBtn) navBtn.classList.add('active');
      const page = document.getElementById('page-' + target);
      if (page) page.classList.add('active');
      if (pageTitle) pageTitle.textContent = pageTitles[target] || target;
    });
  });

  /* ── Brand table filter ── */
  const categoryMap = {
    'all categories': null,
    'fashion': 'fashion',
    'electronics': 'electronics',
    'food & beverage': 'food',
    'beauty': 'beauty',
    'home goods': 'home',
  };

  function applyBrandFilters() {
    const q   = (document.getElementById('brandFilter')?.value || '').toLowerCase();
    const raw = (document.querySelector('.brand-category-select')?.value || '').toLowerCase();
    const cat = categoryMap[raw] || null;
    document.querySelectorAll('.brands-table tbody tr').forEach(row => {
      const name     = row.querySelector('.brand-cell')?.textContent.toLowerCase() || '';
      const catCell  = row.querySelector('.cat-tag')?.textContent.toLowerCase() || '';
      const nameOk   = name.includes(q);
      const catOk    = !cat || catCell === cat;
      row.style.display = (nameOk && catOk) ? '' : 'none';
    });
  }

  /* ── Brand Sort ── */
  const gradeOrder = { 'A': 0, 'A-': 1, 'B+': 2, 'B': 3, 'B-': 4, 'C+': 5, 'C': 6, 'C-': 7, 'D+': 8, 'D': 9, 'D-': 10, 'F': 11 };
  const gwOrder = { 'high': 0, 'low': 1, 'none': 2 };

  function sortBrandsTable(sortVal) {
    const tbody = document.querySelector('.brands-table tbody');
    if (!tbody || !sortVal) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort((a, b) => {
      switch (sortVal) {
        case 'name-asc':  return (a.querySelector('.brand-cell')?.textContent.trim() || '').localeCompare(b.querySelector('.brand-cell')?.textContent.trim() || '');
        case 'name-desc': return (b.querySelector('.brand-cell')?.textContent.trim() || '').localeCompare(a.querySelector('.brand-cell')?.textContent.trim() || '');
        case 'grade-asc': return (gradeOrder[a.querySelector('.grade')?.textContent.trim()] ?? 99) - (gradeOrder[b.querySelector('.grade')?.textContent.trim()] ?? 99);
        case 'grade-desc': return (gradeOrder[b.querySelector('.grade')?.textContent.trim()] ?? 99) - (gradeOrder[a.querySelector('.grade')?.textContent.trim()] ?? 99);
        case 'carbon-desc': return parseFloat(b.cells[3]?.textContent) - parseFloat(a.cells[3]?.textContent);
        case 'labour-desc': return parseFloat(b.cells[4]?.textContent) - parseFloat(a.cells[4]?.textContent);
        case 'materials-desc': return parseFloat(b.cells[5]?.textContent) - parseFloat(a.cells[5]?.textContent);
        case 'gw-first': return (gwOrder[a.dataset.gw] ?? 2) - (gwOrder[b.dataset.gw] ?? 2);
        default: return 0;
      }
    });
    rows.forEach(r => tbody.appendChild(r));
  }

  document.getElementById('brandSort')?.addEventListener('change', e => sortBrandsTable(e.target.value));

  /* ── Greenwashing Popup ── */
  const gwOverlay = document.getElementById('gwPopupOverlay');
  const gwTitle   = document.getElementById('gwPopupTitle');
  const gwBody    = document.getElementById('gwPopupBody');
  const gwClose   = document.getElementById('gwPopupClose');

  document.querySelector('.brands-table')?.addEventListener('click', e => {
    const btn = e.target.closest('.gw-warn-btn');
    if (!btn) return;
    e.stopPropagation();
    const row = btn.closest('tr');
    const brandCell = row.querySelector('.brand-cell');
    // Get text node content only (skip the logo letter inside .brand-logo or img)
    const brandName = Array.from(brandCell?.childNodes || [])
      .filter(n => n.nodeType === Node.TEXT_NODE)
      .map(n => n.textContent.trim()).filter(Boolean).join('') ||
      brandCell?.textContent.replace(/^[A-Z]\s*/, '').split('✦')[0].trim() || 'This brand';
    const text = row.dataset.gwText || '';
    gwTitle.textContent = `${brandName}: greenwashing concerns`;
    gwBody.textContent = text;
    gwOverlay.classList.add('open');
  });

  gwClose?.addEventListener('click', () => gwOverlay.classList.remove('open'));
  gwOverlay?.addEventListener('click', e => { if (e.target === gwOverlay) gwOverlay.classList.remove('open'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') gwOverlay?.classList.remove('open'); });

  const brandFilterInput = document.getElementById('brandFilter');
  const brandAC = document.getElementById('brandAutocomplete');
  let brandAcCache = {};

  function closeBrandAC() { brandAC.classList.remove('open'); brandAC.innerHTML = ''; }

  async function fetchBrandSuggestions(query) {
    if (brandAcCache[query.toLowerCase()]) return brandAcCache[query.toLowerCase()];

    const prompt = `You are a sustainability analyst. The user searched "${query}". Return a JSON array of up to 8 real brands that match or relate to this query. Each object must have: name (string), category (Fashion|Electronics|Food|Beauty|Home|Other), grade (A+, A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F), carbon (0-100 number), labour (0-100 number), materials (0-100 number), summary (short 10-word max description with key certifications/ratings). Focus on well-known real brands with real sustainability data. Return ONLY valid JSON, no markdown.`;

    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const json = await res.json();
      const text = json.content?.[0]?.text || '[]';
      const match = text.match(/\[[\s\S]*\]/);
      const brands = match ? JSON.parse(match[0]) : [];
      brandAcCache[query.toLowerCase()] = brands;
      return brands;
    } catch {
      return [];
    }
  }

  function gradeClass(g) {
    const c = g.charAt(0);
    if (c === 'A') return 'grade-a';
    if (c === 'B') return 'grade-b';
    if (c === 'C') return 'grade-c';
    return 'grade-d';
  }

  function catTagClass(cat) {
    const c = cat.toLowerCase();
    if (c === 'fashion') return 'fashion';
    if (c === 'electronics') return 'electronics';
    if (c === 'food') return 'food';
    if (c === 'beauty') return 'beauty';
    if (c === 'home') return 'home';
    return 'fashion';
  }

  function renderBrandAC(brands, query) {
    if (!brands.length) {
      brandAC.innerHTML = '<div class="ac-loading" style="color:var(--gray-400)">No brands found for "' + query + '"</div>';
      brandAC.classList.add('open');
      return;
    }
    brandAC.innerHTML = brands.map((b, i) => `
      <div class="ac-item" data-idx="${i}">
        <div class="ac-icon" style="background:${ b.grade.charAt(0) === 'A' ? '#2D6A4F' : b.grade.charAt(0) === 'B' ? '#1565C0' : b.grade.charAt(0) === 'C' ? '#E65100' : '#C62828' }">${b.name.charAt(0)}</div>
        <div class="ac-info">
          <div class="ac-name">${b.name} </div>
          <div class="ac-meta">${b.category} · ${b.summary || ''}</div>
        </div>
        <div class="ac-grade ${gradeClass(b.grade)}">${b.grade}</div>
      </div>`).join('');
    brandAC.classList.add('open');

    brandAC.querySelectorAll('.ac-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = +item.dataset.idx;
        const b = brands[idx];
        addBrandToTable(b);
        closeBrandAC();
        brandFilterInput.value = '';
        applyBrandFilters();
      });
    });
  }

  function addBrandToTable(b) {
    const tbody = document.querySelector('.brands-table tbody');
    if (!tbody) return;
    const existing = [...tbody.querySelectorAll('.brand-cell')].find(
      c => c.textContent.trim().toLowerCase() === b.name.toLowerCase()
    );
    if (existing) {
      existing.closest('tr').style.display = '';
      existing.closest('tr').classList.add('highlight-row');
      existing.closest('tr').scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => existing.closest('tr').classList.remove('highlight-row'), 2000);
      return;
    }

    const catClass = catTagClass(b.category);
    const gc = gradeClass(b.grade);
    const carbon = b.carbon || '—';
    const labour = b.labour || '—';
    const materials = b.materials || '—';
    const certs = b.summary || 'AI-sourced data';

    const tr = document.createElement('tr');
    tr.classList.add('highlight-row');
    tr.dataset.gw = 'loading';
    tr.dataset.gwText = '';
    tr.innerHTML = `
      <td><div class="brand-cell"><img class="brand-logo-img" src="https://icons.duckduckgo.com/ip3/${encodeURIComponent(b.name.toLowerCase().replace(/\s+/g,''))}.com.ico" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" alt=""><div class="brand-logo" style="display:none;background:${ b.grade.charAt(0) === 'A' ? '#2D6A4F' : b.grade.charAt(0) === 'B' ? '#1565C0' : b.grade.charAt(0) === 'C' ? '#E65100' : '#C62828' }">${b.name.charAt(0)}</div>${b.name}</div></td>
      <td><span class="cat-tag ${catClass}">${b.category}</span></td>
      <td><span class="grade ${gc}">${b.grade}</span></td>
      <td>${carbon}%</td><td>${labour}%</td><td>${materials}%</td>
      <td><span class="cert">${certs}</span></td>
      <td class="gw-cell" id="gw-cell-${b.name.replace(/\s+/g,'_')}"><span style="font-size:11px;color:#aaa">…</span></td>
      <td><button class="brand-remove-btn" title="Remove brand">&times;</button></td>`;
    tbody.prepend(tr);

    // Fetch greenwashing info from AI
    (async () => {
      try {
        const gwRes = await fetch('/api/claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-opus-4-6',
            max_tokens: 300,
            messages: [{ role: 'user', content: `Does the brand "${b.name}" engage in greenwashing? Reply with JSON only: {"risk":"none"|"low"|"high","summary":"1-2 sentence factual description of greenwashing concerns, or empty string if none"}` }]
          })
        });
        const gwData = await gwRes.json();
        const gwText = gwData.content?.[0]?.text || '{}';
        let gwJson = {};
        try { gwJson = JSON.parse(gwText.match(/\{[\s\S]*\}/)?.[0] || '{}'); } catch {}
        const risk = gwJson.risk || 'none';
        const summary = gwJson.summary || '';
        tr.dataset.gw = risk;
        tr.dataset.gwText = summary;
        const gwCell = document.getElementById(`gw-cell-${b.name.replace(/\s+/g,'_')}`);
        if (gwCell) {
          gwCell.innerHTML = risk === 'none'
            ? '<span class="gw-clean">Clean</span>'
            : `<button class="gw-warn-btn gw-${risk}" title="${risk === 'high' ? 'High' : 'Some'} greenwashing risk. Click for details.">${risk === 'high' ? 'High risk' : 'Some risk'}</button>`;
        }
      } catch {
        const gwCell = document.getElementById(`gw-cell-${b.name.replace(/\s+/g,'_')}`);
        if (gwCell) gwCell.innerHTML = '<span class="gw-clean">—</span>';
      }
    })();

    tr.addEventListener('click', e => {
      if (e.target.closest('.brand-remove-btn')) return;
      if (e.target.closest('.gw-warn-btn')) return;
      const name = tr.querySelector('.brand-cell')?.textContent.trim();
      if (name) runScan(name);
    });
    tr.querySelector('.brand-remove-btn').addEventListener('click', e => {
      e.stopPropagation();
      tr.style.transition = 'opacity .25s, transform .25s';
      tr.style.opacity = '0';
      tr.style.transform = 'translateX(20px)';
      setTimeout(() => tr.remove(), 260);
    });
    tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => tr.classList.remove('highlight-row'), 2500);
  }

  async function runBrandAISearch() {
    const q = brandFilterInput.value.trim();
    if (q.length < 2) return;

    brandAC.innerHTML = '<div class="ac-loading"><div class="ac-loading-dot"></div><div class="ac-loading-dot"></div><div class="ac-loading-dot"></div><span>Searching brands with AI…</span></div>';
    brandAC.classList.add('open');

    const brands = await fetchBrandSuggestions(q);
    renderBrandAC(brands, q);
  }

  if (brandFilterInput) {
    brandFilterInput.addEventListener('input', () => {
      applyBrandFilters();
      closeBrandAC();
    });

    brandFilterInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); runBrandAISearch(); }
      if (e.key === 'Escape') closeBrandAC();
    });

    const searchBtn = document.getElementById('brandSearchBtn');
    if (searchBtn) searchBtn.addEventListener('click', runBrandAISearch);

    document.addEventListener('click', e => {
      if (!brandFilterInput.contains(e.target) && !brandAC.contains(e.target) &&
          (!searchBtn || !searchBtn.contains(e.target))) closeBrandAC();
    });
  }

  const catSelect = document.querySelector('.brand-category-select');
  if (catSelect) {
    catSelect.addEventListener('change', () => {
      closeBrandAC();
      applyBrandFilters();
    });
  }

  /* ── Toggle switches ── */
  document.querySelectorAll('.toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('active');
      toggle.dataset.state = toggle.classList.contains('active') ? 'on' : 'off';
    });
  });

  /* ── Chart tabs — real data per period ── */
  const chartPaths = {
    '6M': {
      line: 'M0,140 C50,130 90,120 140,100 C190,80 230,70 280,75 C330,80 370,60 420,50 C470,40 510,45 560,38',
      area: 'M0,140 C50,130 90,120 140,100 C190,80 230,70 280,75 C330,80 370,60 420,50 C470,40 510,45 560,38 L560,180 L0,180 Z',
      labels: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'],
      pts: [{cx:0,cy:140},{cx:140,cy:100},{cx:280,cy:75},{cx:420,cy:50},{cx:560,cy:38}],
    },
    '1Y': {
      line: 'M0,162 C46,156 93,148 140,138 C187,127 234,114 280,104 C327,94 373,77 420,61 C467,46 513,41 560,38',
      area: 'M0,162 C46,156 93,148 140,138 C187,127 234,114 280,104 C327,94 373,77 420,61 C467,46 513,41 560,38 L560,180 L0,180 Z',
      labels: ['Apr', 'Jun', 'Aug', 'Oct', 'Dec', 'Mar'],
      pts: [{cx:0,cy:162},{cx:140,cy:138},{cx:280,cy:104},{cx:420,cy:61},{cx:560,cy:38}],
    },
    'All': {
      line: 'M0,170 C46,165 93,158 140,150 C187,141 234,130 280,118 C327,106 373,88 420,68 C467,52 513,43 560,38',
      area: 'M0,170 C46,165 93,158 140,150 C187,141 234,130 280,118 C327,106 373,88 420,68 C467,52 513,43 560,38 L560,180 L0,180 Z',
      labels: ["'22", "Q2'22", "'23", "Q2'23", "'24", "'25"],
      pts: [{cx:0,cy:170},{cx:140,cy:150},{cx:280,cy:118},{cx:420,cy:68},{cx:560,cy:38}],
    },
  };

  document.querySelectorAll('.chart-tab').forEach(tab => {
    tab.addEventListener('click', function () {
      this.closest('.chart-tabs').querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      const d = chartPaths[this.textContent.trim()];
      if (!d) return;
      const svg = document.querySelector('#footprintChart svg');
      if (!svg) return;
      const paths = svg.querySelectorAll('path');
      if (paths[0]) paths[0].setAttribute('d', d.area);
      if (paths[1]) paths[1].setAttribute('d', d.line);
      svg.querySelectorAll('circle').forEach((c, i) => {
        if (d.pts[i]) { c.setAttribute('cx', d.pts[i].cx); c.setAttribute('cy', d.pts[i].cy); }
      });
      document.querySelectorAll('.chart-labels span').forEach((s, i) => {
        if (d.labels[i]) s.textContent = d.labels[i];
      });
    });
  });

  /* ── Leaflet Map — Product Origins ── */
  const ecoMap = { map: null, userMarker: null, markers: [], routes: [], countryLayers: [] };

  function initLeafletMap(lat, lng, zoom) {
    if (ecoMap.map) { ecoMap.map.setView([lat, lng], zoom || 2); ecoMap.map.invalidateSize(); return; }

    ecoMap.map = L.map('leaflet-map', { zoomControl: true, worldCopyJump: true }).setView([lat, lng], zoom || 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(ecoMap.map);
  }

  function addUserPin(lat, lng) {
    if (ecoMap.userMarker) ecoMap.userMarker.remove();
    const icon = L.divIcon({ html: '<div class="user-map-pin"></div>', className: '', iconSize: [20,20], iconAnchor: [10,10] });
    ecoMap.userMarker = L.marker([lat, lng], { icon }).addTo(ecoMap.map).bindPopup('You are here');
  }

  function getOriginPurchases() {
    try {
      const key = (() => {
        try {
          const u = JSON.parse(localStorage.getItem('ecoaudit_user') || 'null');
          return 'ecoaudit_footprint_store:' + (u && u.email ? String(u.email).trim().toLowerCase() : 'guest');
        } catch { return 'ecoaudit_footprint_store:guest'; }
      })();
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const o = JSON.parse(raw);
      return (o.purchases || []).filter(p => p.originCountry);
    } catch { return []; }
  }

  function clearMapLayers() {
    ecoMap.markers.forEach(m => m.remove());
    ecoMap.routes.forEach(r => r.remove());
    ecoMap.countryLayers.forEach(l => l.remove());
    ecoMap.markers = [];
    ecoMap.routes = [];
    ecoMap.countryLayers = [];
  }

  /* Country name aliases so the GeoJSON name field matches what the AI returns */
  const COUNTRY_NAME_ALIASES = {
    'USA': 'United States of America', 'United States': 'United States of America',
    'UK': 'United Kingdom', 'South Korea': 'Korea',
    'Czech Republic': 'Czechia', 'UAE': 'United Arab Emirates',
  };

  let _worldGeoJSON = null;

  async function loadWorldGeoJSON() {
    if (_worldGeoJSON) return _worldGeoJSON;
    try {
      const res = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
      const topo = await res.json();
      _worldGeoJSON = topojson.feature(topo, topo.objects.countries);
      return _worldGeoJSON;
    } catch { return null; }
  }

  function findCountryFeature(geojson, countryName) {
    if (!geojson) return null;
    const target = (COUNTRY_NAME_ALIASES[countryName] || countryName).toLowerCase();
    return geojson.features.find(f => {
      const n = (f.properties?.name || '').toLowerCase();
      return n === target || n.includes(target) || target.includes(n);
    }) || null;
  }

  function addCountryShape(feature, pct) {
    const opacity = Math.min(0.5, 0.12 + pct / 100 * 0.42);
    const layer = L.geoJSON(feature, {
      style: {
        color: '#2D6A4F',
        weight: 2,
        fillColor: '#7FAE8A',
        fillOpacity: opacity,
        interactive: false,
      },
    }).addTo(ecoMap.map);
    ecoMap.countryLayers.push(layer);
  }

  async function renderOriginMap() {
    if (!ecoMap.map) return;
    clearMapLayers();

    const purchases = getOriginPurchases();
    const userPos = getUserCoords();
    const showRoutes = document.getElementById('showShippingRoutes')?.checked !== false;

    addUserPin(userPos[0], userPos[1]);

    const countryGroups = {};
    for (const p of purchases) {
      const c = normalizeCountryName(p.originCountry.trim());
      if (!c) continue;
      if (!countryGroups[c]) countryGroups[c] = { items: [], coords: getCountryCoords(c) };
      countryGroups[c].items.push(p);
    }

    const total = purchases.length;
    const entries = Object.entries(countryGroups).sort((a, b) => b[1].items.length - a[1].items.length);

    const totalLabel = document.getElementById('originTotalLabel');
    if (totalLabel) totalLabel.textContent = `${total} product${total !== 1 ? 's' : ''} tracked`;

    const sidebarList = document.getElementById('originCountryList');
    const emptyMsg = document.getElementById('originSidebarEmpty');
    const shipTotalEl = document.getElementById('originShipTotal');
    const avgDistEl = document.getElementById('originAvgDist');

    const world = await loadWorldGeoJSON();

    let totalShipCO2 = 0;
    let totalDist = 0;
    let countryCount = 0;
    let listHTML = '';
    const colors = ['#2D6A4F', '#40916C', '#7FAE8A', '#74C69D', '#95D5B2', '#B7E4C7', '#D8F3DC', '#A5835A', '#D4A373', '#CCD5AE'];

    for (const [country, group] of entries) {
      if (!group.coords) continue;
      const [lat, lng] = group.coords;
      const count = group.items.length;
      const pct = total > 0 ? (count / total) * 100 : 0;
      const dist = haversineKm(userPos[0], userPos[1], lat, lng);
      const co2 = dist * 0.00005 * count;
      totalShipCO2 += co2;
      totalDist += dist * count;
      countryCount += count;

      const feature = findCountryFeature(world, country);
      if (feature) addCountryShape(feature, pct);

      const pinW = pct >= 10 ? 64 : 56;
      const icon = L.divIcon({
        html: `<div class="origin-map-pin"><span class="origin-pin-count">${count}</span><span class="origin-pin-pct">${pct.toFixed(0)}%</span></div>`,
        className: 'origin-pin-wrap', iconSize: [pinW, 28], iconAnchor: [pinW / 2, 14],
      });

      const popupLines = group.items.slice(0, 6).map(p =>
        `<span style="font-size:12px;line-height:1.4">${p.aiName || 'Product'} — ${p.aiBrand || '?'}</span>`
      ).join('<br>');

      const m = L.marker([lat, lng], { icon })
        .bindPopup(
          `<div style="min-width:180px"><b>${country}</b><br>` +
          `<span style="font-size:13px;color:#2D6A4F;font-weight:600">${pct.toFixed(1)}% of purchases · ${count} item${count !== 1 ? 's' : ''}</span><br><br>` +
          `${popupLines}${count > 6 ? '<br><em style="font-size:11px;color:#888">…and ' + (count - 6) + ' more</em>' : ''}` +
          `<br><br><small style="color:#666">~${Math.round(dist).toLocaleString()} km · ~${co2.toFixed(2)} kg CO₂e</small></div>`
        )
        .addTo(ecoMap.map);
      ecoMap.markers.push(m);

      if (showRoutes) {
        const route = L.polyline([[userPos[0], userPos[1]], [lat, lng]], {
          color: '#D4A373', weight: 2, opacity: 0.5, dashArray: '6 4',
        }).addTo(ecoMap.map);
        ecoMap.routes.push(route);
      }

      const ci = entries.findIndex(e => e[0] === country);
      listHTML += `
        <div class="origin-country-row" data-lat="${lat}" data-lng="${lng}">
          <div class="origin-country-top">
            <span class="origin-country-name">${country}</span>
            <span class="origin-country-pct">${pct.toFixed(1)}%</span>
          </div>
          <div class="origin-country-bar-wrap">
            <div class="origin-country-bar" style="width:${pct}%;background:${colors[ci % colors.length]}"></div>
          </div>
          <div class="origin-country-meta">${count} item${count !== 1 ? 's' : ''} · ${Math.round(dist).toLocaleString()} km · ~${co2.toFixed(2)} kg CO₂</div>
        </div>`;
    }

    if (sidebarList) {
      if (entries.length && listHTML) {
        if (emptyMsg) emptyMsg.style.display = 'none';
        sidebarList.innerHTML = listHTML;
        sidebarList.querySelectorAll('.origin-country-row').forEach(row => {
          row.addEventListener('click', () => {
            const lt = +row.dataset.lat, ln = +row.dataset.lng;
            if (lt && ln) ecoMap.map.setView([lt, ln], 4);
          });
        });
      } else {
        if (emptyMsg) emptyMsg.style.display = '';
        sidebarList.querySelectorAll('.origin-country-row').forEach(r => r.remove());
      }
    }

    if (shipTotalEl) shipTotalEl.textContent = totalShipCO2.toFixed(1) + ' kg';
    if (avgDistEl) avgDistEl.textContent = countryCount > 0
      ? Math.round(totalDist / countryCount).toLocaleString() + ' km'
      : '—';

    if (ecoMap.markers.length) {
      const bounds = L.latLngBounds(ecoMap.markers.map(m => m.getLatLng()));
      bounds.extend(L.latLng(userPos[0], userPos[1]));
      ecoMap.map.fitBounds(bounds.pad(0.2));
    }
  }

  // Init map when map page is opened — auto-show origins
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      if (item.dataset.page === 'map') {
        setTimeout(() => {
          const userPos = getUserCoords();
          if (!ecoMap.map) initLeafletMap(userPos[0], userPos[1], 2);
          else ecoMap.map.invalidateSize();
          renderOriginMap();
        }, 150);
      }
    });
  });

  // Locate Me button
  document.getElementById('locateBtn')?.addEventListener('click', function () {
    if (!navigator.geolocation) { alert('Geolocation not supported in this browser.'); return; }
    const btn = this;
    btn.textContent = 'Locating…';
    btn.disabled = true;

    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      try {
        const u = JSON.parse(localStorage.getItem('ecoaudit_user') || '{}');
        u.lat = lat; u.lng = lng;
        localStorage.setItem('ecoaudit_user', JSON.stringify(u));
      } catch {}
      addUserPin(lat, lng);
      renderOriginMap();
      btn.textContent = 'Location updated';
      setTimeout(() => { btn.textContent = 'Use My Location'; btn.disabled = false; }, 3000);
    }, err => {
      btn.textContent = 'Use My Location'; btn.disabled = false;
      const msgs = { 1: 'Location access denied.', 2: 'Location unavailable.', 3: 'Request timed out.' };
      alert(msgs[err.code] || 'Could not get location.');
    }, { timeout: 12000 });
  });

  document.getElementById('showShippingRoutes')?.addEventListener('change', () => {
    renderOriginMap();
  });

  /* ── Animate footprint bars on page switch ── */
  document.querySelectorAll('[data-page="track"], [data-page="library"]').forEach(item => {
    item.addEventListener('click', () => {
      const el = document.getElementById('footprintAccountEmail');
      if (el) {
        try {
          const u = JSON.parse(localStorage.getItem('ecoaudit_user') || 'null');
          el.textContent = u && u.email ? String(u.email).trim().toLowerCase() : 'Not linked — sign in from the landing page to attach imports to your email';
        } catch { /* ignore */ }
      }
      setTimeout(() => {
        document.querySelectorAll('.fp-bar').forEach(bar => {
          const w = bar.style.width;
          bar.style.width = '0%';
          requestAnimationFrame(() => {
            setTimeout(() => { bar.style.width = w; }, 50);
          });
        });
      }, 50);
    });
  });

  /* ── Receipt / Shopping Tracker (AI Vision + email / .eml indexing) ── */
  (function () {
    const zone  = document.getElementById('uploadZone');
    const input = document.getElementById('receiptInput');
    const list  = document.getElementById('purchaseList');
    if (!zone || !input || !list) return;

    const PURCHASE_STORE_V = 1;

    function getAccountEmail() {
      try {
        const u = JSON.parse(localStorage.getItem('ecoaudit_user') || 'null');
        return u && u.email ? String(u.email).trim().toLowerCase() : '';
      } catch { return ''; }
    }

    function purchaseStorageKey() {
      return 'ecoaudit_footprint_store:' + (getAccountEmail() || 'guest');
    }

    let emailIndexEntries = [];

    function loadPurchaseStore() {
      try {
        const raw = localStorage.getItem(purchaseStorageKey());
        if (!raw) return { purchases: [], emailIndex: [] };
        const o = JSON.parse(raw);
        return {
          purchases: Array.isArray(o.purchases) ? o.purchases : [],
          emailIndex: Array.isArray(o.emailIndex) ? o.emailIndex : [],
        };
      } catch { return { purchases: [], emailIndex: [] }; }
    }

    function savePurchaseStore(purchases, emailIndex) {
      localStorage.setItem(purchaseStorageKey(), JSON.stringify({
        v: PURCHASE_STORE_V,
        purchases,
        emailIndex,
      }));
    }

    function deriveCreatedAtFromId(id) {
      const m = String(id || '').match(/^p_([0-9a-z]+)_/i);
      if (!m) return '';
      const ms = parseInt(m[1], 36);
      return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
    }

    function parseCreatedAtMs(iso) {
      if (!iso) return 0;
      const t = Date.parse(iso);
      return Number.isFinite(t) ? t : 0;
    }

    function renderLibraryTable() {
      const tbody = document.getElementById('productsLibraryBody');
      if (!tbody) return;
      const rows = [...list.querySelectorAll('.purchase-item:not(.purchase-item--processing)')];
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="library-empty">No products yet. Use Upload Products to add items.</td></tr>';
        return;
      }
      const sortKey = (document.getElementById('librarySort') && document.getElementById('librarySort').value) || 'dateDesc';
      const enriched = rows.map(el => {
        const d = el.dataset;
        const createdAt = d.createdAt || deriveCreatedAtFromId(d.purchaseId) || '';
        const origin = [d.originCity, d.originCountry].filter(Boolean).join(', ') || '—';
        const src = d.source === 'email' ? 'Email' : 'Upload';
        return {
          el,
          id: d.purchaseId || '',
          name: d.aiName || '—',
          brand: d.aiBrand || '—',
          category: d.aiCategory || '—',
          score: +d.aiScore || 0,
          origin,
          source: src,
          createdAt,
        };
      });
      enriched.sort((a, b) => {
        switch (sortKey) {
          case 'nameAsc':
            return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
          case 'nameDesc':
            return (b.name || '').localeCompare(a.name || '', undefined, { sensitivity: 'base' });
          case 'brandAsc':
            return (a.brand || '').localeCompare(b.brand || '', undefined, { sensitivity: 'base' });
          case 'scoreDesc':
            return b.score - a.score;
          case 'scoreAsc':
            return a.score - b.score;
          case 'dateAsc':
            return parseCreatedAtMs(a.createdAt) - parseCreatedAtMs(b.createdAt);
          case 'dateDesc':
          default:
            return parseCreatedAtMs(b.createdAt) - parseCreatedAtMs(a.createdAt);
        }
      });
      tbody.innerHTML = enriched.map(({ id, name, brand, category, score, origin, source, createdAt }) => {
        const dateStr = parseCreatedAtMs(createdAt)
          ? new Date(createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
          : '—';
        const esc = s => escapeHtml(s == null ? '' : String(s));
        const attrId = String(id || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        return `<tr class="library-row" data-purchase-id="${attrId}" tabindex="0" role="button">
          <td class="lib-cell-name">${esc(name)}</td>
          <td>${esc(brand)}</td>
          <td>${esc(category)}</td>
          <td><span class="lib-score">${esc(String(score))}/100</span></td>
          <td>${esc(origin)}</td>
          <td>${esc(source)}</td>
          <td>${esc(dateStr)}</td>
          <td class="library-actions-cell">
            <button type="button" class="library-delete-btn" data-purchase-id="${attrId}" aria-label="Remove from library">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
          </td>
        </tr>`;
      }).join('');
      tbody.querySelectorAll('.library-row').forEach(tr => {
        tr.addEventListener('click', ev => {
          if (ev.target.closest('.library-delete-btn')) return;
          const pid = tr.dataset.purchaseId;
          if (!pid) return;
          const escSel = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(pid) : pid.replace(/"/g, '\\"');
          const el = list.querySelector('.purchase-item[data-purchase-id="' + escSel + '"]');
          if (el) openItemReport(el);
        });
        tr.addEventListener('keydown', ev => {
          if (ev.target.closest('.library-delete-btn')) return;
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            tr.click();
          }
        });
      });
      tbody.querySelectorAll('.library-delete-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const pid = btn.dataset.purchaseId;
          if (!pid || !confirm('Remove this product from your products?')) return;
          const escSel = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(pid) : pid.replace(/"/g, '\\"');
          const el = list.querySelector('.purchase-item[data-purchase-id="' + escSel + '"]');
          if (el) {
            el.remove();
            persistAll();
          }
        });
      });
    }

    window.ecoauditRefreshLibrary = renderLibraryTable;

    function persistAll() {
      const rows = [...list.querySelectorAll('.purchase-item:not(.purchase-item--processing)')];
      const purchases = rows.map(serializePurchaseRow);
      savePurchaseStore(purchases, emailIndexEntries);
      refreshAllUI();
      renderLibraryTable();
    }

    function pushEmailIndex(entry) {
      emailIndexEntries.unshift(entry);
      if (emailIndexEntries.length > 80) emailIndexEntries.length = 80;
      renderEmailIndex();
    }

    function renderEmailIndex() {
      const ul = document.getElementById('emailIndexList');
      const empty = document.getElementById('emailIndexEmpty');
      if (!ul || !empty) return;
      if (!emailIndexEntries.length) {
        empty.style.display = '';
        ul.innerHTML = '';
        return;
      }
      empty.style.display = 'none';
      ul.innerHTML = emailIndexEntries.map(e => `
        <li class="email-index-item">
          <div class="email-index-main">
            <span class="email-index-subj">${escapeHtml(e.subject)}</span>
            <span class="email-index-meta">${escapeHtml(e.from)} · ${e.itemCount} item${e.itemCount === 1 ? '' : 's'} · ${new Date(e.createdAt).toLocaleString()}</span>
          </div>
        </li>`).join('');
    }

    function escapeHtml(s) {
      const d = document.createElement('div');
      d.textContent = s == null ? '' : String(s);
      return d.innerHTML;
    }

    function serializePurchaseRow(el) {
      const d = el.dataset;
      let img = d.imgSrc || '';
      if (img.startsWith('data:') && img.length > 120000) img = '';
      return {
        id: d.purchaseId || '',
        source: d.source || 'upload',
        emailImportId: d.emailImportId || '',
        emailSubject: d.emailSubject || '',
        emailFrom: d.emailFrom || '',
        aiName: d.aiName,
        aiBrand: d.aiBrand,
        aiScore: d.aiScore,
        aiGrade: d.aiGrade,
        aiGradeClass: d.aiGradeClass,
        aiSummary: d.aiSummary,
        aiMaterials: d.aiMaterials,
        aiConcerns: d.aiConcerns,
        aiPositives: d.aiPositives,
        aiCategory: d.aiCategory,
        originCountry: d.originCountry || '',
        originCity: d.originCity || '',
        imgSrc: img,
        createdAt: d.createdAt || '',
      };
    }

    function newPurchaseId() {
      return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
    }

    function gradeFromScore(s) {
      const grade = s >= 80 ? 'A' : s >= 65 ? 'B' : s >= 50 ? 'C' : s >= 35 ? 'D' : 'F';
      const cls   = s >= 80 ? 'grade-a' : s >= 65 ? 'grade-b' : s >= 50 ? 'grade-c' : 'grade-d';
      return { grade, cls };
    }

    const COUNTRY_COORDS = {
      'China': [35.86, 104.20], 'Vietnam': [14.06, 108.28], 'Bangladesh': [23.68, 90.36],
      'India': [20.59, 78.96], 'Indonesia': [0.79, 113.92], 'Turkey': [38.96, 35.24],
      'Thailand': [15.87, 100.99], 'Cambodia': [12.57, 104.99], 'Pakistan': [30.38, 69.35],
      'Myanmar': [21.91, 95.96], 'Sri Lanka': [7.87, 80.77], 'Philippines': [12.88, 121.77],
      'Malaysia': [4.21, 101.98], 'Mexico': [23.63, -102.55], 'Brazil': [-14.24, -51.93],
      'Italy': [41.87, 12.57], 'Germany': [51.17, 10.45], 'France': [46.23, 2.21],
      'Spain': [40.46, -3.75], 'Portugal': [39.40, -8.22], 'United Kingdom': [55.38, -3.44],
      'USA': [37.09, -95.71], 'United States': [37.09, -95.71], 'Canada': [56.13, -106.35],
      'Japan': [36.20, 138.25], 'South Korea': [35.91, 127.77], 'Taiwan': [23.70, 120.96],
      'Australia': [-25.27, 133.78], 'New Zealand': [-40.90, 174.89], 'South Africa': [-30.56, 22.94],
      'Egypt': [26.82, 30.80], 'Morocco': [31.79, -7.09], 'Ethiopia': [9.15, 40.49],
      'Kenya': [-0.02, 37.91], 'Nigeria': [9.08, 8.68], 'Colombia': [4.57, -74.30],
      'Peru': [-9.19, -75.02], 'Chile': [-35.68, -71.54], 'Argentina': [-38.42, -63.62],
      'Sweden': [60.13, 18.64], 'Denmark': [56.26, 9.50], 'Netherlands': [52.13, 5.29],
      'Belgium': [50.50, 4.47], 'Switzerland': [46.82, 8.23], 'Poland': [51.92, 19.15],
      'Czech Republic': [49.82, 15.47], 'Romania': [45.94, 24.97], 'Hungary': [47.16, 19.50],
      'Ireland': [53.14, -7.69], 'Norway': [60.47, 8.47], 'Finland': [61.92, 25.75],
      'Austria': [47.52, 14.55], 'Greece': [39.07, 21.82], 'Israel': [31.05, 34.85],
      'UAE': [23.42, 53.85], 'Saudi Arabia': [23.89, 45.08], 'Singapore': [1.35, 103.82],
      'Honduras': [15.20, -86.24], 'Guatemala': [15.78, -90.23], 'El Salvador': [13.79, -88.90],
      'Costa Rica': [9.75, -83.75], 'Dominican Republic': [18.74, -70.16],
    };

    function coordsForCountry(name) {
      if (!name) return null;
      const n = name.trim();
      if (COUNTRY_COORDS[n]) return COUNTRY_COORDS[n];
      const lower = n.toLowerCase();
      for (const [k, v] of Object.entries(COUNTRY_COORDS)) {
        if (k.toLowerCase() === lower) return v;
      }
      return null;
    }

    function fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    async function analyzeWithVision(base64DataUrl) {
      const mediaType = base64DataUrl.match(/^data:(image\/\w+);/)?.[1] || 'image/jpeg';
      const base64 = base64DataUrl.split(',')[1];
      try {
        const res = await fetch('/api/claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 800,
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
                { type: 'text', text: 'Analyze this product/receipt image for sustainability. Return ONLY a JSON object: {"name":"Product name (brand + item, max 6 words)","brand":"Brand name","category":"Fashion|Electronics|Food|Beauty|Home|Other","score":0-100,"grade":"A/B/C/D/F","summary":"One sentence sustainability assessment","materials":"Key materials spotted","concerns":"Any greenwashing or environmental concerns, or none","positives":"Any eco-friendly aspects spotted, or none","origin_country":"Best guess country where product was manufactured/sourced (e.g. China, Vietnam, USA, Italy). Use brand HQ country if unsure.","origin_city":"Best guess city of manufacture or brand HQ if unknown (e.g. Shenzhen, Ho Chi Minh City)"}. Be accurate about the brand and product. Return ONLY JSON.' }
              ],
            }],
          }),
        });
        const json = await res.json();
        const text = json.content?.[0]?.text || '';
        const match = text.match(/\{[\s\S]*\}/);
        return match ? JSON.parse(match[0]) : null;
      } catch { return null; }
    }

    function decodeQuotedPrintable(s) {
      return s
        .replace(/=\r?\n/g, '')
        .replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
    }

    function extractTextFromEml(raw) {
      const max = 95000;
      let t = raw.length > max * 2 ? raw.slice(0, max * 2) : raw;
      const b = t.match(/boundary=("{0,1})([^";\r\n]+)\1/i);
      if (b) {
        const boundary = b[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const segments = t.split(new RegExp('--' + boundary));
        for (const seg of segments) {
          if (/content-type:\s*text\/plain/i.test(seg)) {
            const parts = seg.split(/\r?\n\r?\n/);
            const body = parts.slice(1).join('\n');
            return decodeQuotedPrintable(body).trim().slice(0, max);
          }
        }
      }
      const hdrEnd = t.search(/\r?\n\r?\n/);
      const body = hdrEnd >= 0 ? t.slice(hdrEnd + 2) : t;
      return body.trim().slice(0, max);
    }

    async function analyzeOrderEmailWithClaude(emailBody, ctx) {
      const acct = getAccountEmail() || '(not linked — user may still paste their own mail)';
      const prompt =
        'You parse ecommerce order confirmations and shipping emails for a sustainability app.\n' +
        'Account email on file: ' + acct + '\n' +
        'Optional subject: ' + (ctx.subject || 'unknown') + '\n' +
        'Optional sender label: ' + (ctx.from || 'unknown') + '\n\n' +
        'Extract each DISTINCT physical product line. Skip pure fees, discounts-only lines, and boilerplate.\n' +
        'If you cannot split lines, return one representative item for the order.\n' +
        'For each item, estimate origin_country (country where the product was likely manufactured or sourced, e.g. China, Vietnam, USA) and origin_city (city of manufacture or brand HQ). Use the brand\'s known manufacturing base or HQ country if specifics are unclear.\n\n---EMAIL---\n' +
        emailBody.slice(0, 90000) +
        '\n---END---\n\nReturn ONLY JSON:\n' +
        '{"merchant":"string","order_ref":"string or null","detected_recipient_email":"string or null",' +
        '"items":[{"name":"string","brand":"string","category":"Fashion|Electronics|Food|Beauty|Home|Other",' +
        '"score":0-100,"grade":"A|B|C|D|F","summary":"string","materials":"string","concerns":"string","positives":"string",' +
        '"origin_country":"string","origin_city":"string"}]}';

      try {
        const res = await fetch('/api/claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
          }),
        });
        const json = await res.json();
        const text = json.content?.[0]?.text || '';
        const match = text.match(/\{[\s\S]*\}/);
        return match ? JSON.parse(match[0]) : null;
      } catch { return null; }
    }

    function createItemEl(file, dataUrl) {
      const ext  = file.name.split('.').pop().toLowerCase();
      const isImg = ['jpg','jpeg','png','gif','webp'].includes(ext);
      const size = file.size < 1024 ? `${file.size} B` : `${(file.size/1024).toFixed(0)} KB`;

      const el = document.createElement('div');
      el.className = 'purchase-item purchase-item--loading';
      el.innerHTML = buildPurchaseRowHTML(isImg, dataUrl, true);
      const metaEl = el.querySelector('.purchase-meta');
      if (metaEl) metaEl.textContent = `${size} · Scanning…`;
      const nameEl = el.querySelector('.purchase-name-text');
      if (nameEl) nameEl.textContent = 'Analyzing with AI…';
      el.querySelector('.purchase-remove').addEventListener('click', e => {
        e.stopPropagation();
        el.remove();
        persistAll();
      });
      return el;
    }

    function wirePurchaseRow(el) {
      if (el.dataset.wired === '1') return;
      el.dataset.wired = '1';
      const rm = el.querySelector('.purchase-remove');
      if (rm) {
        rm.addEventListener('click', e => {
          e.stopPropagation();
          el.remove();
          persistAll();
        });
      }
      el.addEventListener('click', e => {
        if (e.target.closest('.purchase-remove')) return;
        openItemReport(el);
      });
    }

    function applyDatasetToRow(el, ai, dataUrl, meta) {
      const score = Math.max(5, Math.min(98, ai?.score || 50));
      const { grade, cls } = gradeFromScore(score);
      const name = ai?.name || 'Unknown Product';
      const summary = ai?.summary || '';
      const brand = ai?.brand || '';
      const materials = ai?.materials || 'Unknown';
      const concerns = ai?.concerns || 'None identified';
      const positives = ai?.positives || 'None identified';
      const category = ai?.category || 'Other';

      el.classList.remove('purchase-item--loading');
      const nameEl = el.querySelector('.purchase-name-text');
      const metaEl = el.querySelector('.purchase-meta');
      if (nameEl) nameEl.textContent = name;
      if (metaEl) {
        const src = meta && meta.source === 'email' ? 'Email' : 'Upload';
        metaEl.textContent = `${brand} · ${category} · ${score}/100 · ${src}`;
      }

      const gradeEl = el.querySelector('.purchase-grade');
      if (gradeEl) {
        gradeEl.className = `purchase-grade ${cls}`;
        gradeEl.textContent = grade;
      }

      if (!el.dataset.purchaseId) el.dataset.purchaseId = newPurchaseId();
      if (!el.dataset.createdAt) el.dataset.createdAt = new Date().toISOString();
      el.dataset.aiName = name;
      el.dataset.aiBrand = brand;
      el.dataset.aiScore = String(score);
      el.dataset.aiGrade = grade;
      el.dataset.aiGradeClass = cls;
      el.dataset.aiSummary = summary;
      el.dataset.aiMaterials = materials;
      el.dataset.aiConcerns = concerns;
      el.dataset.aiPositives = positives;
      el.dataset.aiCategory = category;
      el.dataset.imgSrc = dataUrl || '';

      {
        const o = mergeOriginIntoScanData({ ...(typeof ai === 'object' && ai ? ai : {}), brand: ai?.brand, category: ai?.category });
        el.dataset.originCountry = o.origin_country || '';
        el.dataset.originCity = o.origin_city || '';
      }

      el.dataset.source = (meta && meta.source) || el.dataset.source || 'upload';
      if (meta && meta.emailImportId) el.dataset.emailImportId = meta.emailImportId;
      if (meta && meta.emailSubject != null) el.dataset.emailSubject = meta.emailSubject;
      if (meta && meta.emailFrom != null) el.dataset.emailFrom = meta.emailFrom;

      el.classList.add('purchase-item--clickable');
    }

    function updateItemWithAI(el, ai, dataUrl, meta) {
      applyDatasetToRow(el, ai, dataUrl, meta);
      wirePurchaseRow(el);
      persistAll();
    }

    function buildPurchaseRowHTML(isImg, dataUrl, loading) {
      const thumb = isImg && dataUrl
        ? `<img src="${dataUrl}" class="purchase-preview" alt=""/>`
        : '<span class="purchase-type purchase-type-doc" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg></span>';
      const gradeInner = loading
        ? '<div class="ac-loading-dot" style="width:8px;height:8px"></div>'
        : '?';
      return `
        ${thumb}
        <div class="purchase-info">
          <div class="purchase-name">
            <span class="purchase-name-text">${loading ? 'Analyzing…' : ''}</span>
            <span class="ac-ai-badge">AI</span>
          </div>
          <div class="purchase-meta"></div>
        </div>
        <div class="purchase-grade grade-c">${gradeInner}</div>
        <button type="button" class="purchase-remove" aria-label="Remove"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`;
    }

    function createItemFromAI(ai, dataUrl, meta) {
      const isImg = !!(dataUrl && String(dataUrl).startsWith('data:image'));
      const el = document.createElement('div');
      el.className = 'purchase-item';
      el.innerHTML = buildPurchaseRowHTML(isImg, dataUrl, false);
      el.dataset.purchaseId = newPurchaseId();
      applyDatasetToRow(el, ai, dataUrl || '', meta);
      wirePurchaseRow(el);
      return el;
    }

    function rowFromSnapshot(snap) {
      const isImg = snap.imgSrc && String(snap.imgSrc).startsWith('data:image');
      const el = document.createElement('div');
      el.className = 'purchase-item purchase-item--clickable';
      el.innerHTML = buildPurchaseRowHTML(isImg, snap.imgSrc, false);
      el.dataset.purchaseId = snap.id || newPurchaseId();
      el.dataset.source = snap.source || 'upload';
      if (snap.emailImportId) el.dataset.emailImportId = snap.emailImportId;
      if (snap.emailSubject) el.dataset.emailSubject = snap.emailSubject;
      if (snap.emailFrom) el.dataset.emailFrom = snap.emailFrom;
      el.dataset.aiName = snap.aiName || '';
      el.dataset.aiBrand = snap.aiBrand || '';
      el.dataset.aiScore = snap.aiScore || '50';
      el.dataset.aiGrade = snap.aiGrade || 'C';
      el.dataset.aiGradeClass = snap.aiGradeClass || 'grade-c';
      el.dataset.aiSummary = snap.aiSummary || '';
      el.dataset.aiMaterials = snap.aiMaterials || '';
      el.dataset.aiConcerns = snap.aiConcerns || '';
      el.dataset.aiPositives = snap.aiPositives || '';
      el.dataset.aiCategory = snap.aiCategory || 'Other';
      el.dataset.originCountry = snap.originCountry || '';
      el.dataset.originCity = snap.originCity || '';
      el.dataset.imgSrc = snap.imgSrc || '';
      el.dataset.createdAt = snap.createdAt || deriveCreatedAtFromId(snap.id) || '';

      const nameEl = el.querySelector('.purchase-name-text');
      const metaEl = el.querySelector('.purchase-meta');
      const score = +el.dataset.aiScore || 50;
      if (nameEl) nameEl.textContent = snap.aiName || 'Product';
      if (metaEl) {
        const src = snap.source === 'email' ? 'Email' : 'Upload';
        metaEl.textContent = `${snap.aiBrand || ''} · ${snap.aiCategory || 'Other'} · ${score}/100 · ${src}`;
      }
      const gradeEl = el.querySelector('.purchase-grade');
      if (gradeEl) {
        gradeEl.className = `purchase-grade ${snap.aiGradeClass || 'grade-c'}`;
        gradeEl.textContent = snap.aiGrade || 'C';
      }
      wirePurchaseRow(el);
      return el;
    }

    function loadFromStorage() {
      const { purchases, emailIndex } = loadPurchaseStore();
      emailIndexEntries = emailIndex;
      renderEmailIndex();
      purchases.forEach(s => list.appendChild(rowFromSnapshot(s)));
    }

    function refreshFootprintAccountLabel() {
      const el = document.getElementById('footprintAccountEmail');
      if (el) el.textContent = getAccountEmail() || 'Not linked — sign in from the landing page to attach imports to your email';
    }

    function createProcessingRow(label) {
      const el = document.createElement('div');
      el.className = 'purchase-item purchase-item--loading purchase-item--processing';
      el.innerHTML = `
        <span class="purchase-type purchase-type-doc" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h16v16H4zM8 8h8M8 12h5"/></svg></span>
        <div class="purchase-info">
          <div class="purchase-name"><span class="purchase-name-text">${escapeHtml(label)}</span></div>
          <div class="purchase-meta">Parsing email…</div>
        </div>
        <div class="purchase-grade grade-c"><div class="ac-loading-dot" style="width:8px;height:8px"></div></div>`;
      return el;
    }

    async function importEmailBody(rawBody, extra) {
      const trimmed = (rawBody || '').trim();
      const minLen = extra && typeof extra.minBodyLen === 'number' ? extra.minBodyLen : 25;
      if (trimmed.length < minLen) return;

      const subj = (extra && extra.subject) || '';
      const from = (extra && extra.from) || '';

      const parsed = await analyzeOrderEmailWithClaude(trimmed, { subject: subj, from });
      if (!parsed || !Array.isArray(parsed.items)) return null;

      let items = parsed.items.filter(it => it && (it.name || it.brand));
      if (!items.length) {
        items = [{
          name: parsed.merchant ? `Order — ${parsed.merchant}` : 'Order (unparsed)',
          brand: parsed.merchant || 'Unknown',
          category: 'Other',
          score: 50,
          grade: 'C',
          summary: 'Could not split line items; showing one aggregate row.',
          materials: 'Unknown',
          concerns: 'None identified',
          positives: 'None identified',
        }];
      }

      const importId = 'em_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
      const purchaseIds = [];
      const displaySubj = subj || parsed.order_ref || parsed.merchant || 'Email receipt';
      const displayFrom = from || parsed.merchant || '—';

      for (const ai of items) {
        const el = createItemFromAI(ai, '', {
          source: 'email',
          emailImportId: importId,
          emailSubject: displaySubj,
          emailFrom: displayFrom,
        });
        list.prepend(el);
        purchaseIds.push(el.dataset.purchaseId);
        applyPurchaseFootprint(ai.score || 50, ai.origin_country, { skipRefresh: true });
      }

      pushEmailIndex({
        id: importId,
        createdAt: new Date().toISOString(),
        accountEmail: getAccountEmail(),
        subject: displaySubj,
        from: displayFrom,
        itemCount: items.length,
        purchaseIds,
        snippet: trimmed.slice(0, 160).replace(/\s+/g, ' '),
      });
      persistAll();
      return { importId, itemCount: items.length };
    }

    function openItemReport(el) {
      const d = el.dataset;
      const score = +d.aiScore;
      const { grade, cls } = gradeFromScore(score);
      const barColor = score >= 70 ? '#7FAE8A' : score >= 40 ? '#FFD54F' : '#EF9A9A';

      const existing = document.getElementById('purchaseReportOverlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'purchaseReportOverlay';
      overlay.className = 'purchase-report-overlay open';
      overlay.innerHTML = `
        <div class="purchase-report">
          <div class="purchase-report-header">
            <h3>${d.aiName}</h3>
            <button class="purchase-report-close">✕</button>
          </div>
          <div class="purchase-report-body">
            ${d.imgSrc ? `<div class="purchase-report-img-wrap"><img src="${d.imgSrc}" alt="${d.aiName}" class="purchase-report-img"/></div>` : ''}
            <div class="purchase-report-overview">
              <div class="purchase-report-score ${cls}">${grade}</div>
              <div>
                <div class="purchase-report-brand">${d.aiBrand} · ${d.aiCategory}</div>
                <div class="purchase-report-summary">${esc(d.aiSummary)}</div>
              </div>
            </div>
            <div class="purchase-report-bar-section">
              <div class="purchase-report-bar-label">Sustainability Score: <strong>${score}/100</strong></div>
              <div class="metric-bar-wrap"><div class="metric-bar" style="width:${score}%;background:${barColor}"></div></div>
            </div>
            <div class="purchase-report-details">
              <div class="purchase-report-detail-item">
                <div class="purchase-report-detail-label">Materials</div>
                <div class="purchase-report-detail-text">${esc(d.aiMaterials)}</div>
              </div>
              <div class="purchase-report-detail-item positive">
                <div class="purchase-report-detail-label">Positives</div>
                <div class="purchase-report-detail-text">${esc(d.aiPositives)}</div>
              </div>
              ${d.originCountry ? `<div class="purchase-report-detail-item origin">
                <div class="purchase-report-detail-label">Origin</div>
                <div class="purchase-report-detail-text">${d.originCity ? d.originCity + ', ' : ''}${d.originCountry}</div>
              </div>` : ''}
              <div class="purchase-report-detail-item concern">
                <div class="purchase-report-detail-label">Concerns</div>
                <div class="purchase-report-detail-text">${esc(d.aiConcerns)}</div>
              </div>
            </div>
            <div class="purchase-report-footer">
              <span class="ac-ai-badge">✦ AI-Powered Analysis</span>
            </div>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      overlay.querySelector('.purchase-report-close').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    }

    function showSavedToast() {
      const t = document.createElement('div');
      t.className = 'upload-toast';
      t.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Item saved to Products';
      document.body.appendChild(t);
      setTimeout(() => {
        t.classList.add('toast-out');
        t.addEventListener('animationend', () => t.remove());
      }, 2800);
    }

    async function addItem(file) {
      const ext = file.name.split('.').pop().toLowerCase();
      const isImg = ['jpg','jpeg','png','gif','webp'].includes(ext);

      let dataUrl = '';
      if (isImg) dataUrl = await fileToBase64(file);

      const el = createItemEl(file, dataUrl);
      list.prepend(el);

      if (isImg && dataUrl) {
        const ai = await analyzeWithVision(dataUrl);
        updateItemWithAI(el, ai, dataUrl, { source: 'upload' });
        applyPurchaseFootprint(ai?.score || 50, ai?.origin_country);
        showSavedToast();
      } else {
        updateItemWithAI(el, {
          name: file.name.replace(/\.[^.]+$/, ''),
          brand: 'Unknown',
          category: 'Other',
          score: 50,
          grade: 'C',
          summary: 'Non-image file — upload a product photo for AI analysis',
          materials: 'N/A',
          concerns: 'Cannot analyze non-image files',
          positives: 'N/A',
        }, '', { source: 'upload' });
        applyPurchaseFootprint(50);
        showSavedToast();
      }
    }

    zone.querySelector('.upload-btn').addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      [...input.files].forEach(f => addItem(f));
      input.value = '';
    });
    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', ()  => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('dragover');
      [...e.dataTransfer.files].forEach(f => addItem(f));
    });

    /* Paste button removed — Gmail import handles everything now. */

    function gmailRefreshKey() {
      return 'ecoaudit_gmail_refresh:' + (getAccountEmail() || 'guest');
    }
    function getGmailRefresh() {
      try { return localStorage.getItem(gmailRefreshKey()) || ''; } catch { return ''; }
    }
    function setGmailRefresh(token) {
      try { localStorage.setItem(gmailRefreshKey(), token); } catch {}
    }
    function clearGmailRefresh() {
      try { localStorage.removeItem(gmailRefreshKey()); } catch {}
    }

    function updateGmailUi() {
      const rt = !!getGmailRefresh();
      const search = document.getElementById('gmailSearchBtn');
      const disc = document.getElementById('gmailDisconnectBtn');
      const st = document.getElementById('gmailStatus');
      if (search) search.disabled = !rt;
      if (disc) disc.disabled = !rt;
      if (st) {
        st.textContent = rt
          ? 'Gmail is connected in this browser (read-only). Use “Find receipt emails” to list likely orders.'
          : 'Optional: connect Gmail to search your inbox for receipts. Uses Google OAuth — not an API key alone.';
      }
    }

    const importedGmailIds = new Set();

    function renderGmailResults(messages) {
      const wrap = document.getElementById('gmailResults');
      const ul = document.getElementById('gmailResultsList');
      if (!wrap || !ul) return;
      ul.innerHTML = '';
      if (!messages.length) {
        wrap.hidden = false;
        const li = document.createElement('li');
        li.className = 'gmail-result-empty';
        li.textContent = 'No receipt emails found. Your inbox may not have any recent order confirmations.';
        ul.appendChild(li);
        return;
      }
      wrap.hidden = false;
      messages.forEach(m => {
        const li = document.createElement('li');
        li.className = 'gmail-result-item';
        if (importedGmailIds.has(m.id)) li.classList.add('gmail-result-imported');
        li.setAttribute('role', 'button');
        li.tabIndex = 0;
        li.innerHTML = `
          <span class="gmail-result-subj">${escapeHtml(m.subject || '(no subject)')}</span>
          <span class="gmail-result-meta">${escapeHtml(m.from || '—')} · ${escapeHtml(m.date || '—')}</span>
          <span class="gmail-result-badge">${importedGmailIds.has(m.id) ? 'Imported' : 'Click to import'}</span>`;
        if (!importedGmailIds.has(m.id)) {
          const go = () => importGmailMessage(m.id, li);
          li.addEventListener('click', go);
          li.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
          });
        }
        ul.appendChild(li);
      });
    }

    async function importGmailMessage(messageId, rowEl) {
      const rt = getGmailRefresh();
      if (!rt || !messageId) return;

      if (rowEl) {
        const badge = rowEl.querySelector('.gmail-result-badge');
        if (badge) badge.textContent = 'Importing…';
        rowEl.style.pointerEvents = 'none';
        rowEl.style.opacity = '0.6';
      }

      const processingRow = createProcessingRow('Loading from Gmail…');
      list.prepend(processingRow);

      try {
        const r = await fetch('/api/gmail/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt, messageId }),
        });
        const j = await r.json();
        if (!r.ok) {
          if (rowEl) {
            const badge = rowEl.querySelector('.gmail-result-badge');
            if (badge) badge.textContent = 'Failed';
            rowEl.style.pointerEvents = '';
            rowEl.style.opacity = '';
          }
          return;
        }

        const result = await importEmailBody(j.bodyText || '', {
          subject: j.subject || '',
          from: j.from || '',
          minBodyLen: 15,
        });

        importedGmailIds.add(messageId);

        if (rowEl) {
          rowEl.classList.add('gmail-result-imported');
          const badge = rowEl.querySelector('.gmail-result-badge');
          if (badge) badge.textContent = result ? `${result.itemCount} item${result.itemCount === 1 ? '' : 's'} added` : 'Imported';
          rowEl.style.pointerEvents = 'none';
          rowEl.style.opacity = '';
        }
      } catch (e) {
        console.error(e);
        if (rowEl) {
          const badge = rowEl.querySelector('.gmail-result-badge');
          if (badge) badge.textContent = 'Error';
          rowEl.style.pointerEvents = '';
          rowEl.style.opacity = '';
        }
      } finally {
        processingRow.remove();
      }
    }

    window.addEventListener('message', ev => {
      if (ev.origin !== window.location.origin) return;
      const d = ev.data;
      if (!d || d.type !== 'ecoaudit-gmail-oauth') return;
      if (d.error) {
        alert('Gmail connection failed: ' + d.error + (d.detail ? ' — ' + d.detail : ''));
        updateGmailUi();
        return;
      }
      if (d.refresh_token) setGmailRefresh(d.refresh_token);
      else if (!getGmailRefresh()) {
        alert('No refresh token returned. Try again and choose the same Google account; ensure prompt=consent is enabled on the server.');
      }
      updateGmailUi();
    });

    document.getElementById('gmailConnectBtn')?.addEventListener('click', async () => {
      try {
        const r = await fetch('/api/gmail/oauth-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ returnOrigin: window.location.origin }),
        });
        const j = await r.json();
        if (!r.ok) {
          alert(j.hint || j.error || 'Gmail OAuth is not configured on the server.');
          return;
        }
        const w = window.open(j.url, 'ecoaudit_gmail_oauth', 'width=520,height=720,scrollbars=yes');
        if (!w) alert('Allow pop-ups for this site to sign in with Google.');
      } catch (e) {
        console.error(e);
        alert('Could not reach the server.');
      }
    });

    document.getElementById('gmailSearchBtn')?.addEventListener('click', async () => {
      const rt = getGmailRefresh();
      if (!rt) return;
      const btn = document.getElementById('gmailSearchBtn');
      if (btn) btn.disabled = true;
      try {
        const r = await fetch('/api/gmail/list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt, maxResults: 20 }),
        });
        const j = await r.json();
        if (!r.ok) {
          alert(j.error || 'Gmail search failed.');
          return;
        }
        renderGmailResults(j.messages || []);
      } catch (e) {
        console.error(e);
        alert('Network error.');
      } finally {
        updateGmailUi();
      }
    });

    document.getElementById('gmailDisconnectBtn')?.addEventListener('click', () => {
      clearGmailRefresh();
      const wrap = document.getElementById('gmailResults');
      if (wrap) wrap.hidden = true;
      updateGmailUi();
    });

    loadFromStorage();
    refreshFootprintAccountLabel();
    updateGmailUi();
    refreshAllUI();
    renderLibraryTable();

    document.getElementById('librarySort')?.addEventListener('change', () => renderLibraryTable());

    function scanResultToAiPayload(data) {
      const merged = mergeOriginIntoScanData(data || {});
      const m = merged.metrics || {};
      const keys = ['carbon', 'supply_chain', 'labour', 'materials', 'packaging'];
      const vals = keys.map(k => m[k]).filter(v => typeof v === 'number' && !Number.isNaN(v));
      const score = vals.length
        ? Math.max(5, Math.min(98, Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)))
        : 50;
      const claims = Array.isArray(merged.claims) ? merged.claims : [];
      const verified = claims.filter(c => c.status === 'verified');
      const other = claims.filter(c => c.status && c.status !== 'verified');
      return {
        name: merged.name || 'Product',
        brand: merged.brand || '',
        category: merged.category || 'Other',
        score,
        summary: merged.description || '',
        materials: 'Multi-factor sustainability assessment',
        concerns: other.map(c => c.text).filter(Boolean).join(' · ') || 'None identified',
        positives: verified.map(c => c.text).filter(Boolean).join(' · ') || 'None identified',
        origin_country: merged.origin_country || '',
        origin_city: merged.origin_city || '',
      };
    }

    window.ecoauditCommitScanResult = function (data, imgDataUrl, source) {
      if (!data || !list) return;
      const ai = scanResultToAiPayload(data);
      const el = createItemFromAI(ai, imgDataUrl || '', { source: source || 'camera' });
      list.prepend(el);
      applyPurchaseFootprint(ai.score || 50, ai.origin_country, { skipRefresh: true });
      persistAll();
    };

    window.ecoauditAddExtensionPurchases = function (purchases) {
      if (!list || !purchases || !purchases.length) return;
      const dayMs = 24 * 60 * 60 * 1000;
      let added = 0;
      for (const p of purchases) {
        const snap = {
          id: p.purchaseId || ('ext-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)),
          aiName: p.productName || 'Extension Product',
          aiBrand: p.brand || '',
          aiScore: String(p.score || 50),
          aiGrade: p.grade || 'C',
          aiGradeClass: p.gradeClass || 'grade-c',
          aiSummary: p.summary || '',
          aiMaterials: p.materials || '',
          aiConcerns: p.concerns || '',
          aiPositives: p.positives || '',
          aiCategory: p.category || 'Other',
          source: 'extension',
          url: p.url || '',
          imgSrc: p.image || '',
          createdAt: p.createdAt || new Date().toISOString(),
        };
        const isDupe = [...list.querySelectorAll('.purchase-item')].some(el =>
          el.dataset.aiName === snap.aiName &&
          Math.abs(new Date(el.dataset.createdAt || 0) - new Date(snap.createdAt)) < dayMs
        );
        if (!isDupe) {
          const el = rowFromSnapshot(snap);
          list.prepend(el);
          added++;
        }
      }
      if (added > 0) persistAll();
    };
  })();

  /* ── Location autocomplete (Nominatim geocoding) ── */
  const locationInput = document.getElementById('locationInput');
  const locationAC    = document.getElementById('locationAutocomplete');
  let locTimer = null;

  function closeLocationAC() { locationAC.classList.remove('open'); locationAC.innerHTML = ''; }

  async function fetchLocations(query) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(query)}`,
        { headers: { 'Accept-Language': 'en' } }
      );
      return await res.json();
    } catch { return []; }
  }

  function formatLocation(place) {
    const a = place.address || {};
    const parts = [];
    if (a.city || a.town || a.village) parts.push(a.city || a.town || a.village);
    if (a.state) parts.push(a.state);
    if (a.country) parts.push(a.country);
    return parts.length ? parts.join(', ') : place.display_name;
  }

  if (locationInput && locationAC) {
    locationInput.addEventListener('input', function () {
      const q = this.value.trim();
      clearTimeout(locTimer);
      if (q.length < 3) { closeLocationAC(); return; }

      locationAC.innerHTML = '<div class="ac-loading"><div class="ac-loading-dot"></div><div class="ac-loading-dot"></div><div class="ac-loading-dot"></div><span>Finding locations…</span></div>';
      locationAC.classList.add('open');

      locTimer = setTimeout(async () => {
        const results = await fetchLocations(q);
        if (locationInput.value.trim() !== q) return;

        if (!results.length) {
          locationAC.innerHTML = '<div class="ac-loading" style="color:var(--gray-400)">No locations found</div>';
          return;
        }

        locationAC.innerHTML = results.map((p, i) => {
          const addr = p.address || {};
          const icon = p.type === 'city' || p.type === 'town' ? '🏙️' :
                       p.type === 'state' || p.type === 'administrative' ? '🗺️' :
                       p.type === 'country' ? '🌍' : '📍';
          const name = addr.city || addr.town || addr.village || addr.county || p.name || '';
          const detail = p.display_name;
          return `<div class="loc-item" data-idx="${i}">
            <span class="loc-pin">${icon}</span>
            <div class="loc-info">
              <div class="loc-name">${name || detail.split(',')[0]}</div>
              <div class="loc-detail">${detail}</div>
            </div>
          </div>`;
        }).join('');

        locationAC.querySelectorAll('.loc-item').forEach(item => {
          item.addEventListener('click', () => {
            const idx = +item.dataset.idx;
            const place = results[idx];
            locationInput.value = formatLocation(place);
            closeLocationAC();
          });
        });
      }, 350);
    });

    locationInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeLocationAC();
    });

    document.addEventListener('click', e => {
      if (!locationInput.contains(e.target) && !locationAC.contains(e.target)) closeLocationAC();
    });
  }

  /* ── Privacy buttons ── */
  document.querySelectorAll('.privacy-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      if (this.classList.contains('danger')) {
        if (confirm('Are you sure you want to delete your account? This cannot be undone.')) {
          alert('Demo mode: account deletion disabled.');
        }
      } else {
        alert('Demo mode: this feature is available in the full version.');
      }
    });
  });

  /* ── Keyboard: Escape closes overlays ── */
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    document.getElementById('purchaseReportOverlay')?.classList.remove('open');
    document.getElementById('esgOverlay')?.classList.remove('open');
  });

  /* ═══════════════════════════════════════
     AUTH STATE, PROFILE & NOTIFICATIONS
  ═══════════════════════════════════════ */

  /* ── Load user session ── */
  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem('ecoaudit_user')); } catch { return null; }
  })();

  if (currentUser) {
    const initials = currentUser.initials || currentUser.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
    const avatarEl = document.getElementById('avatarBtn');
    const profileAv = document.getElementById('profileAvatar');
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');

    if (avatarEl) avatarEl.textContent = initials;
    if (profileAv) profileAv.textContent = initials;
    if (profileName) profileName.textContent = currentUser.name;
    if (profileEmail) profileEmail.textContent = currentUser.email;

    const greetEl = document.querySelector('.hero-text h1');
    if (greetEl) {
      const h = new Date().getHours();
      const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
      const first = currentUser.name.split(' ')[0];
      greetEl.innerHTML = `${greeting}, ${first} <span class="wave"></span>`;
    }

    const settingsNameEl = document.getElementById('settingsName');
    if (settingsNameEl) settingsNameEl.value = currentUser.name;
    const settingsEmailEl = document.getElementById('settingsEmail');
    if (settingsEmailEl) settingsEmailEl.value = currentUser.email || '';
  }

  /* ── Profile dropdown ── */
  const avatarBtn = document.getElementById('avatarBtn');
  const profileDD = document.getElementById('profileDropdown');

  if (avatarBtn && profileDD) {
    avatarBtn.addEventListener('click', e => {
      e.stopPropagation();
      profileDD.classList.toggle('open');
    });
  }

  /* ── Profile menu actions ── */
  document.querySelectorAll('.profile-menu-item[data-action]').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      profileDD.classList.remove('open');
      const action = item.dataset.action;
      if (action === 'settings' || action === 'profile') {
        navItems.forEach(n => n.classList.remove('active'));
        pages.forEach(p => p.classList.remove('active'));
        document.getElementById('page-settings').classList.add('active');
        if (pageTitle) pageTitle.textContent = pageTitles['settings'];
      }
    });
  });

  document.querySelectorAll('.settings-tab[data-settings-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const id = tab.dataset.settingsTab;
      document.querySelectorAll('.settings-tab[data-settings-tab]').forEach(t => {
        const on = t === tab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      document.querySelectorAll('.settings-tab-panel').forEach(p => {
        p.classList.toggle('active', p.id === 'settings-panel-' + id);
      });
    });
  });

  /* ── Sign out ── */
  const signOutBtn = document.getElementById('signOutBtn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', e => {
      e.preventDefault();
      // Notify extension of sign-out
      clearExtensionAuth();
      localStorage.removeItem('ecoaudit_user');
      window.location.href = 'landing.html';
    });
  }

  /* ── Extension purchase sync ──
     On page load, check if the extension has pending purchases
     and merge them into the user's library. */
  (function syncExtensionPurchases() {
    if (!ECOAUDIT_EXTENSION_ID) return;
    const user = (() => { try { return JSON.parse(localStorage.getItem('ecoaudit_user')); } catch { return null; } })();
    if (!user?.email) return;

    sendExtensionMessage(
      { type: 'ecoaudit-get-pending-purchases', email: user.email },
      (response) => {
        const purchases = response?.purchases;
        if (!purchases || !purchases.length) return;

        if (typeof window.ecoauditAddExtensionPurchases === 'function') {
          // Add to the in-memory track list and persist — prevents persistAll() from overwriting them
          window.ecoauditAddExtensionPurchases(purchases);
        } else {
          // Fallback: write directly to localStorage (library-only sync)
          const storeKey = 'ecoaudit_footprint_store:' + user.email.trim().toLowerCase();
          let store;
          try { store = JSON.parse(localStorage.getItem(storeKey) || '{}'); } catch { store = {}; }
          if (!Array.isArray(store.purchases)) store.purchases = [];
          const dayMs = 24 * 60 * 60 * 1000;
          let added = 0;
          for (const p of purchases) {
            const isDupe = store.purchases.some(existing =>
              existing.url === p.url &&
              existing.aiName === p.productName &&
              Math.abs(new Date(existing.createdAt) - new Date(p.createdAt)) < dayMs
            );
            if (!isDupe) {
              store.purchases.unshift({
                purchaseId: p.purchaseId || ('ext-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)),
                aiName: p.productName || 'Extension Product',
                aiBrand: p.brand || '',
                aiScore: String(p.score || 50),
                aiGrade: p.grade || 'C',
                aiGradeClass: p.gradeClass || 'grade-c',
                aiSummary: p.summary || '',
                aiMaterials: p.materials || '',
                aiConcerns: p.concerns || '',
                aiPositives: p.positives || '',
                aiCategory: p.category || 'Other',
                source: 'extension',
                url: p.url || '',
                imgSrc: p.image || '',
                createdAt: p.createdAt || new Date().toISOString(),
              });
              added++;
            }
          }
          if (added > 0) localStorage.setItem(storeKey, JSON.stringify(store));
        }

        console.log(`[EcoAudit] Synced purchase(s) from extension.`);
        sendExtensionMessage({ type: 'ecoaudit-clear-pending-purchases', email: user.email });
        if (typeof window.ecoauditRefreshLibrary === 'function') {
          window.ecoauditRefreshLibrary();
        }
      }
    );
  })();

  /* ── Save profile changes ── */
  const settingsSaveBtn = document.getElementById('settingsSaveBtn');
  if (settingsSaveBtn) {
    settingsSaveBtn.addEventListener('click', () => {
      const nameInput = document.getElementById('settingsName');
      const newName = nameInput ? nameInput.value.trim() : '';
      if (!newName) { alert('Display name cannot be empty.'); return; }

      try {
        const user = JSON.parse(localStorage.getItem('ecoaudit_user') || 'null');
        if (!user) { alert('No active session. Please sign in again.'); return; }

        const oldEmail = user.email;
        user.name = newName;
        user.initials = newName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        localStorage.setItem('ecoaudit_user', JSON.stringify(user));

        const accounts = JSON.parse(localStorage.getItem('ecoaudit_accounts') || '[]');
        const acct = accounts.find(a => a.email === oldEmail);
        if (acct) {
          acct.name = newName;
          localStorage.setItem('ecoaudit_accounts', JSON.stringify(accounts));
        }

        const avatarEl = document.getElementById('avatarBtn');
        const profileAv = document.getElementById('profileAvatar');
        const profileNameEl = document.getElementById('profileName');
        if (avatarEl) avatarEl.textContent = user.initials;
        if (profileAv) profileAv.textContent = user.initials;
        if (profileNameEl) profileNameEl.textContent = newName;

        syncUserWithExtension(user);

        const greetEl = document.querySelector('.hero-text h1');
        if (greetEl) {
          const h = new Date().getHours();
          const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
          greetEl.textContent = `${greeting}, ${newName.split(' ')[0]}`;
        }

        settingsSaveBtn.textContent = 'Saved!';
        setTimeout(() => { settingsSaveBtn.textContent = 'Save Changes'; }, 1500);
      } catch (err) {
        alert('Error saving profile: ' + err.message);
      }
    });
  }

  /* ── Delete account ── */
  const deleteAccountBtn = document.getElementById('deleteAccountBtn');
  if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener('click', async () => {
      const confirmed = confirm(
        'Are you sure you want to delete your account?\n\n' +
        'This will permanently remove:\n' +
        '• Your profile and login credentials\n' +
        '• All tracked products and shopping data\n' +
        '• Dashboard statistics and notifications\n\n' +
        'This action cannot be undone.'
      );
      if (!confirmed) return;

      try {
        // Delete the account on the server first; stop if that fails so nothing is half-deleted.
        const del = await fetch('/api/account', { method: 'DELETE' });
        if (!del.ok && del.status !== 401) throw new Error('the server could not delete it (' + del.status + ')');
        const user = JSON.parse(localStorage.getItem('ecoaudit_user') || 'null');
        if (user && user.email) {
          localStorage.removeItem('ecoaudit_gmail_refresh:' + user.email.trim().toLowerCase());
          const accounts = JSON.parse(localStorage.getItem('ecoaudit_accounts') || '[]');
          const filtered = accounts.filter(a => a.email !== user.email);
          localStorage.setItem('ecoaudit_accounts', JSON.stringify(filtered));

          const storageKey = 'ecoaudit_footprint_store:' + user.email.trim().toLowerCase();
          localStorage.removeItem(storageKey);

          const notifKey = 'ecoaudit_notifications:' + user.email.trim().toLowerCase();
          localStorage.removeItem(notifKey);

          const statsKey = 'ecoaudit_stats:' + user.email.trim().toLowerCase();
          localStorage.removeItem(statsKey);
        }

        localStorage.removeItem('ecoaudit_user');
        window.location.href = 'landing.html';
      } catch (err) {
        alert('Error deleting account: ' + err.message);
      }
    });
  }

  /* ── Export data ── */
  const exportDataBtn = document.getElementById('exportDataBtn');
  if (exportDataBtn) {
    exportDataBtn.addEventListener('click', () => {
      try {
        const user = JSON.parse(localStorage.getItem('ecoaudit_user') || 'null');
        const email = user && user.email ? user.email.trim().toLowerCase() : 'guest';
        const storageKey = 'ecoaudit_footprint_store:' + email;
        const data = JSON.parse(localStorage.getItem(storageKey) || '[]');

        if (!data.length) { alert('No product data to export.'); return; }

        const headers = ['Product', 'Brand', 'Category', 'Score', 'Origin', 'Source', 'Date Added'];
        const rows = data.map(item => [
          item.name || item.product || '',
          item.brand || '',
          item.category || '',
          item.score != null ? item.score : '',
          item.origin || item.country || '',
          item.source || '',
          item.date || item.addedAt || ''
        ]);

        const csvContent = [headers, ...rows]
          .map(row => row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(','))
          .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ecoaudit-data-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        alert('Error exporting data: ' + err.message);
      }
    });
  }

  /* ── Close profile dropdown on outside click ── */
  document.addEventListener('click', e => {
    if (profileDD && !profileDD.contains(e.target) && e.target !== avatarBtn) {
      profileDD.classList.remove('open');
    }
  });

  /* ══════════════════════════════════════════════════
     PRODUCT SCANNER — Camera + Manual + Editable Results
  ══════════════════════════════════════════════════ */
  (function () {
    /* ── DOM refs ── */
    const psVideo      = document.getElementById('psVideo');
    const psOverlay    = document.getElementById('psOverlay');
    const psPlaceholder= document.getElementById('psCameraPlaceholder');
    const psCamControls= document.getElementById('psCamControls');
    const psStartBtn   = document.getElementById('psStartBtn');
    const psCaptureBtn = document.getElementById('psCaptureBtn');
    const psFlipBtn    = document.getElementById('psFlipBtn');
    const psCandidates = document.getElementById('psCandidates');
    const psCandList   = document.getElementById('psCandidateList');
    const psCamResult  = document.getElementById('psCameraResult');
    const psManualBtn  = document.getElementById('psManualBtn');
    const psManualResult = document.getElementById('psManualResult');

    if (!psVideo) return; // page not present

    /* ── State ── */
    let stream        = null;
    let facingMode    = 'environment';
    let animFrame     = null;
    let scanLine      = 0;
    let scanDir       = 1;
    let pulseT        = 0;
    // Freeze-and-trace state
    let frozenImg     = null;   // ImageBitmap of the captured frame
    let traceMode     = false;  // true while showing frozen frame + trace
    let traceProgress = 0;      // px of perimeter drawn so far
    let traceComplete = false;  // true once outline fully drawn
    let traceLabel    = 'Analyzing…'; // badge text on frozen frame
    let lastCameraImageDataUrl = '';
    // Front-facing cameras are shown mirrored (like FaceTime) so moving the product feels natural.
    // Only the on-screen preview is flipped: the photo sent to the AI is the camera's real image.
    let mirrored = false;

    /* ── Mode tabs ── */
    document.querySelectorAll('.ps-mode-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.ps-mode-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.ps-pane').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const pane = document.getElementById('ps-pane-' + tab.dataset.pstab);
        if (pane) pane.classList.add('active');
        if (tab.dataset.pstab === 'camera' && !stream) {
          // camera tab re-selected — keep placeholder visible
        }
        if (tab.dataset.pstab !== 'camera') stopCamera();
      });
    });

    /* ── Canvas overlay drawing ── */
    function resizeCanvas() {
      psOverlay.width  = psVideo.videoWidth  || psOverlay.offsetWidth;
      psOverlay.height = psVideo.videoHeight || psOverlay.offsetHeight;
    }

    function drawCorners(ctx, x, y, w, h, color, len, lw) {
      ctx.strokeStyle = color;
      ctx.lineWidth   = lw;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      // top-left
      ctx.moveTo(x, y + len); ctx.lineTo(x, y); ctx.lineTo(x + len, y);
      // top-right
      ctx.moveTo(x + w - len, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + len);
      // bottom-right
      ctx.moveTo(x + w, y + h - len); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - len, y + h);
      // bottom-left
      ctx.moveTo(x + len, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - len);
      ctx.stroke();
    }

    function drawOverlay() {
      resizeCanvas();
      const ctx = psOverlay.getContext('2d');
      const W   = psOverlay.width;
      const H   = psOverlay.height;
      ctx.clearRect(0, 0, W, H);

      // Detection zone — centered 62% × 58%
      const bw = W * 0.62, bh = H * 0.58;
      const bx = (W - bw) / 2, by = (H - bh) / 2;
      const perimeter = 2 * (bw + bh);

      if (traceMode && frozenImg) {
        /* ── FROZEN FRAME + PROGRESSIVE TRACE ── */
        if (mirrored) {
          ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1);
          ctx.drawImage(frozenImg, 0, 0, W, H);
          ctx.restore();
        } else {
          ctx.drawImage(frozenImg, 0, 0, W, H);
        }

        // Dim outside the detection zone
        ctx.fillStyle = 'rgba(0,0,0,0.48)';
        ctx.fillRect(0, 0, W, by);
        ctx.fillRect(0, by + bh, W, H - by - bh);
        ctx.fillRect(0, by, bx, bh);
        ctx.fillRect(bx + bw, by, W - bx - bw, bh);

        if (!traceComplete) {
          // Advance trace: fill the rectangle perimeter progressively
          traceProgress = Math.min(perimeter, traceProgress + perimeter / 48);
          if (traceProgress >= perimeter) traceComplete = true;

          // Draw the partial outline using dash trick
          ctx.save();
          ctx.strokeStyle = '#7FAE8A';
          ctx.lineWidth   = 3.5;
          ctx.lineCap     = 'round';
          ctx.shadowColor = 'rgba(127,174,138,0.9)';
          ctx.shadowBlur  = 10;
          ctx.setLineDash([traceProgress, perimeter + 2]);
          ctx.lineDashOffset = 0;
          ctx.beginPath();
          ctx.moveTo(bx,      by);
          ctx.lineTo(bx + bw, by);
          ctx.lineTo(bx + bw, by + bh);
          ctx.lineTo(bx,      by + bh);
          ctx.closePath();
          ctx.stroke();
          ctx.restore();

          // Scan line that moves with trace progress
          const scanFrac = traceProgress / perimeter;
          const scanY    = by + bh * scanFrac;
          const sGrad    = ctx.createLinearGradient(0, scanY - 14, 0, scanY + 14);
          sGrad.addColorStop(0,   'rgba(127,174,138,0)');
          sGrad.addColorStop(0.5, 'rgba(127,174,138,0.55)');
          sGrad.addColorStop(1,   'rgba(127,174,138,0)');
          ctx.fillStyle = sGrad;
          ctx.fillRect(bx, scanY - 14, bw, 28);

        } else {
          /* Trace complete — solid pulsing outline */
          pulseT += 0.06;
          const alpha = 0.6 + 0.3 * Math.sin(pulseT);
          ctx.save();
          ctx.strokeStyle = `rgba(127,174,138,${alpha})`;
          ctx.lineWidth   = 3;
          ctx.shadowColor = 'rgba(127,174,138,0.55)';
          ctx.shadowBlur  = 14;
          ctx.setLineDash([]);
          ctx.strokeRect(bx, by, bw, bh);
          ctx.restore();
          drawCorners(ctx, bx, by, bw, bh, `rgba(127,174,138,1)`, 26, 4);

          // Badge
          const badgeText  = traceLabel;
          const badgeW     = ctx.measureText(badgeText).width + 26;
          ctx.fillStyle    = 'rgba(31,59,41,0.92)';
          ctx.beginPath();
          ctx.roundRect(bx, by - 32, badgeW, 27, 7);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font      = 'bold 12px Inter, sans-serif';
          ctx.fillText(badgeText, bx + 10, by - 13);
        }

      } else {
        /* ── LIVE SCANNING MODE ── */
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(0, 0, W, by);
        ctx.fillRect(0, by + bh, W, H - by - bh);
        ctx.fillRect(0, by, bx, bh);
        ctx.fillRect(bx + bw, by, W - bx - bw, bh);

        scanLine += 2.2 * scanDir;
        if (scanLine >= bh || scanLine <= 0) scanDir *= -1;
        const grad = ctx.createLinearGradient(0, by + scanLine - 14, 0, by + scanLine + 14);
        grad.addColorStop(0,   'rgba(127,174,138,0)');
        grad.addColorStop(0.5, 'rgba(127,174,138,0.65)');
        grad.addColorStop(1,   'rgba(127,174,138,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(bx, by + scanLine - 14, bw, 28);

        drawCorners(ctx, bx, by, bw, bh, 'rgba(255,255,255,0.85)', 24, 3);

        ctx.fillStyle = 'rgba(255,255,255,0.48)';
        ctx.font      = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Point at a product', W / 2, by + bh + 18);
        ctx.textAlign = 'left';
      }

      animFrame = requestAnimationFrame(drawOverlay);
    }

    /* ── Camera lifecycle ── */
    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        psVideo.srcObject = stream;
        await psVideo.play();

        // Which way does this camera face? Phones report 'environment' for the back camera.
        // Laptop webcams usually report nothing, and they face the user.
        const track = stream.getVideoTracks()[0];
        const reported = track && track.getSettings ? track.getSettings().facingMode : undefined;
        mirrored = reported ? reported === 'user' : (facingMode === 'user' || !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
        psVideo.classList.toggle('mirrored', mirrored);

        psPlaceholder.style.display = 'none';
        psVideo.classList.add('active');
        psOverlay.classList.add('active');
        psCamControls.classList.add('active');

        if (animFrame) cancelAnimationFrame(animFrame);
        drawOverlay();
      } catch (err) {
        psPlaceholder.innerHTML = `
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#E53935" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <p style="color:#E57373">Camera access denied.<br>Please allow camera in browser settings, or use Manual Entry.</p>`;
      }
    }

    function stopCamera() {
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
      psVideo.classList.remove('active');
      psOverlay.classList.remove('active');
      psCamControls.classList.remove('active');
      psPlaceholder.style.display = '';
      traceMode     = false;
      traceProgress = 0;
      traceComplete = false;
      frozenImg     = null;
    }

    /* Start camera when navigating to product scanner */
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        if (item.dataset.page === 'track') {
          setTimeout(() => {
            if (!stream && document.getElementById('ps-pane-camera').classList.contains('active')) {
              startCamera();
            }
          }, 200);
        } else {
          stopCamera();
        }
      });
    });

    psStartBtn.addEventListener('click', startCamera);
    psFlipBtn.addEventListener('click', () => {
      facingMode = facingMode === 'environment' ? 'user' : 'environment';
      stopCamera();
      startCamera();
    });

    /* ── Reset to live camera ── */
    function resetToLive() {
      traceMode     = false;
      traceProgress = 0;
      traceComplete = false;
      traceLabel    = 'Analyzing…';
      frozenImg     = null;
      pulseT        = 0;
      psCandidates.classList.remove('visible');
      psCamResult.innerHTML = '';
      psVideo.play();
      psCaptureBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg> Identify Product';
      psCaptureBtn.onclick = null;
      psCaptureBtn.addEventListener('click', captureAndIdentify);
    }

    /* ── Capture & identify via Claude vision ── */
    async function captureAndIdentify() {
      if (!stream) return;
      psCaptureBtn.disabled = true;
      psCaptureBtn.innerHTML = 'Scanning…';
      psCandidates.classList.remove('visible');
      psCamResult.innerHTML = '';

      // 1. Freeze the video
      psVideo.pause();

      // 2. Capture frame for API (offscreen canvas)
      const offscreen = document.createElement('canvas');
      offscreen.width  = psVideo.videoWidth  || 640;
      offscreen.height = psVideo.videoHeight || 360;
      offscreen.getContext('2d').drawImage(psVideo, 0, 0);
      const captureImageDataUrl = offscreen.toDataURL('image/jpeg', 0.82);
      lastCameraImageDataUrl = captureImageDataUrl;
      const base64 = captureImageDataUrl.split(',')[1];

      // 3. Store as ImageBitmap so canvas can draw it each frame
      frozenImg     = await createImageBitmap(offscreen);
      traceMode     = true;
      traceProgress = 0;
      traceComplete = false;
      traceLabel    = 'Analyzing…';

      // 4. Fire API call concurrently with the trace animation
      let apiData  = null;
      let apiError = false;
      try {
        const res = await fetch('/api/claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-opus-4-6',
            max_tokens: 1200,
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
                { type: 'text', text: `You are an ESG sustainability analyst. Identify the product/brand in this image.
Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "candidates": [
    {"name": "product name", "brand": "brand name", "confidence": 92, "category": "Clothing & Apparel"},
    {"name": "alt product",  "brand": "alt brand",  "confidence": 55, "category": "Clothing & Apparel"},
    {"name": "alt product 2","brand": "alt brand 2","confidence": 30, "category": "Clothing & Apparel"}
  ],
  "top": {
    "name": "exact product name",
    "brand": "brand name",
    "category": "Clothing & Apparel",
    "description": "one sentence product description",
    "metrics": { "carbon": 65, "supply_chain": 70, "labour": 55, "materials": 68, "packaging": 72 },
    "grade": "B",
    "origin_country": "Single country: where this product type is most likely manufactured or sourced for this brand (e.g. Vietnam, China, USA, Portugal). Use label text, made-in hints, or well-known supply chains. Never leave empty — infer from brand + category if unsure.",
    "origin_city": "City or region if known from image/label, else a typical manufacturing hub for that country, else empty string",
    "certifications": ["e.g. B Corp", "GOTS"],
    "claims": [
      {"status": "verified", "text": "claim backed by real data"},
      {"status": "partial",  "text": "claim with caveats"}
    ],
    "source": "MSCI, Good On You, B Lab, etc."
  }
}
Base all scores and claims on real published ESG data (MSCI, Sustainalytics, Good On You, B Lab, CDP). You MUST include origin_country (and origin_city when possible) for shipping footprint. If product unknown, use industry averages.` }
              ]
            }]
          })
        });
        const json = await res.json();
        const match = (json.content?.[0]?.text || '').match(/\{[\s\S]*\}/);
        apiData = JSON.parse(match[0]);
        traceLabel = '✓ Product Found';
      } catch {
        apiError  = true;
        traceLabel = '✗ Could not identify';
      }

      // 5. Brief pause so user sees the completed trace before results appear
      await new Promise(r => setTimeout(r, 600));

      // 6. Show results
      if (apiError) {
        traceMode = false;
        psCamResult.innerHTML = '<div class="ps-error">Could not identify product — try better lighting or use Manual Entry.</div>';
      } else {
        showCandidates(apiData.candidates, apiData.top, 'psCameraResult');
        renderProductResult(apiData.top, 'psCameraResult', { imgDataUrl: captureImageDataUrl, source: 'camera' });
      }

      // 7. Swap button to "Scan Again"
      psCaptureBtn.disabled = false;
      psCaptureBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg> Scan Again';
      psCaptureBtn.removeEventListener('click', captureAndIdentify);
      psCaptureBtn.onclick = resetToLive;
    }

    psCaptureBtn.addEventListener('click', captureAndIdentify);

    /* ── Show candidate list ── */
    function showCandidates(candidates, topData, resultId) {
      psCandList.innerHTML = (candidates || []).map((c, i) => `
        <div class="ps-candidate ${i === 0 ? 'active' : ''}" data-idx="${i}">
          <div class="ps-candidate-name">${c.name}</div>
          <div class="ps-candidate-brand">${c.brand}</div>
          <div class="ps-candidate-conf">${c.confidence}% match</div>
        </div>`).join('');
      psCandidates.classList.add('visible');

      psCandList.querySelectorAll('.ps-candidate').forEach(el => {
        el.addEventListener('click', async () => {
          psCandList.querySelectorAll('.ps-candidate').forEach(e => e.classList.remove('active'));
          el.classList.add('active');
          const idx = parseInt(el.dataset.idx);
          if (idx === 0) {
            renderProductResult(topData, resultId, { imgDataUrl: lastCameraImageDataUrl, source: 'camera' });
          } else {
            await fetchAndRender(candidates[idx], resultId);
          }
        });
      });
    }

    /* ── Fetch ESG data for a non-top candidate ── */
    async function fetchAndRender(candidate, resultId) {
      document.getElementById(resultId).innerHTML = '<div class="ps-loading">Fetching Sustainability Report…</div>';
      try {
        const res = await fetch('/api/claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-opus-4-6',
            max_tokens: 900,
            messages: [{
              role: 'user',
              content: `Give ESG sustainability data for "${candidate.name}" by "${candidate.brand}" (${candidate.category}).
Return ONLY valid JSON (no markdown):
{"name":"...","brand":"...","category":"...","description":"...","metrics":{"carbon":N,"supply_chain":N,"labour":N,"materials":N,"packaging":N},"grade":"A-F","origin_country":"Primary manufacturing or sourcing country for this product line (required)","origin_city":"City/region if known else empty string","certifications":[],"claims":[{"status":"verified|partial","text":"..."}],"source":"..."}
Use real published ESG data (MSCI, Good On You, B Lab, Sustainalytics). Always set origin_country from known supply-chain geography. Return ONLY JSON.`
            }]
          })
        });
        const json  = await res.json();
        const match = (json.content?.[0]?.text || '').match(/\{[\s\S]*\}/);
        renderProductResult(JSON.parse(match[0]), resultId, { imgDataUrl: lastCameraImageDataUrl, source: 'camera' });
      } catch {
        document.getElementById(resultId).innerHTML = '<div class="ps-error">Could not load data for this product.</div>';
      }
    }

    /* ── Render editable result card ── */
    function renderProductResult(data, containerId, opts) {
      opts = opts || {};
      data = mergeOriginIntoScanData(data || {});
      const container  = document.getElementById(containerId);
      const gradeClass = /^A/.test(data.grade) ? 'grade-a' : /^B/.test(data.grade) ? 'grade-b' : /^C/.test(data.grade) ? 'grade-c' : 'grade-d';
      const metricColor = scoreColor;
      const escHtml = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      const oc = String(data.origin_country || data.originCountry || '').trim();
      const ocy = String(data.origin_city || data.originCity || '').trim();
      const originLine = [ocy, oc].filter(Boolean).join(', ');

      const metrics = [
        ['Carbon & Climate',     data.metrics?.carbon       ?? 50],
        ['Supply Chain',         data.metrics?.supply_chain ?? 50],
        ['Labour Rights',        data.metrics?.labour       ?? 50],
        ['Material Sustainability', data.metrics?.materials ?? 50],
        ['Packaging & Waste',    data.metrics?.packaging    ?? 50],
      ];

      container.innerHTML = `
        <div class="ps-result-inner">
          <div class="ps-result-header">
            <div class="ps-result-brand-icon">${escHtml((data.brand || '?').charAt(0).toUpperCase())}</div>
            <div class="ps-result-info">
              ${provenanceBadge(true)}
              <div class="ps-result-name" contenteditable="true" title="Click to edit">${escHtml(data.name)}</div>
              <div class="ps-result-brand-line" contenteditable="true" title="Click to edit">${escHtml(data.brand)} · ${escHtml(data.category)}</div>
              <div class="ps-result-desc" contenteditable="true" title="Click to edit">${escHtml(data.description)}</div>
              ${originLine ? `<div class="ps-result-origin"><span class="ps-origin-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg></span><div class="ps-origin-text"><div class="ps-origin-label">Estimated origin</div><div class="ps-origin-val">${escHtml(originLine)}</div></div></div>` : ''}
            </div>
            <div class="result-grade ${gradeClass}">${escHtml(data.grade || '?')}</div>
          </div>

          <div class="ps-metrics-grid">
            ${metrics.map(([label, score]) => `
              <div class="ps-metric-item">
                <div class="ps-metric-label">${label}</div>
                <div class="ps-metric-bar-row">
                  <div class="ps-metric-bar-track">
                    <div class="ps-metric-bar-fill" style="width:0%;background:${metricColor(score)}" data-target="${score}"></div>
                  </div>
                  <input class="ps-metric-score-input" type="number" min="0" max="100" value="${score}">
                </div>
              </div>`).join('')}
          </div>

          ${(data.claims || []).length ? `
          <div class="ps-claims">
            <div class="ps-claims-title">Claims
              <span class="ps-source">${escHtml(data.source)}</span>
            </div>
            ${(data.claims || []).map(c => `
              <div class="ps-claim-row ${escHtml(c.status)}">
                ${claimDot(c.status)}
                <span contenteditable="true">${escHtml(c.text)}</span>
              </div>`).join('')}
          </div>` : ''}

          <div class="ps-actions">
            <button class="ps-save-btn" id="psSaveBtn_${containerId}">Save Product</button>
          </div>
        </div>`;

      // Animate metric bars
      requestAnimationFrame(() => {
        container.querySelectorAll('.ps-metric-bar-fill[data-target]').forEach(bar => {
          setTimeout(() => { bar.style.width = bar.dataset.target + '%'; }, 80);
        });
      });

      // Live-edit metric bars from score inputs
      container.querySelectorAll('.ps-metric-item').forEach(item => {
        const input = item.querySelector('.ps-metric-score-input');
        const bar   = item.querySelector('.ps-metric-bar-fill');
        input.addEventListener('input', () => {
          const v = Math.max(0, Math.min(100, parseInt(input.value) || 0));
          bar.style.width      = v + '%';
          bar.style.background = metricColor(v);
        });
      });

      // Save confirmation
      const saveBtn = document.getElementById('psSaveBtn_' + containerId);
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          if (typeof window.ecoauditCommitScanResult === 'function') {
            window.ecoauditCommitScanResult(data, opts.imgDataUrl || '', opts.source || 'manual');
          }
          saveBtn.textContent = '✓ Saved';
          saveBtn.disabled = true;
          setTimeout(() => { saveBtn.textContent = 'Save Product'; saveBtn.disabled = false; }, 2200);
        });
      }
    }

    /* ── Manual mode ── */
    psManualBtn.addEventListener('click', async () => {
      const brand    = document.getElementById('psBrand')?.value.trim();
      const product  = document.getElementById('psProduct')?.value.trim();
      const category = document.getElementById('psCategory')?.value || 'Consumer Goods';
      const notes    = document.getElementById('psNotes')?.value.trim();

      if (!brand) {
        document.getElementById('psBrand').focus();
        document.getElementById('psBrand').style.borderColor = '#E53935';
        setTimeout(() => { document.getElementById('psBrand').style.borderColor = ''; }, 2000);
        return;
      }

      psManualBtn.disabled = true;
      psManualBtn.innerHTML = 'Auditing…';
      psManualResult.innerHTML = '<div class="ps-loading">Fetching Sustainability Report…</div>';

      try {
        const res = await fetch('/api/claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-opus-4-6',
            max_tokens: 1000,
            messages: [{
              role: 'user',
              content: `Give ESG sustainability data for "${product || brand}" by "${brand}" (${category}).${notes ? ` Additional context: ${notes}.` : ''}
Return ONLY valid JSON (no markdown, no explanation):
{"name":"...","brand":"...","category":"...","description":"...","metrics":{"carbon":N,"supply_chain":N,"labour":N,"materials":N,"packaging":N},"grade":"A/A-/B+/B/B-/C+/C/C-/D+/D/D-/F","origin_country":"Country where this product/brand typically manufactures or sources (required — infer from brand + category if needed)","origin_city":"City or region if known else empty string","certifications":["..."],"claims":[{"status":"verified","text":"..."},{"status":"partial","text":"..."}],"source":"..."}
Use REAL published ESG data — MSCI, Good On You, B Lab, Sustainalytics, CDP, SBTi. Always include origin_country for supply-chain context. If unknown brand, use industry averages for the category and note it. Return ONLY JSON.`
            }]
          })
        });
        const json  = await res.json();
        const match = (json.content?.[0]?.text || '').match(/\{[\s\S]*\}/);
        renderProductResult(JSON.parse(match[0]), 'psManualResult', { source: 'manual' });
      } catch {
        psManualResult.innerHTML = '<div class="ps-error">Could not fetch data. Check your connection and try again.</div>';
      }

      psManualBtn.disabled = false;
      psManualBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Audit This Product';
    });

    // Allow Enter key on brand input
    document.getElementById('psBrand')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') psManualBtn.click();
    });

  })(); // end Product Scanner IIFE


  /* ═══════════════════════════════════════
     ECO TIP: one line under the dashboard header.
     A different tip each day; "Next tip" cycles through.
  ═══════════════════════════════════════ */
  (function initEcoTip() {
    const TIPS = [
      ['Buy to keep.', 'Something you can repair and use for five years beats five cheap replacements.'],
      ['Check recycled claims.', 'Look for a percentage and a certification like GRS, not just the word “recycled”.'],
      ['Try second-hand first.', 'Thrift stores, ThredUP and Back Market keep products in use for longer.'],
      ['Skip the extra packaging.', 'When two options are otherwise similar, pick the one with less packaging.'],
      ['Local matters most for food.', 'For durable goods, what a product is made of usually matters more than how far it travelled.'],
      ['Trust certifiers over slogans.', 'B Corp, Fair Trade and GOTS are checked by third parties. “Eco-friendly” is not.'],
      ['Mind the materials.', 'Conventional cotton is water-hungry; organic cotton, linen and lyocell use less.'],
      ['Scan before you buy.', 'A quick EcoAudit check takes less time than returning something.'],
    ];
    const titleEl = document.getElementById('ecoTipTitle');
    const bodyEl  = document.getElementById('ecoTipBody');
    const nextBtn = document.getElementById('ecoTipNext');
    if (!titleEl || !bodyEl) return;
    const day = Math.floor(Date.now() / 86400000);
    let i = day % TIPS.length;
    function show() { titleEl.textContent = TIPS[i][0]; bodyEl.textContent = TIPS[i][1]; }
    show();
    nextBtn?.addEventListener('click', () => { i = (i + 1) % TIPS.length; show(); });
  })();

  /* ── Deep Link Routing ── */
  try {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    const brandParam = params.get('brand');
    
    if (page === 'brands') {
      const brandTab = document.querySelector('[data-page="brands"]');
      if (brandTab) brandTab.click();
      
      if (brandParam) {
        setTimeout(() => {
          const filter = document.getElementById('brandFilter');
          if (filter) {
            filter.value = brandParam;
            // dispatch input event to trigger applyBrandFilters()
            filter.dispatchEvent(new Event('input'));
          }
        }, 300); // slight delay to ensure render
      }
    }
  } catch (e) {
    console.error('[EcoAudit] Deep link parsing error', e);
  }

  console.log('%c EcoAudit loaded — brand data sourced from B Lab, Good On You, MSCI, Sustainalytics, EcoVadis (2024-2026)', 'color:#52B788;font-weight:bold;font-size:13px;');
})();
