// Shared by the point-cloud packages: builds a three.js point cloud from double-precision
// coordinates, moved near the origin so float32 keeps millimetre precision, and coloured by
// colour, intensity, classification or height.

import * as THREE from 'three';

export type ColorMode = 'auto' | 'rgb' | 'intensity' | 'classification' | 'elevation' | 'none';

export interface PointCloudData {
  /** x, y, z of each point, in file units. */
  positions: Float64Array;
  /** r, g, b of each point, 0 to 1. */
  colors?: Float32Array;
  /** Intensity of each point, 0 to 1. */
  intensity?: Float32Array;
  /** ASPRS classification of each point. */
  classification?: Uint8Array;
  /** Normals, x, y, z of each point. */
  normals?: Float32Array;
}

export interface PointCloudOptions {
  /** How points are coloured. 'auto' uses colours, then intensity, then height. */
  colorBy?: ColorMode;
  /** Moves the cloud near the origin; the point that was moved there is returned. Default true. */
  recentre?: boolean;
  /** Point size in pixels. Default 2. */
  pointSize?: number;
}

/** ASPRS standard classes, coloured as in common LiDAR viewers. */
export const CLASSIFICATION_COLORS: Record<number, number> = {
  0: 0xa0a0a0, 1: 0xc8c8c8, 2: 0xa0784b, 3: 0x7ab863, 4: 0x4f9a3c, 5: 0x2a6e22, 6: 0xe36b3a, 7: 0xff00ff,
  8: 0xffff00, 9: 0x3c8cdc, 10: 0x8c6450, 11: 0x606060, 12: 0xffaaff, 13: 0xffd700, 14: 0xffa500,
  15: 0x9b59b6, 16: 0xff4500, 17: 0xb0c4de, 18: 0xff0000,
};

/** The cloud's colour mode once 'auto' is resolved. */
export function resolveColorMode(data: PointCloudData, mode: ColorMode = 'auto'): ColorMode {
  if (mode !== 'auto') return mode;
  if (data.colors) return 'rgb';
  if (data.intensity) return 'intensity';
  return 'elevation';
}

/** Builds the point cloud. Height colouring uses z, the file's up axis for scans. */
export function buildPoints(name: string, data: PointCloudData, options: PointCloudOptions = {}, upIndex = 2): { points: THREE.Points; origin: [number, number, number]; colorBy: ColorMode } {
  const p = data.positions;
  const n = Math.floor(p.length / 3);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n * 3; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = p[i + k]!;
      if (v < min[k]!) min[k] = v;
      if (v > max[k]!) max[k] = v;
    }
  }
  const origin: [number, number, number] = n && options.recentre !== false ? [(min[0]! + max[0]!) / 2, (min[1]! + max[1]!) / 2, (min[2]! + max[2]!) / 2] : [0, 0, 0];
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i += 3) {
    positions[i] = p[i]! - origin[0];
    positions[i + 1] = p[i + 1]! - origin[1];
    positions[i + 2] = p[i + 2]! - origin[2];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  if (data.normals) geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  if (data.intensity) geometry.setAttribute('intensity', new THREE.BufferAttribute(data.intensity, 1));
  if (data.classification) geometry.setAttribute('classification', new THREE.BufferAttribute(data.classification, 1));

  const colorBy = resolveColorMode(data, options.colorBy);
  let colors: Float32Array | undefined;
  const color = new THREE.Color();
  if (colorBy === 'rgb' && data.colors) colors = data.colors;
  else if (colorBy === 'intensity' && data.intensity) {
    colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.fill(data.intensity[i]!, i * 3, i * 3 + 3);
  } else if (colorBy === 'classification' && data.classification) {
    colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      color.setHex(CLASSIFICATION_COLORS[data.classification[i]!] ?? 0xa0a0a0, THREE.LinearSRGBColorSpace);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
  } else if (colorBy === 'elevation' && n) {
    colors = new Float32Array(n * 3);
    const lo = min[upIndex]!;
    const span = max[upIndex]! - lo || 1;
    for (let i = 0; i < n; i++) {
      color.setHSL(0.66 * (1 - (p[i * 3 + upIndex]! - lo) / span), 0.8, 0.5, THREE.LinearSRGBColorSpace);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
  }
  if (colors) geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const material = new THREE.PointsMaterial({ name, size: options.pointSize ?? 2, sizeAttenuation: false, vertexColors: !!colors, color: colors ? 0xffffff : 0x888888 });
  const points = new THREE.Points(geometry, material);
  points.name = name;
  return { points, origin, colorBy: colors ? colorBy : 'none' };
}

/** The file name without folders or extension. */
export const baseName = (name: string, extension: RegExp) => name.replace(/\\/g, '/').split('/').pop()!.replace(extension, '');
