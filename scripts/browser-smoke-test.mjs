import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const repoRoot = process.cwd();
const baseUrl = process.env.HOUOU_BASE_URL || 'http://localhost:8000/houou/';
const browserCandidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

const browserChecks = [
    {
        name: 'Top Page',
        url: `${baseUrl}`,
        patterns: [
            'href="/houou/season_stats.html"',
            'href="/houou/season-rules.html"',
            'href="/houou/pickup.html"',
            'href="/houou/sponsor.html"',
            'ポーカー鳳凰戦',
        ],
    },
    {
        name: 'Season Stats',
        url: `${baseUrl}season_stats.html`,
        patterns: [
            'プレイヤーランキング',
            'シーズン 1',
            '/houou/all_stats.html',
        ],
    },
    {
        name: 'All Stats',
        url: `${baseUrl}all_stats.html`,
        patterns: [
            'player-name-link',
            'href="/houou/players/',
            'arash!',
        ],
    },
    {
        name: 'Season Rules Index',
        url: `${baseUrl}season-rules.html`,
        patterns: [
            'シーズン条件アーカイブ',
            'href="/houou/season-rules-s1.html"',
            'href="/houou/season_stats.html"',
        ],
    },
    {
        name: 'Pickup',
        url: `${baseUrl}pickup.html`,
        patterns: [
            '注目選手',
            'スーカンツ',
            'やましー',
        ],
    },
    {
        name: 'Sponsor',
        url: `${baseUrl}sponsor.html`,
        patterns: [
            '協賛一覧',
            'JOPT',
        ],
    },
    {
        name: 'User Compatibility Page',
        url: `${baseUrl}user.html?id=k5rEzFp2MR`,
        patterns: [
            'arash!',
            '節ごとの成績推移',
            'ポーカースタッツ',
            'meta name="robots" content="noindex,nofollow"',
        ],
    },
    {
        name: 'Static Player Page',
        url: `${baseUrl}players/k5rEzFp2MR.html`,
        patterns: [
            'arash!',
            '節ごとの成績推移',
            'ポーカースタッツ',
            'data-player-id="k5rEzFp2MR"',
            'https://www.seekerstart.com/houou/players/k5rEzFp2MR.html',
        ],
    },
];

async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function resolveBrowserPath() {
    for (const candidate of browserCandidates) {
        if (await fileExists(candidate)) {
            return candidate;
        }
    }
    throw new Error('No supported browser binary found for smoke tests.');
}

async function fetchStatus(url, options = {}) {
    const response = await fetch(url, options);
    return response;
}

async function dumpDom(browserPath, url) {
    const userDataDir = path.join(repoRoot, '.chrome-headless-test');
    await fs.mkdir(userDataDir, { recursive: true });

    try {
        const { stdout, stderr } = await execFileAsync(browserPath, [
            '--headless=new',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            `--user-data-dir=${userDataDir}`,
            '--virtual-time-budget=8000',
            '--dump-dom',
            url,
        ], {
            cwd: repoRoot,
            maxBuffer: 20 * 1024 * 1024,
        });

        return { stdout, stderr };
    } catch (error) {
        const stdout = error.stdout || '';
        const stderr = error.stderr || '';
        if (!stdout) {
            throw new Error(`Browser dump failed for ${url}\n${stderr || error.message}`);
        }
        return { stdout, stderr };
    }
}

async function assertRedirect() {
    const noSlashUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const response = await fetchStatus(noSlashUrl, { redirect: 'manual' });
    if (response.status !== 301 || response.headers.get('location') !== '/houou/') {
        throw new Error(`Expected ${noSlashUrl} to redirect to /houou/ but got ${response.status} ${response.headers.get('location')}`);
    }
    console.log(`OK\tRedirect\t${noSlashUrl} -> ${response.headers.get('location')}`);
}

async function assertHttp200(url) {
    const response = await fetchStatus(url);
    if (!response.ok) {
        throw new Error(`Expected 200 for ${url} but got ${response.status}`);
    }
    console.log(`OK\tHTTP\t${response.status}\t${url}`);
}

async function assertDomContains(browserPath, check) {
    const { stdout } = await dumpDom(browserPath, check.url);
    for (const pattern of check.patterns) {
        if (!stdout.includes(pattern)) {
            throw new Error(`Missing pattern on ${check.name}: ${pattern}`);
        }
        console.log(`OK\tDOM\t${check.name}\t${pattern}`);
    }
}

async function main() {
    const browserPath = await resolveBrowserPath();
    console.log(`Using browser: ${browserPath}`);

    await assertRedirect();

    for (const check of browserChecks) {
        await assertHttp200(check.url);
        await assertDomContains(browserPath, check);
    }

    console.log('Browser smoke test passed.');
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
