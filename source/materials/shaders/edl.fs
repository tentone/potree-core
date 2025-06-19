// Adapted from the EDL shader code from Christian Boucheny in Cloud Compare
// https://github.com/cloudcompare/trunk/tree/master/plugins/qEDL/shaders/EDL

// Uniforms
uniform float screenWidth;         // The width of the screen (or render target) in pixels.
uniform float screenHeight;        // The height of the screen in pixels.
uniform vec2 neighbours[NEIGHBOUR_COUNT]; // Predefined offsets for neighbor sampling.
uniform float edlStrength;         // Strength factor for the Eye Dome Lighting (EDL) effect.
uniform float radius;              // Radius used to determine neighbor distance.
uniform float opacity;             // Global opacity for shaded output.
uniform sampler2D colorMap;        // Texture containing both color data and depth (in its alpha channel).

// Varying variable passed from the vertex shader:
varying vec2 vUv;                // Texture coordinates for the current fragment.

// Function to compute the shading response based on depth differences:
float response(const float depth) {
	// Convert the radius from pixels to texture coordinate space.
	vec2 uvRadius = vec2(radius / screenWidth, radius / screenHeight);
	float sum = 0.0;
	
	// Iterate over all neighbor offsets.
	for (int i = 0; i < NEIGHBOUR_COUNT; i++) {
		// Calculate the texture coordinate for the neighbor.
		vec2 uvNeighbor = vUv + uvRadius * neighbours[i];
		// Retrieve the neighbor's depth value from the alpha channel of the texture.
		float neighbourDepth = texture2D(colorMap, uvNeighbor).a;
		
		// Check if the neighbor has a valid depth.
		if (neighbourDepth != 0.0) {
			// If the current depth is zero, add a high value to emphasize the effect;
			// otherwise, add the positive difference between current and neighbor depth.
			sum += (depth == 0.0) ? 100.0 : max(0.0, depth - neighbourDepth);
		}
	}
	
	// Compute the average response over all neighbors.
	return sum / float(NEIGHBOUR_COUNT);
}

void main() {
	// Sample the texture at the current fragment's coordinates.
	vec4 color = texture2D(colorMap, vUv);
	
	// Use the alpha channel as the depth value.
	float depth = color.a;
	// Compute the depth difference response using neighbor sampling.
	float res = response(depth);
	
	// Determine the shading factor using the EDL strength and a scaling constant.
	float factor = edlStrength * 300.0;
	// Compute the shading value with an exponential decay function.
	float shade = exp(-res * factor);
	
	// Discard fragments with no valid color and no response (to optimize rendering).
	if (color.a == 0.0 && res == 0.0) {
		discard;
	}
	
	// Output the final color by combining the original color with the shading effect, and applying the set opacity.
	gl_FragColor = vec4(color.rgb * shade, opacity);
}
