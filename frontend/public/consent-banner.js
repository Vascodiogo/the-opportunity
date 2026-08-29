// AuthOnce cookie consent banner + gated GA4 loader — 2026-08-25.
//
// Only non-essential cookie/tracking mechanism in the app is GA4. GA4 never
// loads until this records an explicit "accept". Choice is stored in
// localStorage and can be changed any time via the "Cookie preferences"
// pill in the bottom-left corner, present on every page regardless of
// app/React state.
//
// Deliberately plain JS, outside the React tree (so it works even if the
// app fails to mount), and deliberately an external file rather than
// inline in index.html: keeping it external means it's covered by CSP's
// script-src 'self' automatically, with no per-edit hash to maintain in
// frontend/public/_headers (see that file's script-src comment). All
// styling lives in consent-banner.css and is applied via className, not
// inline style attributes/cssText — inline style attributes and cssText
// assignment ARE blocked by a strict CSP style-src, unlike React's
// per-property style={{}} prop, which the rest of the app uses safely.
(function () {
  var CONSENT_KEY = "authonce_cookie_consent"; // "accepted" | "rejected"
  var GA_ID = "G-5NE0QK40WZ";

  function getConsent() {
    try { return window.localStorage.getItem(CONSENT_KEY); } catch (e) { return null; }
  }
  function setConsent(value) {
    try { window.localStorage.setItem(CONSENT_KEY, value); } catch (e) { /* private mode etc — banner will just reappear */ }
  }

  window.__authonceLoadGA = function () {
    if (window.__authonceGALoaded) return;
    window.__authonceGALoaded = true;
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", GA_ID);
  };

  function removeBanner() {
    var el = document.getElementById("authonce-cookie-banner");
    if (el) el.remove();
  }

  function showBanner() {
    removeBanner();
    var bar = document.createElement("div");
    bar.id = "authonce-cookie-banner";
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-label", "Cookie consent");

    var text = document.createElement("div");
    text.className = "authonce-cb-text";
    text.appendChild(document.createTextNode(
      "We use an analytics cookie (Google Analytics) to understand how visitors use authonce.io, so we can improve it. It is off by default. See our "
    ));
    var link = document.createElement("a");
    link.href = "/legal";
    link.textContent = "Privacy Policy";
    text.appendChild(link);
    text.appendChild(document.createTextNode(" for details."));

    var btnRow = document.createElement("div");
    btnRow.className = "authonce-cb-buttons";

    function makeButton(labelText, primary) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = labelText;
      if (primary) b.className = "authonce-cb-primary";
      return b;
    }

    var acceptBtn = makeButton("Accept", true);
    acceptBtn.onclick = function () {
      setConsent("accepted");
      window.__authonceLoadGA();
      removeBanner();
    };

    var rejectBtn = makeButton("Reject", false);
    rejectBtn.onclick = function () {
      setConsent("rejected");
      removeBanner();
      // If GA was already running this session (e.g. user previously
      // accepted, then reopened preferences and changed their mind),
      // a reload is the only clean way to actually stop it — the
      // already-injected script can't be un-run in place.
      if (window.__authonceGALoaded) window.location.reload();
    };

    btnRow.appendChild(rejectBtn);
    btnRow.appendChild(acceptBtn);
    bar.appendChild(text);
    bar.appendChild(btnRow);
    document.body.appendChild(bar);
  }

  function showPreferencesPill() {
    if (document.getElementById("authonce-cookie-prefs-pill")) return;
    var pill = document.createElement("button");
    pill.id = "authonce-cookie-prefs-pill";
    pill.type = "button";
    pill.textContent = "Cookie preferences";
    pill.setAttribute("aria-label", "Open cookie preferences");
    pill.onclick = function () { showBanner(); };
    document.body.appendChild(pill);
  }

  function init() {
    var consent = getConsent();
    if (consent === "accepted") {
      window.__authonceLoadGA();
    } else if (consent !== "rejected") {
      showBanner();
    }
    showPreferencesPill(); // always present, so consent can be changed later
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
