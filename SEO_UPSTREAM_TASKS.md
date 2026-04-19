# Upstream SEO Tasks

This repository now normalizes `/houou/` URLs, generates player profile pages, and publishes `/houou/sitemap.xml`.

The following items still need to be applied in the main `seekerstart.com` site or edge routing layer to maximize domain-level SEO impact:

1. Add permanent internal links from the main Seeker Start site to `https://www.seekerstart.com/houou/`.
2. Include the Houou sitemap in the root-domain sitemap strategy.
   Recommended:
   - add `https://www.seekerstart.com/houou/sitemap.xml` to the root sitemap index, or
   - reference it from the root `https://www.seekerstart.com/robots.txt`
3. Add a persistent Houou link in the main site global navigation or footer.
4. Add contextual links from poker learning articles into `/houou/` hub and ranking pages.
5. If root-level broken URLs are being requested on the main site, add `301` redirects there:
   - `/index.html` -> `/houou/`
   - `/season_stats.html` -> `/houou/season_stats.html`
   - `/season-rules.html` -> `/houou/season-rules.html`
   - `/season-rules-s1.html` -> `/houou/season-rules-s1.html`
   - `/pickup.html` -> `/houou/pickup.html`
   - `/sponsor.html` -> `/houou/sponsor.html`
   - `/all_stats.html` -> `/houou/all_stats.html`

Note:
- `/houou/robots.txt` exists in this repo, but search engines only treat the host-root `/robots.txt` as authoritative.
