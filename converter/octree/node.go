// Package octree builds a Potree 2.0 compatible in-memory octree from a flat
// slice of 3D points.
package octree

import (
	"math"

	"github.com/tentone/potree-core/converter/reader"
)

// Node is a single cell in the octree.
type Node struct {
	// Name is the Potree node name, e.g. "r", "r0", "r07", …
	Name string
	// Level is the depth in the tree (root = 0).
	Level int
	// Bounds is the axis-aligned bounding box of this node.
	Bounds Bounds
	// PointIndices holds indices into the global point slice for points
	// that are stored in this node (after subsampling).
	PointIndices []int32
	// Children are the 8 child nodes (nil if absent).
	// Index encoding: bit2=x, bit1=y, bit0=z (same as PotreeConverter).
	Children [8]*Node

	// Filled in by the writer:
	ByteOffset int64
	ByteSize   int64
}

// Bounds is an axis-aligned bounding box.
type Bounds struct {
	Min [3]float64
	Max [3]float64
}

// Center returns the center of the bounding box.
func (b Bounds) Center() [3]float64 {
	return [3]float64{
		(b.Min[0] + b.Max[0]) * 0.5,
		(b.Min[1] + b.Max[1]) * 0.5,
		(b.Min[2] + b.Max[2]) * 0.5,
	}
}

// ChildBounds returns the sub-box for child with the given 0-7 index.
// The encoding matches PotreeConverter / OctreeLoader.ts:
//
//	bit 2 (0b100) = upper X half
//	bit 1 (0b010) = upper Y half
//	bit 0 (0b001) = upper Z half
func (b Bounds) ChildBounds(index int) Bounds {
	c := b.Center()
	child := Bounds{Min: b.Min, Max: b.Max}

	if index&0b100 != 0 {
		child.Min[0] = c[0]
	} else {
		child.Max[0] = c[0]
	}
	if index&0b010 != 0 {
		child.Min[1] = c[1]
	} else {
		child.Max[1] = c[1]
	}
	if index&0b001 != 0 {
		child.Min[2] = c[2]
	} else {
		child.Max[2] = c[2]
	}
	return child
}

// Options controls octree construction.
type Options struct {
	// MaxDepth limits the tree depth.  Defaults to 20.
	MaxDepth int
}

func (o Options) withDefaults() Options {
	if o.MaxDepth <= 0 {
		o.MaxDepth = 20
	}
	return o
}

// Build constructs an octree from the given points.
// The maximum number of points stored per node is computed automatically as
// ceil(cbrt(len(points))), which produces a balanced tree depth while ensuring
// every input point is included in the output.
func Build(points []reader.Point, opts Options) *Node {
	opts = opts.withDefaults()

	// Auto-compute per-node limit so all points fit in the tree at a
	// reasonable depth.  Using the cube-root targets roughly three levels of
	// meaningful subdivision regardless of dataset size.
	maxPointsPerNode := int(math.Ceil(math.Cbrt(float64(len(points)))))
	if maxPointsPerNode < 1 {
		maxPointsPerNode = 1
	}

	bounds := computeBounds(points)
	bounds = makeCubic(bounds)

	indices := make([]int32, len(points))
	for i := range indices {
		indices[i] = int32(i)
	}

	root := &Node{Name: "r", Level: 0, Bounds: bounds}
	buildRecursive(root, points, indices, maxPointsPerNode, opts)
	return root
}

// buildRecursive partitions `indices` into this node and its children.
// The first `min(maxPointsPerNode, len(indices))` indices (after shuffling) are kept
// at this node; the rest are forwarded to child nodes.
func buildRecursive(node *Node, points []reader.Point, indices []int32, maxPointsPerNode int, opts Options) {
	if len(indices) == 0 {
		return
	}

	if len(indices) <= maxPointsPerNode || node.Level >= opts.MaxDepth {
		node.PointIndices = indices
		return
	}

	// Shuffle to get a spatially representative random sample.
	lcgShuffle(indices)

	keep := maxPointsPerNode
	node.PointIndices = indices[:keep]
	rest := indices[keep:]

	// Partition remaining points into 8 children by position.
	center := node.Bounds.Center()
	var childSlots [8][]int32
	for _, idx := range rest {
		p := points[idx]
		ci := 0
		if p.X >= center[0] {
			ci |= 0b100
		}
		if p.Y >= center[1] {
			ci |= 0b010
		}
		if p.Z >= center[2] {
			ci |= 0b001
		}
		childSlots[ci] = append(childSlots[ci], idx)
	}

	for ci, childIndices := range childSlots {
		if len(childIndices) == 0 {
			continue
		}
		child := &Node{
			Name:   node.Name + string(rune('0'+ci)),
			Level:  node.Level + 1,
			Bounds: node.Bounds.ChildBounds(ci),
		}
		node.Children[ci] = child
		buildRecursive(child, points, childIndices, maxPointsPerNode, opts)
	}
}

// lcgShuffle performs a deterministic in-place Fisher-Yates shuffle using a
// linear congruential generator so that results are reproducible.
func lcgShuffle(s []int32) {
	n := len(s)
	if n < 2 {
		return
	}
	// LCG constants from Numerical Recipes
	const a = 1664525
	const c = 1013904223
	seed := uint32(n) ^ 0xDEADBEEF
	for i := n - 1; i > 0; i-- {
		seed = seed*a + c
		j := int(seed>>1) % (i + 1)
		s[i], s[j] = s[j], s[i]
	}
}

// computeBounds returns the tight axis-aligned bounding box of all points.
func computeBounds(points []reader.Point) Bounds {
	b := Bounds{
		Min: [3]float64{math.MaxFloat64, math.MaxFloat64, math.MaxFloat64},
		Max: [3]float64{-math.MaxFloat64, -math.MaxFloat64, -math.MaxFloat64},
	}
	for _, p := range points {
		if p.X < b.Min[0] {
			b.Min[0] = p.X
		}
		if p.Y < b.Min[1] {
			b.Min[1] = p.Y
		}
		if p.Z < b.Min[2] {
			b.Min[2] = p.Z
		}
		if p.X > b.Max[0] {
			b.Max[0] = p.X
		}
		if p.Y > b.Max[1] {
			b.Max[1] = p.Y
		}
		if p.Z > b.Max[2] {
			b.Max[2] = p.Z
		}
	}
	return b
}

// makeCubic expands the bounding box so that all three dimensions are equal
// (cubic).  The box is expanded outward symmetrically.
func makeCubic(b Bounds) Bounds {
	dx := b.Max[0] - b.Min[0]
	dy := b.Max[1] - b.Min[1]
	dz := b.Max[2] - b.Min[2]
	side := math.Max(math.Max(dx, dy), dz)

	// Add a small padding to avoid points landing exactly on the boundary
	side *= 1.001

	for i := 0; i < 3; i++ {
		center := (b.Min[i] + b.Max[i]) * 0.5
		b.Min[i] = center - side*0.5
		b.Max[i] = center + side*0.5
	}
	return b
}
