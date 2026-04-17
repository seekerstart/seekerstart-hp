import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const port = Number(process.env.PORT || 8000);
const host = process.env.HOST || '0.0.0.0';
const basePath = '/houou';

const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
};

function resolveRequestPath(requestPath) {
    if (requestPath === '/' || requestPath === '') {
        return path.join(root, 'index.html');
    }

    if (requestPath === basePath) {
        return null;
    }

    if (requestPath === `${basePath}/`) {
        return path.join(root, 'index.html');
    }

    if (requestPath.startsWith(`${basePath}/`)) {
        const relativePath = requestPath.slice(basePath.length + 1);
        return path.join(root, relativePath);
    }

    return path.join(root, requestPath.replace(/^\/+/, ''));
}

http.createServer((req, res) => {
    const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const filePath = resolveRequestPath(requestPath);

    if (filePath === null) {
        res.writeHead(301, { Location: `${basePath}/` });
        res.end();
        return;
    }

    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(root)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.stat(normalizedPath, (error, stats) => {
        if (error || !stats.isFile()) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }

        res.writeHead(200, {
            'Content-Type': mimeTypes[path.extname(normalizedPath).toLowerCase()] || 'application/octet-stream',
        });
        fs.createReadStream(normalizedPath).pipe(res);
    });
}).listen(port, host, () => {
    console.log(`Static server listening on http://${host}:${port}${basePath}/`);
});
