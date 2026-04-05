// Package writer serialises an in-memory octree to the Potree 2.0 binary
// format understood by this library (potree-core).
//
// Output files
//   - metadata.json  – dataset description (scale, offset, attributes, …)
//   - hierarchy.bin  – 22-byte records describing the node tree
//   - octree.bin     – interleaved point attribute data, one block per node
package writer

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"

	"github.com/tentone/potree-core/converter/octree"
	"github.com/tentone/potree-core/converter/reader"
)

// ---- Metadata structs -------------------------------------------------

type potreeMetadata struct {
	Version     string              `json:"version"`
	Name        string              `json:"name"`
	Description string              `json:"description"`
	Points      int64               `json:"points"`
	Projection  string              `json:"projection"`
	Hierarchy   potreeHierarchyInfo `json:"hierarchy"`
	Offset      [3]float64          `json:"offset"`
	Scale       [3]float64          `json:"scale"`
	Spacing     float64             `json:"spacing"`
	BoundingBox potreeBBox          `json:"boundingBox"`
	Encoding    string              `json:"encoding"`
	Attributes  []potreeAttribute   `json:"attributes"`
}

type potreeHierarchyInfo struct {
	FirstChunkSize int `json:"firstChunkSize"`
	StepSize       int `json:"stepSize"`
	Depth          int `json:"depth"`
}

type potreeBBox struct {
	Min [3]float64 `json:"min"`
	Max [3]float64 `json:"max"`
}

type potreeAttribute struct {
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Size        int       `json:"size"`
	NumElements int       `json:"numElements"`
	ElementSize int       `json:"elementSize"`
	Type        string    `json:"type"`
	Min         []float64 `json:"min"`
	Max         []float64 `json:"max"`
	Scale       []float64 `json:"scale"`
	Offset      []float64 `json:"offset"`
}

// ---- Attribute layout -------------------------------------------------

// attrInfo describes one attribute's on-disk layout for encoding/metadata.
type attrInfo struct {
	name        string
	jsonName    string
	elemType    string
	numElements int
	elemSize    int
}

// Options controls writer behaviour.
type Options struct {
	// Name is used as the dataset name in metadata.json.
	Name string
	// Scale controls the quantisation precision for positions (default 0.001 m).
	Scale float64
	// MaxPointsPerNode mirrors the octree builder setting (used for spacing).
	MaxPointsPerNode int
}

func (o Options) withDefaults() Options {
	if o.Scale <= 0 {
		o.Scale = 0.001
	}
	if o.MaxPointsPerNode <= 0 {
		o.MaxPointsPerNode = 65536
	}
	if o.Name == "" {
		o.Name = "converted"
	}
	return o
}

// Write serialises the octree rooted at `root` into three files inside `outDir`.
func Write(outDir string, root *octree.Node, points []reader.Point, totalPoints int64, opts Options) error {
	opts = opts.withDefaults()

	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return fmt.Errorf("mkdir %s: %w", outDir, err)
	}

	// Determine which attributes are present
	hasRGB := false
	hasIntensity := false
	hasClass := false
	for _, p := range points {
		if p.HasRGB {
			hasRGB = true
		}
		if p.HasIntensity {
			hasIntensity = true
		}
		if p.HasClassification {
			hasClass = true
		}
		if hasRGB && hasIntensity && hasClass {
			break
		}
	}

	attrs := buildAttrs(hasRGB, hasIntensity, hasClass)
	bytesPerPoint := 0
	for _, a := range attrs {
		bytesPerPoint += a.numElements * a.elemSize
	}

	// Compute attribute ranges
	attrRanges := computeRanges(points, attrs, opts.Scale, root.Bounds)

	// ---- Write octree.bin ------------------------------------------------
	octreePath := filepath.Join(outDir, "octree.bin")
	octreeFile, err := os.Create(octreePath)
	if err != nil {
		return fmt.Errorf("create octree.bin: %w", err)
	}

	var byteOffset int64

	// BFS traversal to collect nodes in order
	nodes := bfsNodes(root)

	for _, n := range nodes {
		nBytes := int64(len(n.PointIndices)) * int64(bytesPerPoint)
		n.ByteOffset = byteOffset
		n.ByteSize = nBytes
		byteOffset += nBytes

		if err := writeNodePoints(octreeFile, n, points, attrs, opts.Scale, root.Bounds.Min); err != nil {
			octreeFile.Close()
			return fmt.Errorf("write node %s: %w", n.Name, err)
		}
	}
	if err := octreeFile.Close(); err != nil {
		return fmt.Errorf("close octree.bin: %w", err)
	}

	// ---- Write hierarchy.bin --------------------------------------------
	hierarchyPath := filepath.Join(outDir, "hierarchy.bin")
	hierarchyFile, err := os.Create(hierarchyPath)
	if err != nil {
		return fmt.Errorf("create hierarchy.bin: %w", err)
	}

	if err := writeHierarchy(hierarchyFile, nodes); err != nil {
		hierarchyFile.Close()
		return fmt.Errorf("write hierarchy.bin: %w", err)
	}
	hierarchySize, err := hierarchyFile.Seek(0, os.SEEK_CUR)
	if err != nil {
		hierarchyFile.Close()
		return err
	}
	if err := hierarchyFile.Close(); err != nil {
		return fmt.Errorf("close hierarchy.bin: %w", err)
	}

	// ---- Write metadata.json -------------------------------------------
	treeDepth := maxDepth(root)
	spacing := computeSpacing(root, opts)

	meta := buildMetadata(root, nodes, totalPoints, treeDepth, spacing, int(hierarchySize), attrs, attrRanges, opts)

	metaPath := filepath.Join(outDir, "metadata.json")
	metaFile, err := os.Create(metaPath)
	if err != nil {
		return fmt.Errorf("create metadata.json: %w", err)
	}
	enc := json.NewEncoder(metaFile)
	enc.SetIndent("", "\t")
	if err := enc.Encode(meta); err != nil {
		metaFile.Close()
		return fmt.Errorf("encode metadata.json: %w", err)
	}
	return metaFile.Close()
}

// ---- Attribute helpers ------------------------------------------------

func buildAttrs(hasRGB, hasIntensity, hasClass bool) []attrInfo {
	attrs := []attrInfo{
		{name: "position", jsonName: "position", elemType: "int32", numElements: 3, elemSize: 4},
	}
	if hasRGB {
		attrs = append(attrs, attrInfo{
			name: "rgba", jsonName: "rgb", elemType: "uint16", numElements: 3, elemSize: 2,
		})
	}
	if hasIntensity {
		attrs = append(attrs, attrInfo{
			name: "intensity", jsonName: "intensity", elemType: "uint16", numElements: 1, elemSize: 2,
		})
	}
	if hasClass {
		attrs = append(attrs, attrInfo{
			name: "classification", jsonName: "classification", elemType: "uint8", numElements: 1, elemSize: 1,
		})
	}
	return attrs
}

type attrRange struct {
	min []float64
	max []float64
}

func computeRanges(points []reader.Point, attrs []attrInfo, scale float64, bounds octree.Bounds) []attrRange {
	ranges := make([]attrRange, len(attrs))
	for i, a := range attrs {
		ranges[i].min = make([]float64, a.numElements)
		ranges[i].max = make([]float64, a.numElements)
		for j := range ranges[i].min {
			ranges[i].min[j] = math.MaxFloat64
			ranges[i].max[j] = -math.MaxFloat64
		}
	}

	for _, p := range points {
		for ai, a := range attrs {
			var vals []float64
			switch a.name {
			case "position":
				// Report world-space values (not quantised)
				vals = []float64{p.X, p.Y, p.Z}
			case "rgba":
				vals = []float64{float64(p.R), float64(p.G), float64(p.B)}
			case "intensity":
				vals = []float64{float64(p.Intensity)}
			case "classification":
				vals = []float64{float64(p.Classification)}
			}
			for j, v := range vals {
				if v < ranges[ai].min[j] {
					ranges[ai].min[j] = v
				}
				if v > ranges[ai].max[j] {
					ranges[ai].max[j] = v
				}
			}
		}
	}
	return ranges
}

// ---- Point data writing -----------------------------------------------

// writeNodePoints writes the interleaved point data for one node.
func writeNodePoints(f *os.File, node *octree.Node, points []reader.Point, attrs []attrInfo, scale float64, offset [3]float64) error {
	if len(node.PointIndices) == 0 {
		return nil
	}

	bytesPerPoint := 0
	for _, a := range attrs {
		bytesPerPoint += a.numElements * a.elemSize
	}

	buf := make([]byte, int64(len(node.PointIndices))*int64(bytesPerPoint))

	for j, idx := range node.PointIndices {
		p := points[idx]
		base := j * bytesPerPoint
		pos := base

		for _, a := range attrs {
			switch a.name {
			case "position":
				qx := int32(math.Round((p.X - offset[0]) / scale))
				qy := int32(math.Round((p.Y - offset[1]) / scale))
				qz := int32(math.Round((p.Z - offset[2]) / scale))
				binary.LittleEndian.PutUint32(buf[pos:], uint32(qx))
				binary.LittleEndian.PutUint32(buf[pos+4:], uint32(qy))
				binary.LittleEndian.PutUint32(buf[pos+8:], uint32(qz))
				pos += 12
			case "rgba":
				binary.LittleEndian.PutUint16(buf[pos:], p.R)
				binary.LittleEndian.PutUint16(buf[pos+2:], p.G)
				binary.LittleEndian.PutUint16(buf[pos+4:], p.B)
				pos += 6
			case "intensity":
				binary.LittleEndian.PutUint16(buf[pos:], p.Intensity)
				pos += 2
			case "classification":
				buf[pos] = p.Classification
				pos++
			}
		}
	}

	_, err := f.Write(buf)
	return err
}

// ---- Hierarchy writing ------------------------------------------------

// writeHierarchy writes the hierarchy.bin file with one 22-byte record per
// node in BFS order.
//
// Record layout (little-endian):
//
//	uint8   type       (0 = real node, 2 = proxy – we only emit 0)
//	uint8   childMask  bitmask of existing children (bit i = child i exists)
//	uint32  numPoints
//	int64   byteOffset  offset in octree.bin
//	int64   byteSize    byte size in octree.bin
func writeHierarchy(f *os.File, nodes []*octree.Node) error {
	// Build a lookup from node name → index so we can compute childMask
	nameToNode := make(map[string]*octree.Node, len(nodes))
	for _, n := range nodes {
		nameToNode[n.Name] = n
	}

	buf := make([]byte, 22)
	for _, n := range nodes {
		var childMask uint8
		for ci, child := range n.Children {
			if child != nil {
				childMask |= 1 << ci
			}
		}

		buf[0] = 0 // type: real node
		buf[1] = childMask
		binary.LittleEndian.PutUint32(buf[2:], uint32(len(n.PointIndices)))
		binary.LittleEndian.PutUint64(buf[6:], uint64(n.ByteOffset))
		binary.LittleEndian.PutUint64(buf[14:], uint64(n.ByteSize))

		if _, err := f.Write(buf); err != nil {
			return err
		}
	}
	return nil
}

// ---- Metadata building ------------------------------------------------

func buildMetadata(
	root *octree.Node,
	nodes []*octree.Node,
	totalPoints int64,
	treeDepth int,
	spacing float64,
	hierarchySize int,
	attrs []attrInfo,
	ranges []attrRange,
	opts Options,
) potreeMetadata {

	offset := root.Bounds.Min
	scale := [3]float64{opts.Scale, opts.Scale, opts.Scale}

	var metaAttrs []potreeAttribute
	for i, a := range attrs {
		ma := potreeAttribute{
			Name:        a.jsonName,
			Description: "",
			NumElements: a.numElements,
			ElementSize: a.elemSize,
			Size:        a.numElements * a.elemSize,
			Type:        a.elemType,
			Scale:       make([]float64, a.numElements),
			Offset:      make([]float64, a.numElements),
			Min:         ranges[i].min,
			Max:         ranges[i].max,
		}
		for j := range ma.Scale {
			ma.Scale[j] = 1
		}
		metaAttrs = append(metaAttrs, ma)
	}

	return potreeMetadata{
		Version:     "2.0",
		Name:        opts.Name,
		Description: "",
		Points:      totalPoints,
		Projection:  "",
		Hierarchy: potreeHierarchyInfo{
			FirstChunkSize: hierarchySize,
			StepSize:       4,
			Depth:          treeDepth,
		},
		Offset:  offset,
		Scale:   scale,
		Spacing: spacing,
		BoundingBox: potreeBBox{
			Min: root.Bounds.Min,
			Max: root.Bounds.Max,
		},
		Encoding:   "DEFAULT",
		Attributes: metaAttrs,
	}
}

// ---- Helpers ----------------------------------------------------------

// bfsNodes returns all nodes in the tree in BFS (breadth-first) order.
func bfsNodes(root *octree.Node) []*octree.Node {
	var result []*octree.Node
	queue := []*octree.Node{root}
	for len(queue) > 0 {
		n := queue[0]
		queue = queue[1:]
		result = append(result, n)
		for _, child := range n.Children {
			if child != nil {
				queue = append(queue, child)
			}
		}
	}
	return result
}

func maxDepth(node *octree.Node) int {
	if node == nil {
		return 0
	}
	max := node.Level
	for _, child := range node.Children {
		if d := maxDepth(child); d > max {
			max = d
		}
	}
	return max
}

func computeSpacing(root *octree.Node, opts Options) float64 {
	// Spacing ~ the average distance between points at the root level
	side := root.Bounds.Max[0] - root.Bounds.Min[0]
	n := float64(opts.MaxPointsPerNode)
	if n <= 0 {
		n = 65536
	}
	// Approximate: cube-root of (volume / numPoints) * some factor
	vol := side * side * side
	if vol <= 0 || n <= 0 {
		return 0.05
	}
	spacing := math.Pow(vol/n, 1.0/3.0)
	return spacing
}
