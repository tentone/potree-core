// Package reader provides interfaces and types for reading point cloud files
// in various formats (LAS, LAZ, PLY, E57).
package reader

import "fmt"

// Point holds a single 3D point with optional attributes.
type Point struct {
	X, Y, Z         float64
	R, G, B         uint16 // 0-65535 range
	Intensity        uint16
	Classification   uint8
	ReturnNumber     uint8
	NumberOfReturns  uint8
	PointSourceID    uint16
	HasRGB           bool
	HasIntensity     bool
	HasClassification bool
}

// PointReader is the common interface for all format readers.
type PointReader interface {
	// Read reads all points from the file and returns them.
	Read() ([]Point, error)
}

// Open opens a point cloud file and returns the appropriate reader.
func Open(path string, format string) (PointReader, error) {
	switch format {
	case "las":
		return NewLASReader(path)
	case "laz":
		return NewLAZReader(path)
	case "ply":
		return NewPLYReader(path)
	case "e57":
		return NewE57Reader(path)
	default:
		return nil, fmt.Errorf("unsupported format: %s (supported: las, laz, ply, e57)", format)
	}
}
