// Set this to your deployed engine URL after you deploy to Render/Railway
// (see ravaq-engine/README.md). Everything on this site calls through here.
const API_BASE = localStorage.getItem('fbb_api_base') || 'https://api.fundedbeyondborders.com';

function apiUrl(path) { return API_BASE.replace(/\/$/, '') + path; }

// Centralized handling for an expired/invalidated session: only fires
// when a token WAS actually sent (meaning the user was previously logged
// in and this is a real expiration/ban/revocation, not just an endpoint
// correctly rejecting an anonymous visitor who never had a token to begin
// with). Without this, a user whose session expired just saw a raw,
// confusing error message per-endpoint (e.g. "you must be logged in as
// this account's owner") with no path back to login — this instead
// clears the stale session and sends them to auth.html with a clear
// reason, so they immediately understand what happened.
function handleExpiredSession(status, hadToken) {
  if (status !== 401 || !hadToken) return;
  if (location.pathname.endsWith('/admin.html')) return; // admin uses a completely separate X-Admin-Key auth system, not this token
  localStorage.removeItem('fbb_token');
  localStorage.removeItem('fbb_user_email');
  if (!location.pathname.endsWith('/auth.html')) {
    location.href = 'auth.html?reason=session_expired';
  }
}

async function apiPost(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('fbb_token');
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(apiUrl(path), { method: 'POST', headers, body: JSON.stringify(body || {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { handleExpiredSession(res.status, !!token); throw new Error(data.error || `Request failed (${res.status})`); }
  return data;
}
async function apiPut(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('fbb_token');
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(apiUrl(path), { method: 'PUT', headers, body: JSON.stringify(body || {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { handleExpiredSession(res.status, !!token); throw new Error(data.error || `Request failed (${res.status})`); }
  return data;
}
async function apiGet(path) {
  const headers = {};
  const token = localStorage.getItem('fbb_token');
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(apiUrl(path), { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { handleExpiredSession(res.status, !!token); throw new Error(data.error || `Request failed (${res.status})`); }
  return data;
}

// ---- cart (kept client-side in localStorage until checkout) --------------
function getCart() {
  try {
    return JSON.parse(localStorage.getItem('fbb_cart') || '[]');
  } catch (err) {
    localStorage.removeItem('fbb_cart'); // corrupted data — clear it so this doesn't keep crashing on every page load
    return [];
  }
}
function saveCart(cart) {
  localStorage.setItem('fbb_cart', JSON.stringify(cart));
  updateCartBadge();
}
function addToCart(model, planSize, price) {
  const cart = getCart();
  cart.push({ model, plan_size: planSize, price });
  saveCart(cart);
}
function removeFromCart(index) {
  const cart = getCart();
  cart.splice(index, 1);
  saveCart(cart);
}
function clearCart() { saveCart([]); }
function updateCartBadge() {
  const el = document.querySelector('.cart-count');
  if (el) el.textContent = getCart().length;
}
document.addEventListener('DOMContentLoaded', updateCartBadge);

function getOwnerLabel() {
  let id = localStorage.getItem('fbb_owner_label');
  if (!id) {
    id = 'trader_' + (window.crypto?.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));
    localStorage.setItem('fbb_owner_label', id);
  }
  return id;
}

// ---- auth session helpers --------------------------------------------
function getToken() { return localStorage.getItem('fbb_token'); }
function isLoggedIn() { return !!getToken(); }
function setSession(token, user) {
  localStorage.setItem('fbb_token', token);
  localStorage.setItem('fbb_user_email', user.email);
  localStorage.setItem('fbb_owner_label', user.email); // once logged in, accounts/orders key off the real email
}
function clearSession() {
  localStorage.removeItem('fbb_token');
  localStorage.removeItem('fbb_user_email');
}

// Cross-tab session sync: the browser's native 'storage' event fires in
// every OTHER open tab (never the one that made the change) whenever
// fbb_token changes in localStorage. Without this, logging out in one tab
// left every other open tab of the same browser — e.g. a live trading
// session in platform.html — still acting as authenticated until its next
// API call happened to fail with a 401, which is both a confusing and a
// mildly risky state to leave a session in. A full reload is the simplest
// way to correctly re-sync every page's in-memory state (auth-gated data,
// displayed balances, etc.) rather than trying to patch each page
// individually for a change that could originate from any other page.
window.addEventListener('storage', (event) => {
  if (event.key === 'fbb_token') location.reload();
});

// Actually revokes the session server-side (not just this browser's copy of
// it) before clearing local storage — see the /auth/logout endpoint for why
// this matters. Best-effort: if the network call fails, the user should
// still be able to log out locally rather than getting stuck.
async function performLogout() {
  try { await apiPost('/auth/logout', {}); } catch (err) { /* still clear locally below even if this fails */ }
  clearSession();
}
async function apiAuthGet(path) {
  const res = await fetch(apiUrl(path), { headers: { Authorization: 'Bearer ' + getToken() } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
function updateAuthNav() {
  const lang = (typeof currentLang === 'function') ? currentLang() : (localStorage.getItem('fbb_lang') || 'fa');
  document.querySelectorAll('.auth-nav-link').forEach(el => {
    if (isLoggedIn()) {
      el.setAttribute('href', 'dashboard.html');
      el.setAttribute('data-i18n', 'nav_dashboard');
    } else {
      el.setAttribute('href', 'auth.html');
      el.setAttribute('data-i18n', 'login_btn');
    }
    const key = el.getAttribute('data-i18n');
    if (typeof I18N !== 'undefined') el.textContent = I18N[lang]?.[key] ?? I18N.en[key];
  });
}
document.addEventListener('DOMContentLoaded', () => {
  updateAuthNav();
  document.addEventListener('fbb:langchange', updateAuthNav);
  wireChatWidget();
});

// The chat bubble/panel markup is duplicated on every page; this makes its
// send button actually create a support ticket instead of doing nothing.
function wireChatWidget() {
  const panel = document.querySelector('.chat-panel');
  if (!panel) return;
  const textarea = panel.querySelector('textarea');
  const sendBtn = panel.querySelector('button.btn-primary');
  if (!textarea || !sendBtn) return;

  sendBtn.addEventListener('click', async () => {
    const message = textarea.value.trim();
    if (!message) return;
    const originalText = sendBtn.textContent;
    sendBtn.disabled = true;
    try {
      const contact_email = isLoggedIn() ? undefined : (prompt(
        (localStorage.getItem('fbb_lang') || 'fa') === 'fa'
          ? 'ایمیلت رو بنویس تا بتونیم جوابتو بفرستیم:'
          : 'Enter your email so we can reply:'
      ) || '');
      if (!isLoggedIn() && !contact_email) { sendBtn.disabled = false; return; }
      await apiPost('/tickets', {
        subject: 'Live chat message',
        message,
        category: 'general',
        contact_email,
      });
      textarea.value = '';
      sendBtn.textContent = '✓';
      setTimeout(() => { sendBtn.textContent = originalText; }, 1500);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      sendBtn.disabled = false;
    }
  });
}

// Non-blocking toast notification — replaces alert() for routine
// success/error feedback so the page never freezes and the message
// matches the site's own visual style instead of an OS dialog.
// type: 'success' | 'error' | '' (neutral/gold, default)
function showToast(message, type = '') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast' + (type ? ` toast-${type}` : '');
  // ACCESSIBILITY: the alert() this replaced was announced automatically
  // by screen readers — without explicit ARIA live-region roles here,
  // this toast would be silently invisible to that audience. 'alert'
  // (assertive) interrupts for errors; 'status' (polite) is used for
  // everything else so routine success messages don't feel disruptive.
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-leaving');
    setTimeout(() => toast.remove(), 200);
  }, 4000);
}

// ---- Google Analytics 4 (admin-configurable, off by default) --------------
// Loaded here (not hardcoded per-page) so every customer-facing page that
// includes this file gets tracking automatically, from ONE admin-panel
// setting — no code edits needed to turn it on, change it, or turn it off.
// admin.html deliberately does NOT include this file (it uses its own
// adminFetch/X-Admin-Key system), so admin visits are never counted.
// Waits for DOMContentLoaded (matching the proven-safe pattern used for
// homepage pricing sync) so apiGet is guaranteed to be defined by the time
// this runs — loading it any earlier previously caused a real bug here.
document.addEventListener('DOMContentLoaded', async function loadAnalytics() {
  try {
    const settings = await apiGet('/settings/public');
    const gaId = settings.ga4_measurement_id;
    if (!gaId) return; // not configured — load nothing, no network request, no tracking
    const gtagScript = document.createElement('script');
    gtagScript.async = true;
    gtagScript.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
    document.head.appendChild(gtagScript);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', gaId);
  } catch (err) {
    console.warn('Analytics failed to load (site still works normally):', err.message);
  }
});
