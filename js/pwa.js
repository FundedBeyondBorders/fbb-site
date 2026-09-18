// Shared across every page — registers the service worker (enables
// "Install as app" on every OS) and captures the install prompt so any
// page can show its own "Install app" button.

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
}

// Chrome/Edge/Android fire this before showing their own install prompt —
// capturing it lets us trigger installation from our own button instead of
// waiting for the browser's own (easy-to-miss) UI.
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.querySelectorAll('.pwa-install-btn').forEach((btn) => { btn.style.display = 'inline-flex'; });
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  document.querySelectorAll('.pwa-install-btn').forEach((btn) => { btn.style.display = 'none'; });
});

async function triggerPwaInstall() {
  // iOS Safari has no beforeinstallprompt API at all — "Add to Home
  // Screen" only exists inside the Share sheet, so the best we can do
  // there is show instructions instead of a one-tap install.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIOS) {
    alert(
      (document.documentElement.lang === 'fa')
        ? 'برای نصب رو آیفون/آیپد: دکمه‌ی Share (🔺) رو تو سافاری بزن، بعد «Add to Home Screen» رو انتخاب کن.'
        : 'To install on iPhone/iPad: tap the Share button (🔺) in Safari, then choose "Add to Home Screen".'
    );
    return;
  }
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.pwa-install-btn').forEach((btn) => {
    btn.addEventListener('click', triggerPwaInstall);
  });
  // iOS never fires beforeinstallprompt, so it's the one platform where we
  // can't detect installability automatically — show the button by
  // default there and let triggerPwaInstall() explain the manual steps.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandaloneAlready = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isIOS && !isStandaloneAlready) {
    document.querySelectorAll('.pwa-install-btn').forEach((btn) => { btn.style.display = 'inline-flex'; });
  }
});
