(function (global) {
    const SITE_ORIGIN = 'https://www.seekerstart.com';
    const BASE_PATH = '/houou';
    const PREVIEW_HOSTS = new Set(['seekerstart-hp.vercel.app']);

    function isExternalUrl(value) {
        return /^(?:[a-z]+:)?\/\//i.test(value) || /^(?:mailto|tel|javascript):/i.test(value);
    }

    function trimLeadingSlash(value) {
        return String(value || '').replace(/^\/+/, '');
    }

    function normalizePath(value) {
        const trimmed = trimLeadingSlash(value);
        return trimmed === 'index.html' ? '' : trimmed;
    }

    function pageUrl(path) {
        const normalized = normalizePath(path);
        return normalized ? `${BASE_PATH}/${normalized}` : `${BASE_PATH}/`;
    }

    function assetUrl(path) {
        return pageUrl(path);
    }

    function pageAbsoluteUrl(path) {
        return `${SITE_ORIGIN}${pageUrl(path)}`;
    }

    function playerPath(playerId) {
        return `players/${encodeURIComponent(playerId)}.html`;
    }

    function playerUrl(playerId) {
        return pageUrl(playerPath(playerId));
    }

    function playerAbsoluteUrl(playerId) {
        return `${SITE_ORIGIN}${playerUrl(playerId)}`;
    }

    function resolveInternalUrl(value) {
        if (!value || value === '#') {
            return value;
        }

        if (isExternalUrl(value) || value.startsWith('#')) {
            return value;
        }

        if (value.startsWith(BASE_PATH)) {
            return value;
        }

        if (value.startsWith('/')) {
            return value;
        }

        return pageUrl(value);
    }

    function previewDestination(pathname) {
        const normalized = normalizePath(pathname);
        const basePrefix = trimLeadingSlash(BASE_PATH);
        if (normalized === basePrefix) {
            return pageUrl('');
        }

        if (normalized.startsWith(`${basePrefix}/`)) {
            return pageUrl(normalized.slice(basePrefix.length + 1));
        }

        return normalized ? pageUrl(normalized) : pageUrl('');
    }

    function redirectPreview() {
        if (!PREVIEW_HOSTS.has(global.location.hostname)) {
            return;
        }

        const destination = `${SITE_ORIGIN}${previewDestination(global.location.pathname)}${global.location.search}${global.location.hash}`;
        if (destination !== global.location.href) {
            global.location.replace(destination);
        }
    }

    global.SiteConfig = {
        SITE_ORIGIN,
        BASE_PATH,
        assetUrl,
        pageUrl,
        pageAbsoluteUrl,
        playerPath,
        playerUrl,
        playerAbsoluteUrl,
        resolveInternalUrl,
        redirectPreview,
    };

    redirectPreview();
})(window);
