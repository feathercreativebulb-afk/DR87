/**
 * Boots Dust Runner '87.
 *
 * Phase 1: the game is the imported legacy script (src/legacy/game.js), a classic script that
 * expects a global THREE (r128) and the GLTF/FBX loaders, plus a global DR87 with data and asset
 * URLs. Everything is bundled locally — no CDN — so the build runs offline in every shell.
 */
import '@fontsource/bungee/400.css';
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import './legacy/game.css';
import markup from './legacy/markup.html?raw';

import threeUrl from 'three/build/three.min.js?url';
import fflateUrl from 'three/examples/js/libs/fflate.min.js?url';
import gltfUrl from 'three/examples/js/loaders/GLTFLoader.js?url';
import fbxUrl from 'three/examples/js/loaders/FBXLoader.js?url';
import gameUrl from './legacy/game.js?url';

import type { GameData } from '@dr87/data';
import type { Platform } from '@dr87/platform';

export interface DR87Global {
  data: GameData;
  platform: Platform;
  asset: Platform['asset'];
  version: string;
}

declare global {
  interface Window {
    DR87: DR87Global;
  }
}

function loadClassicScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false; // keep order: three, loaders, game
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.body.appendChild(s);
  });
}

export async function boot(opts: { data: GameData; platform: Platform; version: string }): Promise<void> {
  window.DR87 = { data: opts.data, platform: opts.platform, asset: opts.platform.asset, version: opts.version };
  document.body.insertAdjacentHTML('afterbegin', markup);
  for (const src of [threeUrl, fflateUrl, gltfUrl, fbxUrl, gameUrl]) {
    await loadClassicScript(src);
  }
}
