import { boot } from '@dr87/core';
import { data } from '@dr87/data';
import { createPlatform, registerServiceWorker } from '@dr87/platform';

declare const __DR87_VERSION__: string;

const base = import.meta.env.BASE_URL; // './' — relative, works under any path
const platform = createPlatform(base);
document.documentElement.dataset.shell = platform.shell;

boot({ data, platform, version: __DR87_VERSION__ })
  .then(() => document.getElementById('boot')?.remove())
  .catch((err: unknown) => {
    console.error(err);
    const el = document.getElementById('boot');
    if (el) el.textContent = 'Could not start the game. Reload to try again.';
  });

registerServiceWorker(base, platform.shell);
