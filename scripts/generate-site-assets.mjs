import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const siteOrigin = 'https://www.seekerstart.com';
const basePath = '/houou';
const generatedAt = new Date().toISOString().slice(0, 10);

const publicPages = [
    { path: '', priority: '1.0', changefreq: 'weekly' },
    { path: 'season_stats.html', priority: '0.9', changefreq: 'weekly' },
    { path: 'all_stats.html', priority: '0.8', changefreq: 'weekly' },
    { path: 'season-rules.html', priority: '0.8', changefreq: 'weekly' },
    { path: 'season-rules-s1.html', priority: '0.7', changefreq: 'monthly' },
    { path: 'pickup.html', priority: '0.6', changefreq: 'monthly' },
    { path: 'sponsor.html', priority: '0.5', changefreq: 'monthly' },
];

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function canonicalPath(pagePath) {
    return pagePath ? `${basePath}/${pagePath}` : `${basePath}/`;
}

function canonicalUrl(pagePath) {
    return `${siteOrigin}${canonicalPath(pagePath)}`;
}

function playerDescription(name) {
    return `${name} のポーカー鳳凰戦プレイヤーページ。シーズン別の成績、収支推移、ポーカースタッツを確認できます。`;
}

function buildPlayerPage(playerId, displayName) {
    const name = escapeHtml(displayName);
    const encodedId = encodeURIComponent(playerId);
    const pagePath = `players/${encodedId}.html`;
    const url = canonicalUrl(pagePath);
    const description = escapeHtml(playerDescription(displayName));
    const imageUrl = `${siteOrigin}${basePath}/images/pickup.jpg`;
    const jsonLd = JSON.stringify([
        {
            '@context': 'https://schema.org',
            '@type': 'ProfilePage',
            name: `${displayName} の戦績 | ポーカー鳳凰戦`,
            url,
            description: playerDescription(displayName),
            isPartOf: {
                '@type': 'WebSite',
                name: 'ポーカー鳳凰戦',
                url: `${siteOrigin}${basePath}/`,
            },
            mainEntity: {
                '@type': 'Person',
                identifier: playerId,
                name: displayName,
            },
        },
        {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
                {
                    '@type': 'ListItem',
                    position: 1,
                    name: 'ポーカー鳳凰戦',
                    item: `${siteOrigin}${basePath}/`,
                },
                {
                    '@type': 'ListItem',
                    position: 2,
                    name: 'シーズン別ランキング',
                    item: `${siteOrigin}${basePath}/season_stats.html`,
                },
                {
                    '@type': 'ListItem',
                    position: 3,
                    name: `${displayName} の戦績`,
                    item: url,
                },
            ],
        },
    ], null, 2);

    return `<!DOCTYPE html>
<html lang="ja" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <link rel="icon" href="/houou/images/favicon.png" type="image/png">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name} の戦績 | ポーカー鳳凰戦</title>
    <meta name="description" content="${description}">
    <meta name="robots" content="index,follow">
    <link rel="canonical" href="${url}">
    <meta property="og:type" content="profile">
    <meta property="og:site_name" content="ポーカー鳳凰戦">
    <meta property="og:title" content="${name} の戦績 | ポーカー鳳凰戦">
    <meta property="og:description" content="${description}">
    <meta property="og:url" content="${url}">
    <meta property="og:image" content="${imageUrl}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${name} の戦績 | ポーカー鳳凰戦">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${imageUrl}">
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <link rel="stylesheet" href="/houou/css/style.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="/houou/js/site-config.js"></script>
    <script type="application/ld+json">
${jsonLd}
    </script>
</head>
<body class="antialiased" data-player-id="${escapeHtml(playerId)}">
    <div id="site-header"></div>

    <main class="pt-28 pb-24 min-h-screen">
        <div class="container mx-auto px-6 max-w-4xl">
            <div id="player-header" class="mb-10">
                <div class="py-12 text-center text-gray-500">
                    <i class="fas fa-spinner fa-spin text-2xl mb-4 block text-gold/50"></i>
                    データを読み込んでいます...
                </div>
            </div>

            <div id="user-season-tabs" class="mb-8 hidden">
                <div class="flex flex-wrap gap-2"></div>
            </div>

            <div id="season-summary" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10 hidden">
                <div class="bg-white/5 p-5 border border-white/10 rounded text-center">
                    <div id="summary-rank" class="text-gold text-2xl font-serif font-black mb-1">--</div>
                    <div class="text-gray-500 text-[10px] uppercase tracking-widest">順位</div>
                </div>
                <div class="bg-white/5 p-5 border border-white/10 rounded text-center">
                    <div id="summary-profit" class="text-2xl font-serif font-black mb-1">--</div>
                    <div class="text-gray-500 text-[10px] uppercase tracking-widest">収支 (BB)</div>
                </div>
                <div class="bg-white/5 p-5 border border-white/10 rounded text-center">
                    <div id="summary-hands" class="text-gold text-2xl font-serif font-black mb-1">--</div>
                    <div class="text-gray-500 text-[10px] uppercase tracking-widest">ハンド数</div>
                </div>
                <div class="bg-white/5 p-5 border border-white/10 rounded text-center">
                    <div id="summary-sessions" class="text-gold text-2xl font-serif font-black mb-1">--</div>
                    <div class="text-gray-500 text-[10px] uppercase tracking-widest">参加節数</div>
                </div>
            </div>

            <div id="weekly-chart-section" class="mb-10 hidden">
                <div class="jp-card p-6 md:p-8 corner-deco">
                    <div class="flex items-center justify-between mb-6">
                        <div class="flex items-center gap-3">
                            <i class="fas fa-chart-line text-gold text-lg"></i>
                            <h2 class="text-lg font-serif font-bold text-white">節ごとの成績推移</h2>
                        </div>
                        <button id="share-chart-x" class="share-btn share-btn-x text-[11px] py-1.5 px-3">
                            <i class="fab fa-x-twitter"></i> Xで共有
                        </button>
                    </div>
                    <div class="chart-container" style="height: 350px; min-height: 300px;">
                        <canvas id="weekly-chart"></canvas>
                    </div>
                </div>
            </div>

            <div id="poker-stats-section" class="mb-10 hidden">
                <div class="jp-card p-6 md:p-8 corner-deco">
                    <div class="flex items-center gap-3 mb-6">
                        <i class="fas fa-chart-bar text-gold text-lg"></i>
                        <h2 class="text-lg font-serif font-bold text-white">ポーカースタッツ</h2>
                    </div>
                    <div id="poker-stats-bars" class="space-y-5"></div>
                </div>
            </div>

            <div id="league-conditions-section" class="mb-10 hidden">
                <div class="jp-card p-6 md:p-8 corner-deco">
                    <div class="flex items-center gap-3 mb-6">
                        <i class="fas fa-trophy text-gold text-lg"></i>
                        <h2 class="text-lg font-serif font-bold text-white">リーグ条件</h2>
                    </div>
                    <div id="league-conditions-content"></div>
                </div>
            </div>

            <div id="share-section" class="hidden">
                <div class="flex flex-wrap gap-3 justify-center">
                    <button id="share-x" class="share-btn share-btn-x">
                        <i class="fab fa-x-twitter"></i> Xで共有
                    </button>
                    <button id="share-url" class="share-btn">
                        <i class="fas fa-link"></i> URLをコピー
                    </button>
                </div>
            </div>
        </div>
    </main>

    <footer class="bg-[#050505] py-12 border-t border-white/5">
        <div class="container mx-auto px-6 text-center">
            <div class="flex items-center justify-center gap-4 mb-6">
                <img src="/houou/images/SeekerStart_logo.png" alt="Logo" class="h-6 w-auto" onerror="this.src='https://via.placeholder.com/80x30/111/d4af37?text=Logo'">
                <span class="text-base font-serif font-black tracking-[0.2em] text-white">ポーカー鳳凰戦</span>
            </div>
            <p class="text-gray-600 text-[10px] mb-6">
                運営主体：Seeker Start（ポーカー学習コミュニティ）
            </p>
            <div class="text-[9px] text-gray-700 font-bold uppercase tracking-[0.4em]">
                &copy; 2026 POKER HOUOU LEAGUE. ALL RIGHTS RESERVED.
            </div>
        </div>
    </footer>

    <script src="/houou/js/header.js"></script>
    <script src="/houou/js/user-loader.js"></script>
</body>
</html>
`;
}

function buildUrlSet(urls) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((item) => `  <url>
    <loc>${item.loc}</loc>
    <lastmod>${item.lastmod}</lastmod>
    <changefreq>${item.changefreq}</changefreq>
    <priority>${item.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
}

function buildSitemapIndex(entries) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((item) => `  <sitemap>
    <loc>${item.loc}</loc>
    <lastmod>${item.lastmod}</lastmod>
  </sitemap>`).join('\n')}
</sitemapindex>
`;
}

async function main() {
    const playersPath = path.join(repoRoot, 'config', 'players.json');
    const playersDir = path.join(repoRoot, 'players');
    const playersJson = JSON.parse(await fs.readFile(playersPath, 'utf8'));
    const players = Object.entries(playersJson.players ?? {});

    await fs.mkdir(playersDir, { recursive: true });

    for (const [playerId, player] of players) {
        const filePath = path.join(playersDir, `${encodeURIComponent(playerId)}.html`);
        const html = buildPlayerPage(playerId, player.display_name || playerId);
        await fs.writeFile(filePath, html, 'utf8');
    }

    const pageUrls = publicPages.map((page) => ({
        loc: canonicalUrl(page.path),
        lastmod: generatedAt,
        changefreq: page.changefreq,
        priority: page.priority,
    }));

    const playerUrls = players.map(([playerId]) => ({
        loc: canonicalUrl(`players/${encodeURIComponent(playerId)}.html`),
        lastmod: generatedAt,
        changefreq: 'weekly',
        priority: '0.6',
    }));

    await fs.writeFile(path.join(repoRoot, 'sitemap-pages.xml'), buildUrlSet(pageUrls), 'utf8');
    await fs.writeFile(path.join(repoRoot, 'sitemap-players.xml'), buildUrlSet(playerUrls), 'utf8');
    await fs.writeFile(
        path.join(repoRoot, 'sitemap.xml'),
        buildSitemapIndex([
            { loc: canonicalUrl('sitemap-pages.xml'), lastmod: generatedAt },
            { loc: canonicalUrl('sitemap-players.xml'), lastmod: generatedAt },
        ]),
        'utf8',
    );

    const robotsTxt = `User-agent: *
Allow: /
Disallow: /houou/user.html
Disallow: /houou/all_stats_internal.html
Disallow: /houou/season-rules-s2.html

Sitemap: ${canonicalUrl('sitemap.xml')}
`;

    await fs.writeFile(path.join(repoRoot, 'robots.txt'), robotsTxt, 'utf8');

    console.log(`Generated ${players.length} player pages and sitemap assets.`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
