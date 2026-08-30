// AuthOnce legal.html — tab switcher between ToS / Privacy / Refund / Subscriber docs.
// Extracted from an inline <script> block (2026-08-30) so it's covered by the
// site's Content-Security-Policy via script-src 'self', instead of needing a
// sha256 hash that breaks every time this page's content is edited.
function showDoc(doc) {
  document.querySelectorAll('.doc').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.doc-tab').forEach(el => el.classList.remove('active'));
  document.getElementById('doc-' + doc).classList.add('active');
  document.querySelectorAll('.doc-tab')[['tos','privacy','refund','subscriber'].indexOf(doc)].classList.add('active');
  window.scrollTo(0, 0);
}
