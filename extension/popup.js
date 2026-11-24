/* ═══════════════════════════════════════════
   ECOAUDIT — Extension Popup Logic
   Real active-tab scanning, auth-aware,
   purchase decision flow.
═══════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── State ── */
  let currentUser = null;
  let currentAuditResult = null;
  let currentProductData = null;

  /* ── DOM refs ── */
  const $ = id => document.getElementById(id);

  const stateAuth     = $('stateAuth');
  const stateScanning = $('stateScanning');
  const stateReady    = $('stateReady');
  const stateIdle     = $('stateIdle');
  const stateOffline  = $('stateOffline');
  const stateResult   = $('stateResult');

  const popupFooter   = $('popupFooter');
  const headerUser    = $('headerUser');
  const headerAvatar  = $('headerAvatar');
  const headerUsername = $('headerUsername');
  const headerScoreWrap = $('headerScoreWrap');

  /* ── Show/Hide helpers ── */
  function hideAll() {
    [stateAuth, stateScanning, stateReady, stateIdle, stateOffline, stateResult].forEach(el => {
      if (el) el.classList.add('hidden');
    });
  }

  function showAuth() {
    hideAll();
    stateAuth.classList.remove('hidden');
    popupFooter.classList.add('hidden');
    headerUser.classList.add('hidden');
    headerScoreWrap.classList.add('hidden');
  }

  function showScanning() {
    hideAll();
    stateScanning.classList.remove('hidden');
  }

  function showReady(productData) {
    hideAll();
    $('readyProductName').textContent = productData?.productName || 'Unknown Product';
    stateReady.classList.remove('hidden');
  }

  function showIdle() {
    hideAll();
    stateIdle.classList.remove('hidden');
  }

  function showOffline() {
    hideAll();
    stateOffline.classList.remove('hidden');
  }

  function showResult() {
    hideAll();
    stateResult.classList.remove('hidden');
  }

  function setupAuthUI(user) {
    if (user) {
      headerUser.classList.remove('hidden');
      headerScoreWrap.classList.add('hidden');
      headerAvatar.textContent = user.initials || (user.name || 'U').charAt(0).toUpperCase();
      headerUsername.textContent = user.name || user.email || '';
      popupFooter.classList.remove('hidden');
    }
  }

  /* ── Grade helpers ── */
  function gradeClass(grade) {
    if (!grade) return 'grade-c';
    const g = grade.charAt(0).toUpperCase();
    if (g === 'A') return 'grade-a';
    if (g === 'B') return 'grade-b';
    if (g === 'C') return 'grade-c';
    return 'grade-d';
  }

  function tagClass(score) {
    if (score >= 65) return 'tag-good';
    if (score >= 40) return 'tag-warn';
    return 'tag-danger';
  }

  /* ── Render audit result ── */
  function renderAuditResult(auditResult, productData) {
    currentAuditResult = auditResult;
    currentProductData = productData;

    const name = auditResult.productName || productData?.productName || 'Unknown Product';
    const score = auditResult.score || 50;
    const grade = auditResult.letterGrade || auditResult.grade || '?';
    const label = auditResult.gradeLabel || '';
    const risk  = auditResult.risk || label;

    // Product strip: Product Name
    $('productName').textContent = name;
    
    // Explicit Retailer vs Audited Brand
    const auditedBrand = auditResult.brand || 'Unknown';
    const retailerVal = auditResult.retailer || productData?.retailer || '';
    
    let brandHtml = `<b>Audited Brand:</b> ${auditedBrand}`;
    if (retailerVal && retailerVal.toLowerCase() !== auditedBrand.toLowerCase()) {
      brandHtml += ` <br><span style="font-size:9.5px; opacity:0.8;">Sold via: ${retailerVal}</span>`;
    }
    $('productBrandInfo').innerHTML = brandHtml;

    // Warning for low confidence
    if (auditResult.confidence === 'low') {
      $('brandWarning').classList.remove('hidden');
    } else {
      $('brandWarning').classList.add('hidden');
    }

    // Score circle
    const circle = $('scoreCircle');
    circle.textContent = grade;
    circle.className = 'score-circle ' + gradeClass(grade);

    // Score detail
    $('scoreSubtitle').textContent = score + ' / 100';
    const tag = $('scoreTag');
    tag.textContent = risk;
    tag.className = 'score-tag ' + tagClass(score);

    // Metrics
    const metricsBlock = $('metricsBlock');
    const metrics = auditResult.metrics || [];
    if (metrics.length) {
      metricsBlock.innerHTML = metrics.map(m => `
        <div class="metric-row">
          <span class="metric-name">${m.name}</span>
          <div class="metric-track">
            <div class="metric-fill" style="width:0%; background:${m.color}" data-target="${m.score || m.pct}"></div>
          </div>
          <span class="metric-pct">${m.score || m.pct}%</span>
        </div>
      `).join('');
      requestAnimationFrame(() => {
        metricsBlock.querySelectorAll('.metric-fill[data-target]').forEach(bar => {
          setTimeout(() => { bar.style.width = bar.dataset.target + '%'; }, 80);
        });
      });
    } else {
      metricsBlock.innerHTML = '';
    }

    // Claims
    const claims = auditResult.claims || auditResult.claimChecks || [];
    const claimsList = $('claimsList');
    if (claims.length) {
      claimsList.innerHTML = claims.map(c => {
        const status = c.status || 'warn';
        const cls = status === 'verified' || status === 'pass' ? 'pass'
                  : status === 'negative' || status === 'fail' ? 'fail' : 'warn';
        return `<div class="claim-item ${cls}"><span class="claim-dot"></span><span>${c.text}</span></div>`;
      }).join('');
      $('claimsBlock').classList.remove('hidden');
    } else {
      $('claimsBlock').classList.add('hidden');
    }

    // Purchase decision
    $('purchaseDecision').classList.remove('hidden');
    $('purchaseConfirmYes').classList.add('hidden');

    // Update header score
    $('headerScore').textContent = score;

    showResult();
  }

  /* ── Purchase decision handlers ── */
  $('purchaseYes')?.addEventListener('click', () => {
    if (!currentUser || !currentAuditResult) return;
    $('purchaseDecision').classList.add('hidden');
    $('purchaseLoading').classList.remove('hidden');
    
    const product = {
      productName: currentAuditResult.productName || currentProductData?.productName || '',
      brand:       currentAuditResult.brand || currentProductData?.brand || '',
      score:       currentAuditResult.score || 50,
      grade:       currentAuditResult.letterGrade || currentAuditResult.grade || '?',
      gradeClass:  gradeClass(currentAuditResult.letterGrade || currentAuditResult.grade),
      summary:     currentAuditResult.summary || '',
      materials:   currentAuditResult.materials || '',
      concerns:    currentAuditResult.concerns || '',
      positives:   currentAuditResult.positives || '',
      category:    currentAuditResult.category || '',
      url:         currentProductData?.url || '',
      image:       currentProductData?.image || '',
      price:       currentProductData?.price || '',
      retailer:    currentProductData?.retailer || '',
    };
    chrome.runtime.sendMessage({
      action: 'savePurchase',
      email: currentUser.email,
      product,
    }, () => {
      $('purchaseLoading').classList.add('hidden');
      $('purchaseConfirmYes').classList.remove('hidden');
      $('purchaseConfirmYes').style.display = 'block';
    });
  });

  /* ── Sign out ── */
  $('signOutBtn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'setAuthUser', user: null }, () => {
      currentUser = null;
      currentAuditResult = null;
      currentProductData = null;
      showAuth();
    });
  });

  /* ── Check active tab ── */
  async function checkCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
        showIdle();
        return;
      }

      // Try to get product data from content script
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getProductData' });
        currentProductData = response?.productData;
      } catch {
        // Not injected yet, try to inject
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
          await new Promise(r => setTimeout(r, 800));
          const resp = await chrome.tabs.sendMessage(tab.id, { action: 'getProductData' });
          currentProductData = resp?.productData;
        } catch {
          // Injection failed
        }
      }

      if (!currentProductData || !currentProductData.productName) {
        showIdle();
      } else {
        showReady(currentProductData);
      }
    } catch (err) {
      showIdle();
    }
  }

  /* ── Execute Scan ── */
  function executeScan() {
    if (!currentProductData) return;
    showScanning();
    
    chrome.runtime.sendMessage({
      action: 'requestAudit',
      productData: currentProductData,
    }, response => {
      if (chrome.runtime.lastError) {
        showOffline();
        return;
      }
      const result = response?.result;
      if (result) {
        renderAuditResult(result, currentProductData);
        saveToHistory(result, currentProductData);
      } else {
        showOffline();
      }
    });
  }

  /* ── History management ── */
  function saveToHistory(auditResult, productData) {
    const entry = {
      name:       auditResult.productName || productData?.productName || 'Product',
      grade:      auditResult.letterGrade || auditResult.grade || '?',
      gradeClass: gradeClass(auditResult.letterGrade || auditResult.grade),
      score:      auditResult.score || 50,
      url:        productData?.url || '',
      time:       new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    chrome.runtime.sendMessage({
      action: 'productPageDetected',
      domain: productData?.retailer || '',
      product: entry.name,
      score: entry.score,
      grade: entry.grade,
      url: entry.url,
    });
    renderLocalHistory(entry);
  }

  function renderLocalHistory(newEntry) {
    chrome.runtime.sendMessage({ action: 'getHistory' }, response => {
      if (chrome.runtime.lastError) return;
      const history = response?.history || [];
      renderHistoryList(history);
    });
  }

  function renderHistoryList(history) {
    const list = $('historyList');
    const empty = $('emptyHistory');

    if (!history.length) {
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

    list.innerHTML = history.slice(0, 20).map(item => {
      const gc = item.gradeClass || gradeClass(item.grade);
      const time = item.time || (item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
      return `
        <div class="history-item">
          <div class="history-grade ${gc}">${item.grade || '?'}</div>
          <div class="history-name">${item.name || item.product || 'Product'}</div>
          <div class="history-time">${time}</div>
        </div>
      `;
    }).join('');
  }

  /* ── Scan Now button ── */
  $('scanNowBtn')?.addEventListener('click', executeScan);

  /* ── Open Dashboard ── */
  $('openDashboard')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openDashboard' });
  });

  /* ── Auth tab switching ── */
  const authTabs = document.querySelectorAll('#authTabs .modal-tab');
  const loginForm = $('loginForm');
  const signupForm = $('signupForm');
  const authTitle = $('authTitle');
  const authDesc = $('authDesc');

  function setExtensionAuthTab(tab) {
    const signup = tab === 'signup';
    authTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    clearAuthMessages();
    signupForm.style.display = signup ? '' : 'none';
    loginForm.style.display = signup ? 'none' : '';
    signupForm.querySelectorAll('input, button').forEach(el => { el.disabled = !signup; });
    loginForm.querySelectorAll('input, button').forEach(el => { el.disabled = signup; });
    if (signup) {
      authTitle.textContent = 'Create Account';
      authDesc.textContent = 'Create an account to save your impact data across devices.';
      const le = $('loginEmail'), lp = $('loginPassword');
      const se = $('signupEmail'), sp = $('signupPassword');
      if (se && le && !String(se.value || '').trim() && String(le.value || '').trim()) se.value = le.value.trim();
      if (sp && lp && !String(sp.value || '') && String(lp.value || '')) sp.value = lp.value;
    } else {
      authTitle.textContent = 'Sign in to EcoAudit';
      authDesc.textContent = 'Connect your EcoAudit account to scan products, track purchases, and find sustainable alternatives.';
      const se = $('signupEmail'), sp = $('signupPassword');
      const le = $('loginEmail'), lp = $('loginPassword');
      if (le && se && !String(le.value || '').trim() && String(se.value || '').trim()) le.value = se.value.trim();
      if (lp && sp && !String(lp.value || '') && String(sp.value || '')) lp.value = sp.value;
    }
  }

  authTabs.forEach(tab => {
    tab.addEventListener('click', () => setExtensionAuthTab(tab.dataset.tab));
  });
  setExtensionAuthTab('login');

  function clearAuthMessages() {
    $('authError').className = 'auth-error';
    $('authSuccess').className = 'auth-success';
  }
  function showError(msg) {
    const el = $('authError');
    el.textContent = msg; el.className = 'auth-error show';
    $('authSuccess').className = 'auth-success';
  }
  function showSuccess(msg) {
    const el = $('authSuccess');
    el.textContent = msg; el.className = 'auth-success show';
    $('authError').className = 'auth-error';
  }

  /* ── Login form ── */
  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('loginEmail').value.trim().toLowerCase();
    const password = $('loginPassword').value;

    try {
      const response = await fetch('http://localhost:3000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      if (response.ok) {
        // Sync to extension
        chrome.runtime.sendMessage({
          action: 'setAuthUser',
          user: data.user
        }, () => {
          showSuccess('Signed in successfully!');
          setTimeout(() => {
            currentUser = data.user;
            setupAuthUI(currentUser);
            checkCurrentTab();
          }, 1000);
        });
      } else {
        showError(data.error || 'Login failed');
      }
    } catch (err) {
      showError('Network error. Make sure the server is running.');
    }
  });

  /* ── Signup form ── */
  signupForm.addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('signupName').value.trim();
    const email = $('signupEmail').value.trim().toLowerCase();
    const password = $('signupPassword').value;

    if (password.length < 6) {
      showError('Password must be at least 6 characters.');
      return;
    }

    try {
      const response = await fetch('http://localhost:3000/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      let data = await response.json().catch(() => ({}));
      if (response.ok) {
        showSuccess('Account created! Signing you in…');
        setTimeout(() => {
          chrome.runtime.sendMessage({
            action: 'setAuthUser',
            user: data.user
          }, () => {
            currentUser = data.user;
            setupAuthUI(currentUser);
            checkCurrentTab();
          });
        }, 1000);
      } else if (response.status === 409) {
        const loginRes = await fetch('http://localhost:3000/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        data = await loginRes.json().catch(() => ({}));
        if (loginRes.ok) {
          showSuccess('Welcome back! Signing you in…');
          setTimeout(() => {
            chrome.runtime.sendMessage({
              action: 'setAuthUser',
              user: data.user
            }, () => {
              currentUser = data.user;
              setupAuthUI(currentUser);
              checkCurrentTab();
            });
          }, 600);
        } else {
          showError(data.error || 'Account exists — sign in with your password.');
        }
      } else {
        showError(data.error || 'Signup failed');
      }
    } catch (err) {
      showError('Network error. Make sure the server is running.');
    }
  });

  /* ── Init ── */
  async function init() {
    // Check auth
    chrome.runtime.sendMessage({ action: 'getAuthUser' }, response => {
      if (chrome.runtime.lastError) {
        showAuth();
        return;
      }

      currentUser = response?.user;

      if (!currentUser) {
        showAuth();
        return;
      }

      // User is authenticated
      setupAuthUI(currentUser);

      // Check current tab to see if ready
      checkCurrentTab();
    });
  }

  init();

})();
