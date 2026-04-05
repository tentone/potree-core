package reader

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// LAZReader decompresses a LAZ file to a temporary LAS file and reads it.
// It requires either `laszip` or `las2las` to be available in PATH.
type LAZReader struct {
	path string
}

// NewLAZReader creates a reader for the given LAZ file path.
func NewLAZReader(path string) (*LAZReader, error) {
	return &LAZReader{path: path}, nil
}

// Read implements PointReader by decompressing to LAS first.
func (r *LAZReader) Read() ([]Point, error) {
	// Create a temp file path for the decompressed LAS
	base := strings.TrimSuffix(filepath.Base(r.path), ".laz")
	tmp := filepath.Join(os.TempDir(), base+"_decompressed.las")

	// Remove temp file when done
	defer os.Remove(tmp)

	// Try laszip first, then las2las
	var cmdErr error
	for _, tool := range []string{"laszip", "las2las"} {
		cmd := exec.Command(tool, "-i", r.path, "-o", tmp)
		if out, err := cmd.CombinedOutput(); err == nil {
			cmdErr = nil
			_ = out
			break
		} else {
			cmdErr = fmt.Errorf("%s: %w\n%s", tool, err, out)
		}
	}
	if cmdErr != nil {
		return nil, fmt.Errorf("LAZ decompression failed (install laszip or las2las): %w", cmdErr)
	}

	las, err := NewLASReader(tmp)
	if err != nil {
		return nil, err
	}
	return las.Read()
}
