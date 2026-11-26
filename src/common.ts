// Shared by the mc-*-import packages that build on three.js loaders: the files a model is read
// from, texture lookup by file name, material conversion, orientation and counts.

import * as THREE from 'three';
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';

export type ImportData = string | ArrayBuffer | Uint8Array | Blob;

/** A file to read: a browser File, or a name with its contents. */
export type ImportFile = { name: string; data: ImportData } | (Blob & { name: string });

/** What a loader can be given: one file's contents, a file, or several files (zip archives are opened). */
export type ImportInput = ArrayBuffer | Uint8Array | string | ImportFile | Iterable<ImportFile>;

export interface ImportStats {
  meshes: number;
  triangles: number;
  lines: number;
  points: number;
  materials: number;
  textures: number;
}

const baseName = (name: string) => name.replace(/\\/g, '/').split('/').pop()!.toLowerCase();

export function extensionOf(name: string): string {
  const base = baseName(name);
  const dot = base.lastIndexOf('.');
  return dot >= 0 ? base.slice(dot + 1) : '';
}

async function toBytes(data: ImportData): Promise<Uint8Array> {
  if (typeof data === 'string') return new TextEncoder().encode(data);
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(await data.arrayBuffer());
}

const isZip = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;

/** The files of an import, found by path or by file name, ignoring case. */
export class ImportFiles {
  readonly files: { name: string; bytes: Uint8Array }[] = [];

  /** Reads the input. Zip archives are opened unless their extension is one of `keepZipped`. */
  static async from(input: ImportInput, defaultName: string, keepZipped: string[] = []): Promise<ImportFiles> {
    const set = new ImportFiles();
    const list: ImportFile[] =
      typeof input === 'string' || input instanceof ArrayBuffer || input instanceof Uint8Array
        ? [{ name: defaultName, data: input }]
        : input instanceof Blob || (typeof input === 'object' && 'data' in input && 'name' in input)
          ? [input as ImportFile]
          : [...(input as Iterable<ImportFile>)];
    for (const file of list) {
      const bytes = await toBytes(file instanceof Blob ? file : file.data);
      if (isZip(bytes) && !keepZipped.includes(extensionOf(file.name))) {
        for (const [name, data] of Object.entries(unzipSync(bytes))) if (!name.endsWith('/')) set.files.push({ name, bytes: data });
      } else set.files.push({ name: file.name, bytes });
    }
    return set;
  }

  find(name: string): { name: string; bytes: Uint8Array } | undefined {
    const path = name.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
    return this.files.find((f) => f.name.replace(/\\/g, '/').toLowerCase() === path) ?? this.files.find((f) => baseName(f.name) === baseName(name));
  }

  /** The first file with one of the extensions, or the named one. */
  main(extensions: string[], name?: string): { name: string; bytes: Uint8Array } | undefined {
    if (name) return this.find(name);
    return this.files.find((f) => extensions.includes(extensionOf(f.name)));
  }

  text(file: { bytes: Uint8Array }): string {
    return new TextDecoder().decode(file.bytes).replace(/^﻿/, '');
  }
}

/**
 * A loading manager that serves the import's files to three.js loaders by file name, wherever
 * the model says they are, and records the ones it can't find. `done()` waits for every texture
 * the loader started.
 */
export class FileManager {
  readonly manager = new THREE.LoadingManager();
  readonly missing = new Set<string>();
  private readonly urls = new Map<string, string>();
  private pending = 0;
  private waiters: (() => void)[] = [];

  constructor(private readonly files: ImportFiles) {
    this.manager.setURLModifier((url) => {
      if (/^(blob|data):/.test(url)) return url;
      let name: string;
      try {
        name = decodeURIComponent(url);
      } catch {
        name = url;
      }
      const file = this.files.find(name);
      if (!file) {
        this.missing.add(name.replace(/\\/g, '/').split('/').pop()!);
        return url;
      }
      let blobUrl = this.urls.get(file.name);
      if (!blobUrl) {
        blobUrl = URL.createObjectURL(new Blob([file.bytes as BlobPart]));
        this.urls.set(file.name, blobUrl);
      }
      return blobUrl;
    });
    this.manager.itemStart = () => {
      this.pending++;
    };
    this.manager.itemEnd = () => {
      this.pending--;
      if (this.pending <= 0) this.flush();
    };
    this.manager.itemError = (url) => {
      if (!/^(blob|data):/.test(url)) this.missing.add(url.replace(/\\/g, '/').split('/').pop()!);
    };
  }

  private flush(): void {
    const w = this.waiters;
    this.waiters = [];
    for (const f of w) f();
  }

  /** Resolves when every item the loader started has loaded or failed, or after `timeout` ms. */
  done(timeout = 30000): Promise<void> {
    if (this.pending <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, timeout);
      this.waiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  dispose(): void {
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
  }
}

/**
 * Replaces Phong and Lambert materials with MeshStandardMaterial, so they can be edited like the
 * other formats' materials: colours, maps, emission, transparency and sides carry over, and
 * roughness comes from shininess.
 */
export function toStandardMaterials(root: THREE.Object3D): void {
  const done = new Map<THREE.Material, THREE.Material>();
  const convert = (m: THREE.Material): THREE.Material => {
    if (!(m instanceof THREE.MeshPhongMaterial || m instanceof THREE.MeshLambertMaterial)) return m;
    let s = done.get(m);
    if (s) return s;
    const phong = m as THREE.MeshPhongMaterial;
    const standard = new THREE.MeshStandardMaterial({
      name: m.name,
      color: phong.color,
      map: phong.map,
      emissive: phong.emissive,
      emissiveMap: phong.emissiveMap,
      emissiveIntensity: phong.emissiveIntensity,
      normalMap: phong.normalMap ?? null,
      normalScale: phong.normalScale ?? new THREE.Vector2(1, 1),
      bumpMap: phong.bumpMap ?? null,
      bumpScale: phong.bumpScale ?? 1,
      alphaMap: phong.alphaMap,
      aoMap: phong.aoMap,
      lightMap: phong.lightMap,
      opacity: phong.opacity,
      transparent: phong.transparent,
      alphaTest: phong.alphaTest,
      side: phong.side,
      vertexColors: phong.vertexColors,
      flatShading: phong.flatShading ?? false,
      wireframe: phong.wireframe,
      metalness: 0,
      roughness: m instanceof THREE.MeshPhongMaterial ? Math.min(1, Math.sqrt(2 / ((phong.shininess ?? 30) + 2))) : 1,
    });
    standard.userData = { ...m.userData };
    s = standard;
    done.set(m, s);
    return s;
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
  });
}

/** Turns a Z-up model to three.js's Y up, and scales it to metres, by wrapping it in a group. */
export function orient(model: THREE.Object3D, name: string, zUp: boolean, metresPerUnit: number): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  if (zUp) group.rotation.x = -Math.PI / 2;
  if (metresPerUnit > 0 && metresPerUnit !== 1) group.scale.setScalar(metresPerUnit);
  group.add(model);
  return group;
}

/** Counts what a model holds. */
export function countModel(root: THREE.Object3D): ImportStats {
  const stats: ImportStats = { meshes: 0, triangles: 0, lines: 0, points: 0, materials: 0, textures: 0 };
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((o) => {
    const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (!g?.getAttribute?.('position')) return;
    const count = g.index ? g.index.count : g.getAttribute('position').count;
    if ((o as THREE.Mesh).isMesh) {
      stats.meshes++;
      stats.triangles += Math.floor(count / 3);
    } else if ((o as THREE.LineSegments).isLineSegments) stats.lines += Math.floor(count / 2);
    else if ((o as THREE.Line).isLine) stats.lines += Math.max(0, count - 1);
    else if ((o as THREE.Points).isPoints) stats.points += count;
    const ms = (o as THREE.Mesh).material;
    for (const m of Array.isArray(ms) ? ms : ms ? [ms] : []) {
      materials.add(m);
      for (const value of Object.values(m)) if ((value as THREE.Texture)?.isTexture) textures.add(value as THREE.Texture);
    }
  });
  stats.materials = materials.size;
  stats.textures = textures.size;
  return stats;
}
