// Serves out/ locally the way GitHub Pages will, including CORS, so
// pit-wall-web can load data from http://localhost:4000/v1 during development.
//
//   npm run serve            (PORT=4001 npm run serve to change the port)

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve('out');
const PORT = Number(process.env.PORT ?? 4000);
const TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname));
  const file = join(ROOT, path);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end(`Not found: ${path}`);
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`Serving ${ROOT} at http://localhost:${PORT}`);
});
