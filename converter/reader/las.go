package reader

import (
	"encoding/binary"
	"fmt"
	"io"
	"os"
)

// LASReader reads LAS 1.0–1.4 point cloud files.
type LASReader struct {
	path string
}

// NewLASReader creates a reader for the given LAS file path.
func NewLASReader(path string) (*LASReader, error) {
	return &LASReader{path: path}, nil
}

// lasHeader covers the LAS public header block (all versions share the first 227 bytes).
type lasHeader struct {
	FileSignature         [4]byte
	FileSourceID          uint16
	GlobalEncoding        uint16
	ProjectIDGUID1        uint32
	ProjectIDGUID2        uint16
	ProjectIDGUID3        uint16
	ProjectIDGUID4        [8]byte
	VersionMajor          uint8
	VersionMinor          uint8
	SystemIdentifier      [32]byte
	GeneratingSoftware    [32]byte
	FileCreationDayOfYear uint16
	FileCreationYear      uint16
	HeaderSize            uint16
	OffsetToPointData     uint32
	NumberOfVLRs          uint32
	PointDataFormatID     uint8
	PointDataRecordLength uint16
	NumberOfPointRecords  uint32
	NumberOfPointsByReturn [5]uint32
	XScaleFactor          float64
	YScaleFactor          float64
	ZScaleFactor          float64
	XOffset               float64
	YOffset               float64
	ZOffset               float64
	MaxX                  float64
	MinX                  float64
	MaxY                  float64
	MinY                  float64
	MaxZ                  float64
	MinZ                  float64
}

// Read implements PointReader.
func (r *LASReader) Read() ([]Point, error) {
	f, err := os.Open(r.path)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", r.path, err)
	}
	defer f.Close()

	var hdr lasHeader
	if err := binary.Read(f, binary.LittleEndian, &hdr); err != nil {
		return nil, fmt.Errorf("read header: %w", err)
	}

	sig := string(hdr.FileSignature[:])
	if sig != "LASF" {
		return nil, fmt.Errorf("invalid LAS signature: %q", sig)
	}

	// For LAS 1.4, the point count is a uint64 stored later in the header.
	// For LAS 1.4, NumberOfPointRecords in the standard header is set to 0 when
	// the point count exceeds 2^32.  The actual uint64 count is at byte offset 247
	// (LAS 1.4 spec §2.7 "Extended Point Count" field).
	numPoints := uint64(hdr.NumberOfPointRecords)
	if hdr.VersionMajor == 1 && hdr.VersionMinor >= 4 {
		var extPoints uint64
		// LAS 1.4 spec table 3: "Number of point records" (uint64) is at offset 247.
		if _, err := f.Seek(247, io.SeekStart); err == nil {
			if err2 := binary.Read(f, binary.LittleEndian, &extPoints); err2 == nil && extPoints > 0 {
				numPoints = extPoints
			}
		}
	}

	// Seek to point data
	if _, err := f.Seek(int64(hdr.OffsetToPointData), io.SeekStart); err != nil {
		return nil, fmt.Errorf("seek to point data: %w", err)
	}

	format := hdr.PointDataFormatID & 0x3F // strip compression bit
	hasRGB := format == 2 || format == 3 || format == 5 || format == 7 || format == 8 || format == 10
	hasNIR := format == 8 || format == 10

	recLen := int(hdr.PointDataRecordLength)

	pts := make([]Point, 0, numPoints)
	buf := make([]byte, recLen)

	for i := uint64(0); i < numPoints; i++ {
		if _, err := io.ReadFull(f, buf); err != nil {
			if err == io.EOF || err == io.ErrUnexpectedEOF {
				break
			}
			return nil, fmt.Errorf("read point %d: %w", i, err)
		}

		p, err := parseLASPoint(buf, format, hasRGB, hasNIR, hdr.XScaleFactor, hdr.YScaleFactor, hdr.ZScaleFactor, hdr.XOffset, hdr.YOffset, hdr.ZOffset)
		if err != nil {
			return nil, err
		}
		pts = append(pts, p)
	}

	return pts, nil
}

func parseLASPoint(buf []byte, format uint8, hasRGB, hasNIR bool,
	xScale, yScale, zScale, xOff, yOff, zOff float64) (Point, error) {

	var p Point

	rawX := int32(binary.LittleEndian.Uint32(buf[0:4]))
	rawY := int32(binary.LittleEndian.Uint32(buf[4:8]))
	rawZ := int32(binary.LittleEndian.Uint32(buf[8:12]))

	p.X = float64(rawX)*xScale + xOff
	p.Y = float64(rawY)*yScale + yOff
	p.Z = float64(rawZ)*zScale + zOff

	p.Intensity = binary.LittleEndian.Uint16(buf[12:14])
	p.HasIntensity = true

	// Byte 14: return number bits (format dependent)
	returnByte := buf[14]
	if format >= 6 {
		// LAS 1.4 formats 6-10: 4-bit return number, 4-bit number of returns
		p.ReturnNumber = returnByte & 0x0F
		p.NumberOfReturns = (returnByte >> 4) & 0x0F
	} else {
		p.ReturnNumber = returnByte & 0x07
		p.NumberOfReturns = (returnByte >> 3) & 0x07
	}

	classOffset := 15
	if format >= 6 {
		// byte 15: classification flags + scanner channel + scan direction + edge
		classOffset = 16
	}

	if classOffset < len(buf) {
		p.Classification = buf[classOffset]
		p.HasClassification = true
	}

	// Point source ID
	psidOffset := 18
	if format >= 6 {
		psidOffset = 20
	}
	if psidOffset+2 <= len(buf) {
		p.PointSourceID = binary.LittleEndian.Uint16(buf[psidOffset : psidOffset+2])
	}

	if hasRGB {
		rgbOffset := rgbOffsetForFormat(format)
		if rgbOffset+6 <= len(buf) {
			p.R = binary.LittleEndian.Uint16(buf[rgbOffset : rgbOffset+2])
			p.G = binary.LittleEndian.Uint16(buf[rgbOffset+2 : rgbOffset+4])
			p.B = binary.LittleEndian.Uint16(buf[rgbOffset+4 : rgbOffset+6])
			p.HasRGB = true
		}
	}

	return p, nil
}

func rgbOffsetForFormat(format uint8) int {
	switch format {
	case 2:
		return 20
	case 3:
		return 28
	case 5:
		return 28
	case 7:
		return 30
	case 8:
		return 30
	case 10:
		return 38
	default:
		return 20
	}
}
