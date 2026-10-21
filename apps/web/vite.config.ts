import { defineConfig, type Plugin } from 'vite';
import { cpSync, createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, normalize } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const MEDIA_DIR = join(ROOT, 'assets'); // repo-level assets/: models/*.glb, music/*.mp3
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version?: string };

const TYPES: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.ktx2': 'image/ktx2',
};

/** Serves assets/ at /media/ in dev and copies it into dist/media/ on build. */
function media(): Plugin {
  return {
    name: 'dr87-media',
    configureServer(server) {
      server.middlewares.use('/media', (req, res, next) => {
        const rel = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^([/\\])+/, '');
        const file = join(MEDIA_DIR, rel);
        if (!file.startsWith(MEDIA_DIR) || !existsSync(file) || statSync(file).isDirectory()) return next();
        res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
        res.setHeader('Content-Length', statSync(file).size);
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      cpSync(MEDIA_DIR, resolve(__dirname, 'dist/media'), { recursive: true });
    },
  };
}

export default defineConfig({
  // Relative base: the same build works on GitHub Pages (/DR87/), a custom domain, itch.io,
  // and inside the Capacitor / Tauri shells, which load it from local files.
  base: './',
  define: { __DR87_VERSION__: JSON.stringify(pkg.version ?? '0.1.0') },
  plugins: [media()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    assetsInlineLimit: 0, // keep the game script and three as files (classic scripts, cacheable)
    chunkSizeWarningLimit: 1024,
  },
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
});
