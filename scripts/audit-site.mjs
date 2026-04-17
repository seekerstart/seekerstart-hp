import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const basePath = '/houou';
const siteOrigin = 'https://www.seekerstart.com';

const publicPages = [
    'index.html',
    'season_stats.html',
    'all_stats.html',
    'season-rules.html',
    'season-rules-s1.html',
    'pickup.html',
    'sponsor.html',
];

const noindexPages = [
    'user.html',
    'all_stats_internal.html',
    'season-rules-s2.html',
];

function fail(message) {
    throw new Error(message);
}

async function read(filePath) {
    return fs.readFile(path.join(repoRoot, filePath), 'utf8');
}

function canonicalFor(fileName) {
    if (fileName === 'index.html') {
        return `${siteOrigin}${basePath}/`;
    }
    return `${siteOrigin}${basePath}/${fileName}`;
}

function extractMatches(content, regex) {
    return [...content.matchAll(regex)].map((match) => match[1]);
}

function normalizeProjectPath(internalUrl) {
    if (internalUrl === `${basePath}/`) {
        return 'index.html';
    }

    if (internalUrl.startsWith(`${basePath}/`)) {
        return decodeURIComponent(internalUrl.slice(`${basePath}/`.length));
    }

    return null;
}

async function ensureInternalLinkTargetsExist(urls) {
    for (const url of urls) {
        const projectPath = normalizeProjectPath(url);
        if (!projectPath) {
            continue;
        }

        try {
            await fs.access(path.join(repoRoot, projectPath));
        } catch {
            fail(`Missing internal link target: ${url} -> ${projectPath}`);
        }
    }
}

async function auditHtmlFile(fileName) {
    const content = await read(fileName);

    const relativeHtmlLinks = extractMatches(
        content,
        /href="((?!https?:\/\/|#|\/houou\/|mailto:|tel:|javascript:)[^"]+\.html(?:\?[^"]*)?)"/g,
    );
    if (relativeHtmlLinks.length > 0) {
        fail(`${fileName} contains relative HTML links: ${relativeHtmlLinks.join(', ')}`);
    }

    const canonical = extractMatches(content, /<link rel="canonical" href="([^"]+)">/g)[0];
    if (publicPages.includes(fileName) && canonical !== canonicalFor(fileName)) {
        fail(`${fileName} has invalid canonical: ${canonical ?? 'missing'}`);
    }

    const ogUrl = extractMatches(content, /<meta property="og:url" content="([^"]+)">/g)[0];
    if (publicPages.includes(fileName) && ogUrl !== canonicalFor(fileName)) {
        fail(`${fileName} has invalid og:url: ${ogUrl ?? 'missing'}`);
    }

    const robots = extractMatches(content, /<meta name="robots" content="([^"]+)">/g)[0];
    if (publicPages.includes(fileName) && robots?.toLowerCase().includes('noindex')) {
        fail(`${fileName} should be indexable but is marked noindex`);
    }

    if (noindexPages.includes(fileName) && !robots?.toLowerCase().includes('noindex')) {
        fail(`${fileName} should be noindex`);
    }

    const internalUrls = extractMatches(content, /href="(\/houou\/[^"#?]+(?:\?[^"]*)?)"/g);
    await ensureInternalLinkTargetsExist(internalUrls);
}

async function auditJsAndConfig(fileName) {
    const content = await read(fileName);
    const hrefAssignments = extractMatches(
        content,
        /href:\s*['"]((?!https?:\/\/|#|\/houou\/)[^'"]+\.html(?:\?[^'"]*)?)['"]/g,
    );

    const jsonLinks = fileName.endsWith('.json')
        ? extractMatches(
            content,
            /:\s*"((?!https?:\/\/|#|\/houou\/)[^"]+\.html(?:\?[^"]*)?)"/g,
        )
        : [];

    const disallowed = [...hrefAssignments, ...jsonLinks].filter((value) =>
        ['index.html', 'season_stats.html', 'all_stats.html', 'season-rules.html', 'season-rules-s1.html', 'season-rules-s2.html', 'pickup.html', 'sponsor.html', 'user.html'].some((file) => value.includes(file))
    );

    if (disallowed.length > 0) {
        fail(`${fileName} contains non-normalized internal page references: ${[...new Set(disallowed)].join(', ')}`);
    }
}

async function auditGeneratedPlayers() {
    const playersJson = JSON.parse(await read(path.join('config', 'players.json')));
    const playerEntries = Object.entries(playersJson.players ?? {});

    for (const [playerId] of playerEntries) {
        const playerFile = path.join('players', `${encodeURIComponent(playerId)}.html`);
        const content = await read(playerFile);
        const canonical = extractMatches(content, /<link rel="canonical" href="([^"]+)">/g)[0];
        const expected = `${siteOrigin}${basePath}/players/${encodeURIComponent(playerId)}.html`;
        if (canonical !== expected) {
            fail(`${playerFile} has invalid canonical`);
        }
    }
}

async function auditVercelConfig() {
    const config = JSON.parse(await read('vercel.json'));
    if (config.trailingSlash !== true) {
        fail('vercel.json must set trailingSlash=true');
    }
}

async function main() {
    await auditVercelConfig();

    for (const fileName of [...publicPages, ...noindexPages]) {
        await auditHtmlFile(fileName);
    }

    for (const fileName of [
        path.join('js', 'header.js'),
        path.join('js', 'stats-loader.js'),
        path.join('js', 'user-loader.js'),
        path.join('js', 'season-rules.js'),
        path.join('js', 'pickup.js'),
        path.join('config', 'season_rule_pages.json'),
        path.join('config', 'featured_players.json'),
    ]) {
        await auditJsAndConfig(fileName);
    }

    await auditGeneratedPlayers();

    for (const required of ['sitemap.xml', 'sitemap-pages.xml', 'sitemap-players.xml', 'robots.txt']) {
        await fs.access(path.join(repoRoot, required));
    }

    console.log('Site audit passed.');
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
