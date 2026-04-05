// Package reader - E57 format reader.
//
// E57 is a file format for storing 3D imaging data (ASTM E57).
// This reader handles the common case: E57 files with one or more scan data3D
// elements containing cartesian (X, Y, Z) and optionally color / intensity.
//
// The E57 format consists of:
//   - A 48-byte binary file header
//   - An XML section describing the structure and metadata
//   - One or more binary sections containing the actual point data
//
// Each CompressedVector in the XML is backed by a binary section composed of
// one or more data packets.  Inside each packet individual attributes are stored
// in fixed-width blocks of (up to) 1024 values.  The mapping from attribute
// names to bit-widths is described by the prototype record in the XML.
package reader

import (
	"encoding/binary"
	"encoding/xml"
	"fmt"
	"io"
	"math"
	"os"
	"strconv"
	"strings"
)

// E57Reader reads E57 point cloud files.
type E57Reader struct {
	path string
}

// NewE57Reader creates a reader for the given E57 file.
func NewE57Reader(path string) (*E57Reader, error) {
	return &E57Reader{path: path}, nil
}

// --- Binary file header (48 bytes) ---

type e57FileHeader struct {
	FileSignature    [8]byte  // "ASTM-E57"
	MajorVersion     uint32
	MinorVersion     uint32
	FilePhysLength   uint64
	XMLPhysOffset    uint64
	XMLPhysLength    uint64
	PageSize         uint64 // always 1024
}

const e57PageSize = 1024
const e57PageDataSize = 1020 // 1024 - 4 bytes checksum

// e57Page reads one page (1024 bytes) and strips the 4-byte checksum.
func e57Page(f io.ReaderAt, pageIdx int64) ([]byte, error) {
	buf := make([]byte, e57PageSize)
	if _, err := f.ReadAt(buf, pageIdx*e57PageSize); err != nil {
		return nil, err
	}
	return buf[:e57PageDataSize], nil
}

// readPhysical reads `length` bytes starting at physical offset `offset`,
// transparently crossing page boundaries (skipping the 4-byte CRC at the
// end of each page).
func readPhysical(f io.ReaderAt, offset, length uint64) ([]byte, error) {
	out := make([]byte, 0, length)
	for length > 0 {
		pageIdx := int64(offset / e57PageSize)
		within := offset % e57PageSize
		// don't read into the 4-byte checksum at end of page
		available := uint64(e57PageDataSize) - within
		if available == 0 {
			// advance to next page
			offset = uint64(pageIdx+1) * e57PageSize
			continue
		}
		toRead := available
		if toRead > length {
			toRead = length
		}

		buf := make([]byte, toRead)
		if _, err := f.ReadAt(buf, int64(offset)); err != nil {
			return nil, err
		}
		out = append(out, buf...)
		offset += toRead
		length -= toRead
	}
	return out, nil
}

// ----- Minimal XML schema -----

// e57Root is the top-level XML element.
type e57Root struct {
	Data3D []e57Data3D `xml:"data3D>vectorChild"`
}

type e57Data3D struct {
	Points e57CompressedVector `xml:"points"`
}

type e57CompressedVector struct {
	FileOffset  string         `xml:"fileOffset,attr"`
	RecordCount string         `xml:"recordCount,attr"`
	Codec       e57Codec       `xml:"codecs>vectorChild"`
	Prototype   e57Prototype   `xml:"prototype"`
}

type e57Codec struct {
	Inputs      []string `xml:"inputs>li"`
}

type e57Prototype struct {
	Fields []e57Field `xml:",any"`
}

func (p *e57Prototype) UnmarshalXML(d *xml.Decoder, start xml.StartElement) error {
	// We use a token loop to capture child elements generically.
	for {
		tok, err := d.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		switch t := tok.(type) {
		case xml.StartElement:
			var f e57Field
			f.Name = t.Name.Local
			for _, a := range t.Attr {
				switch a.Name.Local {
				case "type":
					f.Type = a.Value
				case "minimum":
					f.Min, _ = strconv.ParseFloat(a.Value, 64)
				case "maximum":
					f.Max, _ = strconv.ParseFloat(a.Value, 64)
				case "precision":
					f.Precision = a.Value
				}
			}
			// read content (ignore it - type info is in attributes)
			if err := d.Skip(); err != nil {
				return err
			}
			p.Fields = append(p.Fields, f)
		case xml.EndElement:
			if t.Name == start.Name {
				return nil
			}
		}
	}
	return nil
}

type e57Field struct {
	Name      string
	Type      string // "Float", "Integer", "ScaledInteger"
	Min       float64
	Max       float64
	Precision string // "single", "double"
	Scale     float64
	Offset    float64
}

// ----- Data packet -----

type e57DataPacketHeader struct {
	PacketType      uint8
	_               uint8 // reserved
	PacketLength    uint16 // in uint16 units - 1
	BytestreamCount uint16
}

// Read implements PointReader.
func (r *E57Reader) Read() ([]Point, error) {
	f, err := os.Open(r.path)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", r.path, err)
	}
	defer f.Close()

	// Read file header
	var hdr e57FileHeader
	if err := binary.Read(f, binary.LittleEndian, &hdr); err != nil {
		return nil, fmt.Errorf("read E57 header: %w", err)
	}
	if string(hdr.FileSignature[:]) != "ASTM-E57" {
		return nil, fmt.Errorf("invalid E57 signature")
	}

	// Read XML section
	xmlData, err := readPhysical(f, hdr.XMLPhysOffset, hdr.XMLPhysLength)
	if err != nil {
		return nil, fmt.Errorf("read XML section: %w", err)
	}

	var root e57Root
	if err := xml.Unmarshal(xmlData, &root); err != nil {
		return nil, fmt.Errorf("parse XML: %w", err)
	}

	var allPoints []Point

	for _, scan := range root.Data3D {
		pts, err := readE57Scan(f, scan)
		if err != nil {
			return nil, err
		}
		allPoints = append(allPoints, pts...)
	}

	if len(allPoints) == 0 {
		return nil, fmt.Errorf("no points found in E57 file")
	}
	return allPoints, nil
}

func readE57Scan(f io.ReaderAt, scan e57Data3D) ([]Point, error) {
	cv := scan.Points

	fileOffset, err := strconv.ParseUint(cv.FileOffset, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("bad fileOffset %q: %w", cv.FileOffset, err)
	}
	recordCount, err := strconv.ParseUint(cv.RecordCount, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("bad recordCount %q: %w", cv.RecordCount, err)
	}

	fields := cv.Prototype.Fields

	pts := make([]Point, 0, recordCount)

	// Read binary data packets
	offset := fileOffset
	total := uint64(0)

	for total < recordCount {
		pktHdr, pktData, err := readE57DataPacket(f, offset)
		if err != nil {
			if err == io.EOF {
				break
			}
			return nil, fmt.Errorf("read packet at %d: %w", offset, err)
		}

		// Packet byte length: (PacketLength+1)*4 bytes total, header is 6 bytes
		pktTotalBytes := uint64((uint32(pktHdr.PacketLength)+1)*4)
		offset += pktTotalBytes

		if pktHdr.PacketType != 1 {
			// Not a data packet (could be index or empty packet)
			continue
		}

		// Bytestream offsets table: BytestreamCount uint32 values
		if len(pktData) < int(pktHdr.BytestreamCount)*4 {
			continue
		}
		bsOffsets := make([]uint32, pktHdr.BytestreamCount)
		for i := range bsOffsets {
			bsOffsets[i] = binary.LittleEndian.Uint32(pktData[i*4:])
		}

		payload := pktData[pktHdr.BytestreamCount*4:]

		// Each bytestream corresponds to one field in the prototype
		newPts, err := decodeE57Packet(payload, bsOffsets, fields, recordCount-total)
		if err != nil {
			return nil, fmt.Errorf("decode packet: %w", err)
		}
		pts = append(pts, newPts...)
		total += uint64(len(newPts))
	}

	return pts, nil
}

func readE57DataPacket(f io.ReaderAt, offset uint64) (e57DataPacketHeader, []byte, error) {
	// Read packet header (first page or partial)
	hdrBuf, err := readPhysical(f, offset, 6)
	if err != nil {
		return e57DataPacketHeader{}, nil, err
	}

	var pktHdr e57DataPacketHeader
	pktHdr.PacketType = hdrBuf[0]
	// byte 1 reserved
	pktHdr.PacketLength = binary.LittleEndian.Uint16(hdrBuf[2:4])
	pktHdr.BytestreamCount = binary.LittleEndian.Uint16(hdrBuf[4:6])

	// Total packet size in bytes = (PacketLength+1) * 4
	totalBytes := uint64((uint32(pktHdr.PacketLength)+1) * 4)
	if totalBytes <= 6 {
		return pktHdr, nil, nil
	}

	bodyBuf, err := readPhysical(f, offset+6, totalBytes-6)
	if err != nil {
		return pktHdr, nil, err
	}
	return pktHdr, bodyBuf, nil
}

// decodeE57Packet decodes the bytestreams in one data packet into Point slices.
// payload is the raw payload after the bytestream-offset table.
// bsOffsets contains the starting byte of each bytestream within payload.
func decodeE57Packet(payload []byte, bsOffsets []uint32, fields []e57Field, remaining uint64) ([]Point, error) {
	if len(fields) == 0 {
		return nil, nil
	}

	// Determine number of points in this packet.
	// Each bytestream stores one attribute for up to 1024 points.
	// We compute the number of values in the first bytestream.
	numPoints := int(remaining)
	if numPoints > 1024 {
		numPoints = 1024
	}

	// Allocate result
	pts := make([]Point, numPoints)

	for i, field := range fields {
		if i >= len(bsOffsets) {
			break
		}
		start := int(bsOffsets[i])
		var end int
		if i+1 < len(bsOffsets) {
			end = int(bsOffsets[i+1])
		} else {
			end = len(payload)
		}
		if start >= len(payload) {
			continue
		}
		if end > len(payload) {
			end = len(payload)
		}
		bs := payload[start:end]

		switch strings.ToLower(field.Type) {
		case "float":
			vals := decodeE57Floats(bs, field.Precision, numPoints)
			assignE57Field(pts, field.Name, vals)
		case "integer", "scaledinteger":
			vals := decodeE57Integers(bs, field.Min, field.Max, numPoints)
			if strings.ToLower(field.Type) == "scaledinteger" {
				for i := range vals {
					vals[i] = vals[i]*field.Scale + field.Offset
				}
			}
			assignE57Field(pts, field.Name, vals)
		}
	}

	return pts, nil
}

func decodeE57Floats(bs []byte, precision string, count int) []float64 {
	out := make([]float64, count)
	if precision == "single" || precision == "" {
		for i := 0; i < count && i*4+4 <= len(bs); i++ {
			bits := binary.LittleEndian.Uint32(bs[i*4:])
			out[i] = float64(math.Float32frombits(bits))
		}
	} else {
		for i := 0; i < count && i*8+8 <= len(bs); i++ {
			bits := binary.LittleEndian.Uint64(bs[i*8:])
			out[i] = math.Float64frombits(bits)
		}
	}
	return out
}

func decodeE57Integers(bs []byte, minVal, maxVal float64, count int) []float64 {
	out := make([]float64, count)
	rang := maxVal - minVal
	if rang == 0 {
		return out
	}
	// Determine bit width from range
	bits := bitsNeeded(uint64(rang))
	bytesPerVal := (bits + 7) / 8

	for i := 0; i < count; i++ {
		offset := i * bytesPerVal
		if offset+bytesPerVal > len(bs) {
			break
		}
		var raw uint64
		for b := 0; b < bytesPerVal; b++ {
			raw |= uint64(bs[offset+b]) << (b * 8)
		}
		out[i] = float64(raw) + minVal
	}
	return out
}

func bitsNeeded(n uint64) int {
	if n == 0 {
		return 0
	}
	bits := 0
	for n > 0 {
		n >>= 1
		bits++
	}
	return bits
}

func assignE57Field(pts []Point, name string, vals []float64) {
	n := len(pts)
	if len(vals) < n {
		n = len(vals)
	}
	switch strings.ToLower(name) {
	case "cartesianx", "x":
		for i := 0; i < n; i++ {
			pts[i].X = vals[i]
		}
	case "cartesiany", "y":
		for i := 0; i < n; i++ {
			pts[i].Y = vals[i]
		}
	case "cartesianz", "z":
		for i := 0; i < n; i++ {
			pts[i].Z = vals[i]
		}
	case "colorred", "red":
		for i := 0; i < n; i++ {
			pts[i].R = floatToE57Color(vals[i])
			pts[i].HasRGB = true
		}
	case "colorgreen", "green":
		for i := 0; i < n; i++ {
			pts[i].G = floatToE57Color(vals[i])
		}
	case "colorblue", "blue":
		for i := 0; i < n; i++ {
			pts[i].B = floatToE57Color(vals[i])
		}
	case "intensity":
		for i := 0; i < n; i++ {
			pts[i].Intensity = uint16(vals[i])
			pts[i].HasIntensity = true
		}
	}
}

func floatToE57Color(v float64) uint16 {
	// E57 colors are typically 0-255 integers
	if v <= 1.0 && v >= 0.0 {
		return uint16(v * 65535)
	}
	return uint16(v)
}
