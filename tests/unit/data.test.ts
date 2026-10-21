import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { data, MODEL_FILES, WORLD_MUSIC } from '../../packages/data/index';

const ROOT = resolve(__dirname, '../..');

describe('vehicles', () => {
  const vehicles = Object.entries(data.vehicles) as [string, Record<string, unknown>][];
  it('has all eight vehicles', () => {
    expect(vehicles.map(([k]) => k).sort()).toEqual(['drone', 'hover', 'jet', 'quad', 'rally', 'tank', 'truck', 'walker']);
  });
  it.each(vehicles)('%s has sane handling numbers', (kind, v) => {
    expect(v.kind).toBe(kind);
    for (const key of ['maxMul', 'acc', 'gripRoad', 'gripOff', 'turn', 'rad', 'mass']) {
      expect(typeof v[key], `${kind}.${key}`).toBe('number');
      expect(v[key] as number, `${kind}.${key}`).toBeGreaterThan(0);
    }
  });
});

describe('progression', () => {
  it('unlock thresholds rise', () => {
    const pts = data.unlocks.map((u) => u.pts);
    expect(pts).toEqual([...pts].sort((a, b) => a - b));
  });
  it('every paint unlock has a skin', () => {
    const skinIds = new Set(data.skins.map((s: { id: string }) => s.id));
    for (const u of data.unlocks.filter((u) => u.kind === 'paint')) expect(skinIds.has(u.id), u.id).toBe(true);
  });
  it('quality presets cover saver, balanced and high', () => {
    expect(Object.keys(data.quality)).toEqual(['saver', 'balanced', 'high']);
  });
});

describe('assets', () => {
  it.each(MODEL_FILES)('models/%s.glb exists and is a GLB', (name) => {
    const file = resolve(ROOT, `assets/models/${name}.glb`);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file).subarray(0, 4).toString()).toBe('glTF');
  });
  it.each(['music.mp3', ...Object.values(WORLD_MUSIC)])('music/%s exists', (f) => {
    expect(existsSync(resolve(ROOT, `assets/music/${f}`))).toBe(true);
  });
  it('the game script references every world track', () => {
    const game = readFileSync(resolve(ROOT, 'packages/core/src/legacy/game.js'), 'utf8');
    for (const f of Object.values(WORLD_MUSIC)) expect(game.includes(f), f).toBe(true);
  });
});
