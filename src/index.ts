// Reads plain-text point clouds: one point per line, x y z followed by optional colour,
// intensity and normal columns, separated by spaces, tabs, commas or semicolons.

import * as THREE from 'three';
import { countModel, ImportFiles, orient, type ImportInput, type ImportStats } from './common.js';
import { baseName, buildPoints, type ColorMode, type PointCloudOptions } from './points.js';

export { ImportFiles, countModel } from './common.js';
export type { ImportInput, ImportFile, ImportData, ImportStats } from './common.js';
export { CLASSIFICATION_COLORS, type ColorMode, type PointCloudOptions } from './points.js';

/** What a column holds. */
export type XyzColumn = 'x' | 'y' | 'z' | 'r' | 'g' | 'b' | 'i' | 'nx' | 'ny' | 'nz' | 'skip';

export interface XyzOptions extends PointCloudOptions {
  /** The file to open, if several are given. By default, the first. */
  main?: string;
  /** What each column holds. By default it is worked out from the number of columns and their values. */
  columns?: XyzColumn[];
  /** Scans are usually Z up, the default; 'y' leaves the cloud as it is. */
  upAxis?: 'y' | 'z';
  /** Metres per file unit. Default 1. */
  unitScale?: number;
  /** Reads every nth point only, for very large files. Default 1. */
  stride?: number;
}

export interface XyzLoadResult {
  /** The point cloud, in a group named after the file. */
  group: THREE.Group;
  /** What each column was taken to hold. */
  columns: XyzColumn[];
  /** The file's point that is at the group's origin, in file units. */
  origin: [number, number, number];
  /** How the points are coloured. */
  colorBy: ColorMode;
  warnings: string[];
  stats: ImportStats & { skippedLines: number };
}

export class XyzImportError extends Error {
  override name = 'XyzImportError';
}

const SEPARATOR = /[\s,;]+/;

/** Works out the columns from the first rows: colours are integers to 255 or fractions, normals have length 1. */
export function guessColumns(rows: number[][]): XyzColumn[] {
  const width = Math.min(...rows.map((r) => r.length));
  const all = (from: number, to: number, test: (v: number) => boolean) => rows.every((r) => r.slice(from, to).every(test));
  const isColor = (from: number) => all(from, from + 3, (v) => v >= 0 && v <= 255) && (all(from, from + 3, Number.isInteger) || all(from, from + 3, (v) => v <= 1));
  const isNormal = (from: number) => rows.every((r) => Math.abs(Math.hypot(r[from]!, r[from + 1]!, r[from + 2]!) - 1) < 0.01);
  const xyz: XyzColumn[] = ['x', 'y', 'z'];
  const rgb: XyzColumn[] = ['r', 'g', 'b'];
  const nrm: XyzColumn[] = ['nx', 'ny', 'nz'];
  switch (width) {
    case 3: return xyz;
    case 4: return [...xyz, 'i'];
    case 6: return isNormal(3) && !(isColor(3) && all(3, 6, Number.isInteger)) ? [...xyz, ...nrm] : [...xyz, ...rgb];
    case 7: return isColor(4) ? [...xyz, 'i', ...rgb] : [...xyz, ...rgb, 'i'];
    case 9: return isNormal(3) ? [...xyz, ...nrm, ...rgb] : [...xyz, ...rgb, ...nrm];
    case 10: return isNormal(3) ? [...xyz, ...nrm, ...rgb, 'i'] : [...xyz, 'i', ...rgb, ...nrm];
    default: return [...xyz, ...Array<XyzColumn>(Math.max(0, width - 3)).fill('skip')];
  }
}

/** Reads a text point cloud: .xyz, .pts (Leica, with a point count first), .txt or .csv. */
export async function loadXyz(input: ImportInput, options: XyzOptions = {}): Promise<XyzLoadResult> {
  const files = await ImportFiles.from(input, 'points.xyz');
  const main = files.main(['xyz', 'pts', 'txt', 'csv', 'asc'], options.main) ?? files.files[0];
  if (!main) throw new XyzImportError('There is no point file to open');
  const text = files.text(main);
  const lines = text.split(/\r?\n/);
  const warnings: string[] = [];
  const numeric = (line: string) => {
    const t = line.trim();
    if (!t || t[0] === '#' || t.startsWith('//')) return undefined;
    const parts = t.split(SEPARATOR).map(Number);
    return parts.length >= 3 && parts.every(Number.isFinite) ? parts : null;
  };

  // A header line (column names) or a Leica point count may come first.
  const sample: number[][] = [];
  let skippedLines = 0;
  for (const line of lines) {
    const row = numeric(line);
    if (row && sample.length < 50) sample.push(row);
    if (sample.length >= 50) break;
  }
  if (!sample.length) throw new XyzImportError(`${main.name} has no points: no line holds three numbers`);
  const columns = options.columns ?? guessColumns(sample);
  const at = (c: XyzColumn) => columns.indexOf(c);
  const [cx, cy, cz] = [at('x'), at('y'), at('z')];
  if (cx < 0 || cy < 0 || cz < 0) throw new XyzImportError('The columns must include x, y and z');
  const [cr, cg, cb, ci, cnx, cny, cnz] = [at('r'), at('g'), at('b'), at('i'), at('nx'), at('ny'), at('nz')];
  const stride = Math.max(1, Math.floor(options.stride ?? 1));

  const pos: number[] = [];
  const col: number[] = [];
  const inten: number[] = [];
  const nrm: number[] = [];
  let maxColor = 0;
  let maxIntensity = 0;
  let minIntensity = Infinity;
  let index = 0;
  for (const line of lines) {
    const row = numeric(line);
    if (row === undefined) continue;
    if (row === null || row.length < columns.length) {
      skippedLines++;
      continue;
    }
    if (index++ % stride) continue;
    pos.push(row[cx]!, row[cy]!, row[cz]!);
    if (cr >= 0) {
      col.push(row[cr]!, row[cg]!, row[cb]!);
      maxColor = Math.max(maxColor, row[cr]!, row[cg]!, row[cb]!);
    }
    if (ci >= 0) {
      inten.push(row[ci]!);
      maxIntensity = Math.max(maxIntensity, row[ci]!);
      minIntensity = Math.min(minIntensity, row[ci]!);
    }
    if (cnx >= 0) nrm.push(row[cnx]!, row[cny]!, row[cnz]!);
  }
  // A Leica .pts count line has one number, so it was skipped above; other skipped lines are reported.
  if (skippedLines > 1) warnings.push(`${skippedLines} lines were not points and were skipped`);

  const colorScale = maxColor > 1 ? 1 / 255 : 1;
  const colors = col.length ? new Float32Array(col.map((v) => v * colorScale)) : undefined;
  if (colors) {
    // Colours in files are sRGB; three.js works in linear colour.
    const c = new THREE.Color();
    for (let i = 0; i < colors.length; i += 3) {
      c.setRGB(colors[i]!, colors[i + 1]!, colors[i + 2]!, THREE.SRGBColorSpace);
      colors[i] = c.r;
      colors[i + 1] = c.g;
      colors[i + 2] = c.b;
    }
  }
  // Leica intensity runs from -2048 to 2047; others from 0 to their largest value.
  const lo = minIntensity < 0 ? -2048 : 0;
  const hi = minIntensity < 0 ? 2047 : maxIntensity || 1;
  const intensity = inten.length ? new Float32Array(inten.map((v) => (v - lo) / (hi - lo || 1))) : undefined;

  const name = baseName(main.name, /\.[^.]+$/);
  const { points, origin, colorBy } = buildPoints(name, {
    positions: new Float64Array(pos),
    colors,
    intensity,
    normals: nrm.length ? new Float32Array(nrm) : undefined,
  }, options, options.upAxis === 'y' ? 1 : 2);
  const group = orient(points, name, options.upAxis !== 'y', options.unitScale ?? 1);
  return { group, columns, origin, colorBy, warnings, stats: { ...countModel(group), skippedLines } };
}
