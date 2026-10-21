import vehicles from './vehicles.json';
import skins from './skins.json';
import unlocks from './unlocks.json';
import medalNames from './medal-names.json';
import quality from './quality.json';

/** Keys match what the legacy game reads as DR87.data[key]. */
export const data = {
  vehicles,
  skins,
  unlocks,
  'medal-names': medalNames,
  quality,
};

export type GameData = typeof data;
export type VehicleKind = keyof typeof vehicles;

/** Worlds and the music track that plays in each (the main theme covers the rest). */
export const WORLD_MUSIC: Record<string, string> = {
  desert: 'music-desert.mp3', // Mojave Basin · Sirocco Drive
  forge: 'music-forge.mp3', // Basalt Forge · Full Throttle Canyon
  tundra: 'music-tundra.mp3', // Glacier Spire · North of the Finish
  cirrus: 'music-cirrus.mp3', // Cirrus Reach · Blue Horizon Sprint
  quarry: 'music-quarry.mp3', // Ferrous Moon · Gas Giant Ascent
  hive: 'music-hive.mp3', // Hive Lattice · Midnight Pursuit
};

/** Vehicles that load a GLB from assets/models (the Sirocco truck is built in code). */
export const MODEL_FILES = ['tank', 'walker', 'jet', 'quad', 'rally', 'hover', 'drone'] as const;
