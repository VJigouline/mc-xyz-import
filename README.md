# mc-xyz-import

An XYZ importer for [three.js](https://threejs.org/), written in TypeScript. It reads plain-text point clouds: one point per line, x y z with optional colour, intensity and normal columns, separated by spaces, tabs, commas or semicolons, in metres and Y up. It was made for [SceneEditor](https://github.com/VJigouline/SceneEditor), and works in any three.js application.

```ts
import { loadXyz } from 'mc-xyz-import';

const result = await loadXyz(await file.text());
scene.add(result.group);
console.log(result.warnings);       // anything that couldn't be read
```

## What it reads

- Points of three to ten columns, with the columns worked out from their number and values, or given.
- Colours as 0 to 255 or 0 to 1, intensity (including Leica's -2048 to 2047), and normals.
- Leica .pts files with their point count, header lines with column names, and comments.
- Large files, taking every nth point.

Lines that are not points are skipped and counted. See [Formats and support](Documentation/Support.md) for the details.

## Install

The package is not on the npm registry. Install it from GitHub:

```sh
npm install github:VJigouline/mc-xyz-import
```

`three` (r160 or later) is a peer dependency. The package builds itself on install.

## Documentation

- [Getting started](Documentation/GettingStarted.md)
- [API](Documentation/API.md)
- [Formats and support](Documentation/Support.md)
- [Using it in SceneEditor](Documentation/SceneEditor.md)

## Development

```sh
npm install
npm test           # unit tests, with Vitest
npm run typecheck
npm run build      # dist/
```

The tests load real XYZ files, kept in [`tests/samples`](tests/samples/README.md) with their licences. It needs Node.js 22 or later.

## Licence

[MIT](LICENSE)
