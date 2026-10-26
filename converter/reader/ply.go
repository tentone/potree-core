package reader

import (
	"bufio"
	"encoding/binary"
	"fmt"
	"io"
	"math"
	"os"
	"strconv"
	"strings"
)

// PLYReader reads PLY (Stanford Polygon Format) files.
// Supports ASCII, binary_little_endian, and binary_big_endian with vertex elements.
type PLYReader struct {
	path string
}

// NewPLYReader creates a reader for the given PLY file path.
func NewPLYReader(path string) (*PLYReader, error) {
	return &PLYReader{path: path}, nil
}

type plyProperty struct {
	name    string
	typeName string
	byteSize int
	isList  bool
}

type plyElement struct {
	name       string
	count      int
	properties []plyProperty
}

type plyFormat int

const (
	plyASCII plyFormat = iota
	plyBinaryLE
	plyBinaryBE
)

// Read implements PointReader.
func (r *PLYReader) Read() ([]Point, error) {
	f, err := os.Open(r.path)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", r.path, err)
	}
	defer f.Close()

	reader := bufio.NewReader(f)

	// Parse header
	line, err := reader.ReadString('\n')
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(line) != "ply" {
		return nil, fmt.Errorf("not a PLY file: %q", line)
	}

	var format plyFormat
	var elements []plyElement
	var currentEl *plyElement
	headerEnd := 0

	for {
		line, err = reader.ReadString('\n')
		if err != nil {
			return nil, fmt.Errorf("read PLY header: %w", err)
		}
		headerEnd += len(line)
		line = strings.TrimSpace(line)

		if line == "end_header" {
			break
		}
		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}

		switch fields[0] {
		case "format":
			if len(fields) < 2 {
				continue
			}
			switch fields[1] {
			case "ascii":
				format = plyASCII
			case "binary_little_endian":
				format = plyBinaryLE
			case "binary_big_endian":
				format = plyBinaryBE
			}
		case "element":
			if len(fields) < 3 {
				continue
			}
			count, _ := strconv.Atoi(fields[2])
			elements = append(elements, plyElement{name: fields[1], count: count})
			currentEl = &elements[len(elements)-1]
		case "property":
			if currentEl == nil || len(fields) < 3 {
				continue
			}
			if fields[1] == "list" {
				if len(fields) < 5 {
					continue
				}
				currentEl.properties = append(currentEl.properties, plyProperty{
					name: fields[4], typeName: fields[3],
					byteSize: plyTypeSize(fields[3]), isList: true,
				})
			} else {
				currentEl.properties = append(currentEl.properties, plyProperty{
					name: fields[2], typeName: fields[1],
					byteSize: plyTypeSize(fields[1]),
				})
			}
		}
	}

	// Find vertex element
	var vertexEl *plyElement
	for i := range elements {
		if elements[i].name == "vertex" {
			vertexEl = &elements[i]
			break
		}
	}
	if vertexEl == nil {
		return nil, fmt.Errorf("PLY file has no 'vertex' element")
	}

	if format == plyASCII {
		return readPLYASCII(reader, vertexEl)
	}
	return readPLYBinary(reader, vertexEl, format == plyBinaryBE)
}

func readPLYASCII(reader *bufio.Reader, el *plyElement) ([]Point, error) {
	pts := make([]Point, 0, el.count)

	for i := 0; i < el.count; i++ {
		line, err := reader.ReadString('\n')
		if err != nil && err != io.EOF {
			return nil, fmt.Errorf("read vertex %d: %w", i, err)
		}
		fields := strings.Fields(line)
		if len(fields) == 0 {
			i--
			continue
		}

		p, err := parsePLYVertex(fields, el.properties)
		if err != nil {
			return nil, err
		}
		pts = append(pts, p)
	}

	return pts, nil
}

func parsePLYVertex(fields []string, props []plyProperty) (Point, error) {
	var p Point
	propIdx := 0
	for _, prop := range props {
		if propIdx >= len(fields) {
			break
		}
		val, err := strconv.ParseFloat(fields[propIdx], 64)
		if err != nil {
			return p, fmt.Errorf("parse property %s: %w", prop.name, err)
		}
		propIdx++

		switch prop.name {
		case "x":
			p.X = val
		case "y":
			p.Y = val
		case "z":
			p.Z = val
		case "red", "r":
			p.R = uint16(val)
			if val <= 1.0 && val >= 0.0 && prop.typeName == "float" {
				p.R = uint16(val * 65535)
			}
			p.HasRGB = true
		case "green", "g":
			p.G = uint16(val)
			if val <= 1.0 && val >= 0.0 && prop.typeName == "float" {
				p.G = uint16(val * 65535)
			}
		case "blue", "b":
			p.B = uint16(val)
			if val <= 1.0 && val >= 0.0 && prop.typeName == "float" {
				p.B = uint16(val * 65535)
			}
		case "intensity", "scalar_Intensity":
			p.Intensity = uint16(val)
			p.HasIntensity = true
		case "classification", "class":
			p.Classification = uint8(val)
			p.HasClassification = true
		}
	}
	return p, nil
}

func readPLYBinary(reader *bufio.Reader, el *plyElement, bigEndian bool) ([]Point, error) {
	order := binary.ByteOrder(binary.LittleEndian)
	if bigEndian {
		order = binary.BigEndian
	}

	// Compute bytes per vertex
	bytesPerVertex := 0
	for _, prop := range el.properties {
		if !prop.isList {
			bytesPerVertex += prop.byteSize
		}
	}

	pts := make([]Point, 0, el.count)
	buf := make([]byte, bytesPerVertex)

	for i := 0; i < el.count; i++ {
		if _, err := io.ReadFull(reader, buf); err != nil {
			if err == io.EOF || err == io.ErrUnexpectedEOF {
				break
			}
			return nil, fmt.Errorf("read vertex %d: %w", i, err)
		}

		p, err := parsePLYBinaryVertex(buf, el.properties, order)
		if err != nil {
			return nil, err
		}
		pts = append(pts, p)
	}

	return pts, nil
}

func parsePLYBinaryVertex(buf []byte, props []plyProperty, order binary.ByteOrder) (Point, error) {
	var p Point
	offset := 0

	for _, prop := range props {
		if prop.isList || offset+prop.byteSize > len(buf) {
			break
		}

		val := readPLYValue(buf[offset:], prop.typeName, order)
		offset += prop.byteSize

		switch prop.name {
		case "x":
			p.X = val
		case "y":
			p.Y = val
		case "z":
			p.Z = val
		case "red", "r":
			p.R = floatToUint16Color(val, prop.typeName)
			p.HasRGB = true
		case "green", "g":
			p.G = floatToUint16Color(val, prop.typeName)
		case "blue", "b":
			p.B = floatToUint16Color(val, prop.typeName)
		case "intensity", "scalar_Intensity":
			p.Intensity = uint16(val)
			p.HasIntensity = true
		case "classification", "class":
			p.Classification = uint8(val)
			p.HasClassification = true
		}
	}

	return p, nil
}

func floatToUint16Color(val float64, typeName string) uint16 {
	if (typeName == "float" || typeName == "double") && val <= 1.0 {
		return uint16(val * 65535)
	}
	return uint16(val)
}

func readPLYValue(buf []byte, typeName string, order binary.ByteOrder) float64 {
	switch typeName {
	case "char", "int8":
		return float64(int8(buf[0]))
	case "uchar", "uint8":
		return float64(buf[0])
	case "short", "int16":
		return float64(int16(order.Uint16(buf)))
	case "ushort", "uint16":
		return float64(order.Uint16(buf))
	case "int", "int32":
		return float64(int32(order.Uint32(buf)))
	case "uint", "uint32":
		return float64(order.Uint32(buf))
	case "float", "float32":
		bits := order.Uint32(buf)
		return float64(math.Float32frombits(bits))
	case "double", "float64":
		bits := order.Uint64(buf)
		return math.Float64frombits(bits)
	}
	return 0
}

func plyTypeSize(typeName string) int {
	switch typeName {
	case "char", "uchar", "int8", "uint8":
		return 1
	case "short", "ushort", "int16", "uint16":
		return 2
	case "int", "uint", "int32", "uint32", "float", "float32":
		return 4
	case "double", "float64", "int64", "uint64":
		return 8
	}
	return 4 // default
}
