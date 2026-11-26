# Formats and support

mc-xyz-import reads XYZ with its own reader, with no other dependencies.

## What is read

- Points of three to ten columns, with the columns worked out from their number and values, or given.
- Colours as 0 to 255 or 0 to 1, intensity (including Leica's -2048 to 2047), and normals.
- Leica .pts files with their point count, header lines with column names, and comments.
- Large files, taking every nth point.

## Orientation and units

Scans are usually Z up; the group turns them Y up unless `upAxis` is `'y'`. The cloud is moved near the origin; `origin` gives the point moved there.

## Limits

Lines that are not points are skipped and counted.
