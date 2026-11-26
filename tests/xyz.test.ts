import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { guessColumns, loadXyz, XyzImportError } from '../src/index.js';
import { sample } from './files.js';

const points = (g: THREE.Object3D) => {
  let p: THREE.Points | undefined;
  g.traverse((o) => { if ((o as THREE.Points).isPoints) p = o as THREE.Points; });
  return p!;
};

describe('XYZ', () => {
  it('reads a real point file', async () => {
    const r = await loadXyz(sample('helix_201.xyz'));
    expect(r.stats.points).toBe(201);
    expect(r.columns).toEqual(['x', 'y', 'z']);
    expect(r.colorBy).toBe('elevation');
    expect(r.group.rotation.x).toBeCloseTo(-Math.PI / 2);
  });

  it('works out colour, intensity and normal columns', () => {
    expect(guessColumns([[0, 0, 0, 255, 128, 0], [1, 1, 1, 0, 10, 20]])).toEqual(['x', 'y', 'z', 'r', 'g', 'b']);
    expect(guessColumns([[0, 0, 0, 0, 0, 1], [1, 1, 1, 0.6, 0.8, 0]])).toEqual(['x', 'y', 'z', 'nx', 'ny', 'nz']);
    expect(guessColumns([[0, 0, 0, -1200, 255, 0, 0]])).toEqual(['x', 'y', 'z', 'i', 'r', 'g', 'b']);
    expect(guessColumns([[0, 0, 0, 0.5]])).toEqual(['x', 'y', 'z', 'i']);
  });

  it('reads a Leica .pts file with commas, and recentres large coordinates', async () => {
    const text = '2\n500000.5,6000000.25,10,-100,255,0,0\n500002.5,6000002.25,12,200,0,0,255\n';
    const r = await loadXyz({ name: 'scan.pts', data: text });
    expect(r.columns).toEqual(['x', 'y', 'z', 'i', 'r', 'g', 'b']);
    expect(r.origin).toEqual([500001.5, 6000001.25, 11]);
    expect(r.colorBy).toBe('rgb');
    const g = points(r.group).geometry;
    expect(g.getAttribute('position').getX(0)).toBeCloseTo(-1);
    expect(g.getAttribute('color').getX(0)).toBeCloseTo(1);
    expect(r.warnings).toEqual([]);
  });

  it('colours by intensity, skips every other point and scales', async () => {
    const text = 'x y z i\n0 0 0 0\n1 0 0 50\n2 0 0 100\n3 0 0 100\n';
    const r = await loadXyz(text, { colorBy: 'intensity', stride: 2, unitScale: 0.001, upAxis: 'y' });
    expect(r.stats.points).toBe(2);
    expect(r.group.scale.x).toBe(0.001);
    const c = points(r.group).geometry.getAttribute('color');
    expect(c.getX(0)).toBe(0);
    expect(c.getX(1)).toBe(1);
  });

  it('refuses files without points', async () => {
    await expect(loadXyz('hello world\n')).rejects.toThrow(XyzImportError);
  });
});
