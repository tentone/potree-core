# potree-converter

A Go command-line tool that converts point cloud files (**LAS, LAZ, PLY, E57**) into
the **Potree 2.0** format consumed by [potree-core](https://github.com/tentone/potree-core).

## Potree 2.0 output format

Three files are written to the output directory:

| File | Description |
|------|-------------|
| `metadata.json` | Dataset description: scale, offset, bounding box, point attributes |
| `hierarchy.bin` | Octree node tree – 22-byte records, BFS-ordered |
| `octree.bin` | Interleaved point attribute data; each node occupies a contiguous byte range |

## Build

```bash
cd converter
go build -o potree-converter .
```

Go 1.21 or later is required.  No C dependencies – all formats except LAZ are
implemented in pure Go.

## Usage

```
potree-converter -i <input> -o <output-dir> [options]

Options:
  -i string       Input point cloud file (required)
  -o string       Output directory (required)
  -format string  Input format: las, laz, ply, e57  (default: inferred from extension)
  -scale float    Quantisation scale for positions in metres (default 0.001)
  -max-pts int    Maximum points per octree node (default 65536)
  -name string    Dataset name written to metadata.json (default: input filename)
```

### Examples

```bash
# Convert a LAS file (extension inferred)
potree-converter -i scan.las -o ./output

# Convert an E57 file with custom scale
potree-converter -i building.e57 -o ./output -scale 0.001 -max-pts 65536

# Convert a binary PLY file
potree-converter -i cloud.ply -o ./output

# Convert LAZ (requires laszip or las2las in PATH)
potree-converter -i lidar.laz -o ./output
```

## Supported formats

### LAS (`.las`)

Pure Go reader.  Supports LAS 1.0–1.4, point data record formats 0–10.

Attributes extracted:
* Position (X, Y, Z) → stored as quantised `int32`
* RGB colour (formats 2, 3, 5, 7, 8, 10) → stored as `uint16 × 3`
* Intensity → stored as `uint16`
* Classification → stored as `uint8`

### LAZ (`.laz`)

Decompresses to a temporary LAS file via `laszip` or `las2las` (must be in
`PATH`), then reads the resulting LAS.

Install laszip:
```bash
# Ubuntu/Debian
sudo apt-get install laszip

# macOS (Homebrew)
brew install laszip
```

### PLY (`.ply`)

Pure Go reader.  Supports:
* ASCII, `binary_little_endian`, `binary_big_endian`
* Property names: `x`, `y`, `z`, `red`/`r`, `green`/`g`, `blue`/`b`,
  `intensity`, `classification`
* Scalar colour values in `[0,1]` (float properties) are scaled to `[0,65535]`

### E57 (`.e57`)

Pure Go reader.  Handles the common case of E57 files produced by typical
3D scanners:
* One or more `data3D` scan elements
* Cartesian (X, Y, Z) coordinates
* Optional `colorRed`, `colorGreen`, `colorBlue`, and `intensity` attributes
* Float, Integer, and ScaledInteger field types

## Algorithm

1. **Read** – All points are loaded into memory.
2. **Build octree** – The point cloud is recursively subdivided into an
   axis-aligned octree.  Each node retains up to `max-pts` spatially
   representative samples; excess points are forwarded to child nodes.
3. **Write** – Nodes are serialised in BFS order to `octree.bin` and
   `hierarchy.bin`, and `metadata.json` is written with full dataset metadata.

## Running tests

```bash
cd converter
go test ./...
```
