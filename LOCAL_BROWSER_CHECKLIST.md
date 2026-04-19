# Local Browser Checklist

Base URL: `http://localhost:8000/houou/`

## Quick Checks
- Open `/houou` and confirm it redirects to `/houou/`.
- Open the top page and verify the header links point to `/houou/...`.
- Open `season_stats.html` and confirm ranking rows render after load.
- Click a player name in ranking and confirm the static URL is `/houou/players/{id}.html`.
- Open `user.html?id={id}` and confirm it still renders as a compatibility entry point.
- Open `season-rules.html` and confirm the archive cards and ranking links render.
- Open `pickup.html` and confirm featured players render.
- Open `sponsor.html` and confirm sponsor content renders.

## SEO Checks
- View source for the top page and confirm `canonical` is `https://www.seekerstart.com/houou/`.
- View source for a static player page and confirm:
  - `canonical` points to `/houou/players/{id}.html`
  - `robots` is `index,follow`
- View source for `user.html?id=...` and confirm `robots` is `noindex,nofollow`.
- Open `/houou/robots.txt` and `/houou/sitemap.xml` and confirm they load.

## Regression Checks
- From the top page, navigate to ranking, season rules, pickup, and sponsor, then use the header to return.
- On a static player page, confirm:
  - player name is shown
  - weekly chart section is visible
  - poker stats section is visible
  - share buttons are present
- Confirm no obvious 404 requests in the browser Network panel while loading the pages above.
