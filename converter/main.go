// potree-converter converts LAS, LAZ, PLY, and E57 point cloud files to the
// Potree 2.0 format consumed by potree-core.
//
// Usage:
//
//	potree-converter -i <input> -o <output-dir> [-format <ext>] [-scale <s>] [-name <name>]
package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/tentone/potree-core/converter/octree"
	"github.com/tentone/potree-core/converter/reader"
	"github.com/tentone/potree-core/converter/writer"
)

func main() {
	input := flag.String("i", "", "Input point cloud file (required)")
	output := flag.String("o", "", "Output directory (required)")
	format := flag.String("format", "", "Input format: las, laz, ply, e57 (default: inferred from extension)")
	scale := flag.Float64("scale", 0.001, "Quantisation scale for positions in metres (default 0.001)")
	name := flag.String("name", "", "Dataset name for metadata.json (default: input filename without extension)")
	flag.Usage = usage
	flag.Parse()

	if *input == "" || *output == "" {
		flag.Usage()
		os.Exit(1)
	}

	// Infer format from extension if not supplied
	fmt_ := strings.ToLower(*format)
	if fmt_ == "" {
		ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(*input), "."))
		if ext == "" {
			log.Fatalf("Cannot infer format from %q – use -format", *input)
		}
		fmt_ = ext
	}

	// Dataset name
	dsName := *name
	if dsName == "" {
		base := filepath.Base(*input)
		dsName = strings.TrimSuffix(base, filepath.Ext(base))
	}

	log.Printf("potree-converter: %s → %s (format=%s)", *input, *output, fmt_)

	// ---- Read points -------------------------------------------------------
	t0 := time.Now()
	log.Printf("Reading %s …", *input)

	r, err := reader.Open(*input, fmt_)
	if err != nil {
		log.Fatalf("Open: %v", err)
	}

	points, err := r.Read()
	if err != nil {
		log.Fatalf("Read: %v", err)
	}
	log.Printf("Read %d points in %v", len(points), time.Since(t0).Round(time.Millisecond))

	if len(points) == 0 {
		log.Fatal("No points read from input file")
	}

	// ---- Build octree ------------------------------------------------------
	t1 := time.Now()
	log.Printf("Building octree …")

	root := octree.Build(points, octree.Options{})
	log.Printf("Octree built in %v", time.Since(t1).Round(time.Millisecond))

	// ---- Write output ------------------------------------------------------
	t2 := time.Now()
	log.Printf("Writing Potree 2.0 output to %s …", *output)

	if err := writer.Write(*output, root, points, int64(len(points)), writer.Options{
		Name:  dsName,
		Scale: *scale,
	}); err != nil {
		log.Fatalf("Write: %v", err)
	}
	log.Printf("Done in %v (total %v)", time.Since(t2).Round(time.Millisecond), time.Since(t0).Round(time.Millisecond))
}

func usage() {
	fmt.Fprintf(os.Stderr, `potree-converter – convert point clouds to Potree 2.0 format

Usage:
  potree-converter -i <input> -o <output-dir> [options]

Options:
`)
	flag.PrintDefaults()
	fmt.Fprintf(os.Stderr, `
Supported input formats:
  las   LAS 1.0–1.4  (ASPRS LiDAR Data Exchange Format)
  laz   LAZ (LAS with LASzip compression; requires laszip or las2las in PATH)
  ply   PLY (Stanford Polygon Format; ASCII and binary little-/big-endian)
  e57   E57 (ASTM E57 3D imaging data)

Output:
  Three files are written to <output-dir>:
    metadata.json  – dataset description compatible with potree-core 2.0
    hierarchy.bin  – octree node hierarchy (22 bytes per node)
    octree.bin     – interleaved point attribute data

Example:
  potree-converter -i scan.las -o ./output
  potree-converter -i cloud.e57 -o ./output -scale 0.001
`)
}
