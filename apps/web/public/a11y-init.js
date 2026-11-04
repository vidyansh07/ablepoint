/* Runs synchronously from <head> before first paint.
   1) Applies saved text-size and contrast preferences (stored in this browser only, never sent anywhere).
   2) Arms scroll-reveal only when motion is allowed and IntersectionObserver exists; it FAILS OPEN: if the observer script
      has not started within 3 s, reveal is disarmed and everything is simply visible. */
(function () {
  var root = document.documentElement;
  try {
    var p = JSON.parse(localStorage.getItem('ap_prefs') || '{}');
    if (p.text === '115' || p.text === '130') root.setAttribute('data-text', p.text);
    if (p.contrast === 'high') root.setAttribute('data-contrast', 'high');
  } catch (e) { /* storage unavailable: defaults apply */ }
  try {
    if ('IntersectionObserver' in window && window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
      root.classList.add('reveal-ready');
      setTimeout(function () { if (!root.hasAttribute('data-reveal-active')) root.classList.remove('reveal-ready'); }, 3000);
    }
  } catch (e) { /* no reveal */ }
})();
