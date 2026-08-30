// AuthOnce docs — sidebar active-link highlighting on scroll.
// Extracted from inline <script> blocks in docs-ai-agents.html, docs-saas.html,
// and docs-web3.html (2026-08-30) so it's covered by the site's Content-Security-Policy
// via script-src 'self', instead of needing a sha256 hash that breaks on every edit.
// The three pages' inline copies had drifted very slightly (docs-saas.html carried
// one extra comment line the other two didn't) — this file is that content,
// unified, so all three pages now share one identical, single source of truth.
// Sidebar active link on scroll
const sections = document.querySelectorAll('h2[id]');
const links = document.querySelectorAll('.sidebar-link');
const obs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      links.forEach(l => l.classList.remove('active'));
      const active = document.querySelector(`.sidebar-link[href="#${e.target.id}"]`);
      if (active) active.classList.add('active');
    }
  });
}, { rootMargin: '-20% 0px -70% 0px' });
sections.forEach(s => obs.observe(s));
