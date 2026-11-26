// Reads the sample files for tests.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// From the project folder, as some test environments give no file URL for the test module.
export const samples = join(process.cwd(), 'tests', 'samples');

/** One sample file. */
export const sample = (name: string) => ({ name, data: new Uint8Array(readFileSync(join(samples, name))) });

/** Every sample file, with paths relative to the samples folder. */
export function allSamples(): { name: string; data: Uint8Array }[] {
  const out: { name: string; data: Uint8Array }[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const n of readdirSync(dir)) {
      const f = join(dir, n);
      if (statSync(f).isDirectory()) walk(f, `${prefix}${n}/`);
      else if (n !== 'README.md') out.push({ name: prefix + n, data: new Uint8Array(readFileSync(f)) });
    }
  };
  walk(samples, '');
  return out;
}
