/**
 * Platform layer. The game core never checks which store it runs in; it asks here.
 *
 * Phase 1 (now): detection, asset URLs, haptics hook, service worker for the web build.
 * Phase 3: saves move from localStorage to Capacitor Preferences / iCloud / Play Games
 * and a Tauri JSON file + Steam Cloud; gamepad and store services land here too.
 */

export type Shell = 'web' | 'capacitor' | 'tauri';

declare global {
  interface Window {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    __TAURI_INTERNALS__?: unknown;
  }
}

export function detectShell(): Shell {
  if (window.Capacitor?.isNativePlatform?.()) return 'capacitor';
  if (window.__TAURI_INTERNALS__) return 'tauri';
  return 'web';
}

export interface Platform {
  shell: Shell;
  /** 'ios' | 'android' | 'web' | 'desktop' */
  os: string;
  /** URL for a file under the repo's assets/ folder, e.g. asset('models/tank.glb'). */
  asset(path: string): string;
  /** Short vibration for drift-boost, impacts and medals. No-op where unsupported. */
  haptic(kind: 'light' | 'medium' | 'heavy'): void;
}

export function createPlatform(base: string): Platform {
  const shell = detectShell();
  const os = shell === 'capacitor' ? window.Capacitor?.getPlatform?.() ?? 'mobile' : shell === 'tauri' ? 'desktop' : 'web';
  const mediaBase = base.endsWith('/') ? base : base + '/';
  return {
    shell,
    os,
    asset: (path) => mediaBase + 'media/' + path.replace(/^\/+/, ''),
    haptic(kind) {
      // Capacitor Haptics plugin replaces this in phase 3; the web Vibration API is the fallback.
      const ms = kind === 'light' ? 10 : kind === 'medium' ? 25 : 45;
      try { navigator.vibrate?.(ms); } catch { /* not supported */ }
    },
  };
}

/** Offline play for the web/PWA build. Native shells serve files locally and skip this. */
export function registerServiceWorker(base: string, shell: Shell): void {
  if (shell !== 'web' || !('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(base + 'sw.js', { scope: base }).catch(() => { /* blocked, e.g. in an iframe */ });
  });
}
