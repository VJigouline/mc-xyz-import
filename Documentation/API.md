# API

## `loadXyz(input, options?)`

Reads `.xyz`, `.pts`, `.txt`, `.csv` or `.asc` and returns a promise of a `XyzLoadResult`.

`input` is the file's contents (`ArrayBuffer`, `Uint8Array` or string), a browser `File`, `{ name, data }`, or an iterable of files. Zip archives among them are opened.

It throws a `XyzImportError` for input that isn't XYZ.

### Options

| Option | Default | Meaning |
| --- | --- | --- |
| `main` | the first file | The file to open, if several are given. |
| `colorBy` | 'auto' | `'rgb'`, `'intensity'`, `'classification'`, `'elevation'` or `'none'`; `'auto'` takes colours, then intensity, then height. |
| `recentre` | true | Moves the cloud near the origin, as scan coordinates are too large for the GPU's precision; `origin` gives the point moved there. |
| `pointSize` | 2 | Point size in pixels. |
| `columns` | worked out | What each column holds: `'x'`, `'y'`, `'z'`, `'r'`, `'g'`, `'b'`, `'i'`, `'nx'`, `'ny'`, `'nz'` or `'skip'`. |
| `upAxis` | 'z' | `'y'` leaves the cloud as it is. |
| `unitScale` | 1 | Metres per unit. |
| `stride` | 1 | Reads every nth point. |

### `XyzLoadResult`

| Field | Type | Meaning |
| --- | --- | --- |
| `group` | `THREE.Group` | The model. |
| `columns` | `XyzColumn[]` | What each column was taken to hold. |
| `origin` | `[x, y, z]` | The file's point at the cloud's origin, in file units. |
| `colorBy` | `ColorMode` | How the points are coloured. |
| `warnings` | `string[]` | Problems that didn't stop the import. |
| `stats` | object | Counts of meshes, triangles, lines and points. |

See the package's `index.d.ts` for every exported type and helper.
