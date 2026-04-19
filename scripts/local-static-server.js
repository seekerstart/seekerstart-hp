const http = require('http');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const port = Number(process.env.PORT || 8000);
const host = process.env.HOST || '0.0.0.0';
const basePath = '/houou';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

http
  .createServer((req, res) => {
    const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let relativePath = requestPath;

    if (requestPath === basePath || requestPath === `${basePath}/`) {
      relativePath = '/index.html';
    } else if (requestPath.startsWith(`${basePath}/`)) {
      relativePath = requestPath.slice(basePath.length);
    } else if (requestPath === '/') {
      relativePath = '/index.html';
    }

    const filePath = path.normalize(path.join(root, relativePath));

    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.stat(filePath, (error, stats) => {
      if (error || !stats.isFile()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      res.writeHead(200, {
        'Content-Type':
          mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      });

      fs.createReadStream(filePath).pipe(res);
    });
  })
  .listen(port, host, () => {
    console.log(`Static server listening on http://${host}:${port}`);
  });
