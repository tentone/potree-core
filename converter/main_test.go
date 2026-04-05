package main

import (
	"encoding/binary"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"testing"

	"github.com/tentone/potree-core/converter/octree"
	"github.com/tentone/potree-core/converter/reader"
	"github.com/tentone/potree-core/converter/writer"
)

// makeTinyPLY writes a minimal ASCII PLY file with N points uniformly
// distributed in a unit cube.
func makeTinyPLY(path string, n int) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	fmt.Fprintf(f, "ply\nformat ascii 1.0\nelement vertex %d\n", n)
	fmt.Fprintln(f, "property float x")
	fmt.Fprintln(f, "property float y")
	fmt.Fprintln(f, "property float z")
	fmt.Fprintln(f, "property uchar red")
	fmt.Fprintln(f, "property uchar green")
	fmt.Fprintln(f, "property uchar blue")
	fmt.Fprintln(f, "end_header")
	for i := 0; i < n; i++ {
		t := float64(i) / float64(n)
		x := t
		y := math.Sin(t * math.Pi * 4)
		z := math.Cos(t * math.Pi * 4)
		r := uint8(t * 255)
		g := uint8((1 - t) * 255)
		b := uint8(128)
		fmt.Fprintf(f, "%f %f %f %d %d %d\n", x, y, z, r, g, b)
	}
	return nil
}

// makeTinyLAS writes a minimal LAS 1.2 file (format 2 = XYZ + RGB).
func makeTinyLAS(path string, n int) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	const hdrSize = 227
	const recLen = 26 // format 2
	offsetToData := uint32(hdrSize)
	numPoints := uint32(n)

	// Write header
	sig := [4]byte{'L', 'A', 'S', 'F'}
	f.Write(sig[:])
	writeU16(f, 0) // file source id
	writeU16(f, 0) // global encoding
	writeU32(f, 0) // project GUID 1
	writeU16(f, 0) // GUID 2
	writeU16(f, 0) // GUID 3
	f.Write(make([]byte, 8))  // GUID 4
	f.Write([]byte{1, 2})     // version 1.2
	f.Write(make([]byte, 32)) // system identifier
	f.Write(make([]byte, 32)) // generating software
	writeU16(f, 1)            // day of year
	writeU16(f, 2024)         // year
	writeU16(f, hdrSize)      // header size
	writeU32(f, offsetToData) // offset to point data
	writeU32(f, 0)            // num VLRs
	f.Write([]byte{2})        // point data format 2
	writeU16(f, recLen)       // record length
	writeU32(f, numPoints)    // number of point records
	// number of points by return (5 * uint32)
	writeU32(f, numPoints)
	writeU32(f, 0)
	writeU32(f, 0)
	writeU32(f, 0)
	writeU32(f, 0)
	// scale / offset
	writeF64(f, 0.001) // x scale
	writeF64(f, 0.001) // y scale
	writeF64(f, 0.001) // z scale
	writeF64(f, 0.0)   // x offset
	writeF64(f, 0.0)   // y offset
	writeF64(f, 0.0)   // z offset
	// max/min
	writeF64(f, 1.0)
	writeF64(f, 0.0)
	writeF64(f, 1.0)
	writeF64(f, 0.0)
	writeF64(f, 1.0)
	writeF64(f, 0.0)

	// Pad to hdrSize if needed
	cur, _ := f.Seek(0, os.SEEK_CUR)
	if cur < int64(hdrSize) {
		f.Write(make([]byte, int64(hdrSize)-cur))
	}

	// Write points
	for i := 0; i < n; i++ {
		t := float64(i) / float64(n)
		rawX := int32(t * 1000)
		rawY := int32(math.Sin(t*math.Pi*4) * 1000)
		rawZ := int32(math.Cos(t*math.Pi*4) * 1000)

		writeI32(f, rawX)
		writeI32(f, rawY)
		writeI32(f, rawZ)
		writeU16(f, uint16(i%65535)) // intensity
		f.Write([]byte{1, 0})        // return info
		f.Write([]byte{0})           // classification
		f.Write([]byte{0})           // scan angle rank
		f.Write([]byte{0})           // user data
		writeU16(f, 0)               // point source id
		// RGB
		writeU16(f, uint16(t*65535))
		writeU16(f, uint16((1-t)*65535))
		writeU16(f, 32768)
	}
	return nil
}

func writeU16(f *os.File, v uint16) { buf := make([]byte, 2); binary.LittleEndian.PutUint16(buf, v); f.Write(buf) }
func writeU32(f *os.File, v uint32) { buf := make([]byte, 4); binary.LittleEndian.PutUint32(buf, v); f.Write(buf) }
func writeI32(f *os.File, v int32)  { writeU32(f, uint32(v)) }
func writeF64(f *os.File, v float64) {
	buf := make([]byte, 8)
	binary.LittleEndian.PutUint64(buf, math.Float64bits(v))
	f.Write(buf)
}

func TestPLYRoundTrip(t *testing.T) {
	dir := t.TempDir()
	plyPath := filepath.Join(dir, "test.ply")
	outDir := filepath.Join(dir, "out_ply")

	const n = 10000
	if err := makeTinyPLY(plyPath, n); err != nil {
		t.Fatalf("makeTinyPLY: %v", err)
	}

	r, err := reader.Open(plyPath, "ply")
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	pts, err := r.Read()
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if len(pts) != n {
		t.Fatalf("expected %d points, got %d", n, len(pts))
	}
	if !pts[0].HasRGB {
		t.Error("expected HasRGB=true")
	}

	root := octree.Build(pts, octree.Options{MaxPointsPerNode: 1024})
	if root == nil {
		t.Fatal("nil root")
	}

	if err := writer.Write(outDir, root, pts, int64(n), writer.Options{Scale: 0.001}); err != nil {
		t.Fatalf("Write: %v", err)
	}

	checkOutputFiles(t, outDir)
}

func TestLASRoundTrip(t *testing.T) {
	dir := t.TempDir()
	lasPath := filepath.Join(dir, "test.las")
	outDir := filepath.Join(dir, "out_las")

	const n = 5000
	if err := makeTinyLAS(lasPath, n); err != nil {
		t.Fatalf("makeTinyLAS: %v", err)
	}

	r, err := reader.Open(lasPath, "las")
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	pts, err := r.Read()
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if len(pts) != n {
		t.Fatalf("expected %d points, got %d", n, len(pts))
	}
	if !pts[0].HasRGB {
		t.Error("expected HasRGB=true for LAS format 2")
	}
	if !pts[0].HasIntensity {
		t.Error("expected HasIntensity=true")
	}

	root := octree.Build(pts, octree.Options{MaxPointsPerNode: 1024})

	if err := writer.Write(outDir, root, pts, int64(n), writer.Options{Scale: 0.001}); err != nil {
		t.Fatalf("Write: %v", err)
	}

	checkOutputFiles(t, outDir)
}

func checkOutputFiles(t *testing.T, outDir string) {
	t.Helper()
	for _, name := range []string{"metadata.json", "hierarchy.bin", "octree.bin"} {
		path := filepath.Join(outDir, name)
		info, err := os.Stat(path)
		if err != nil {
			t.Errorf("missing %s: %v", name, err)
			continue
		}
		if info.Size() == 0 {
			t.Errorf("%s is empty", name)
		}
	}

	// Verify hierarchy.bin size is a multiple of 22
	hpath := filepath.Join(outDir, "hierarchy.bin")
	info, _ := os.Stat(hpath)
	if info != nil && info.Size()%22 != 0 {
		t.Errorf("hierarchy.bin size %d is not a multiple of 22", info.Size())
	}
}
