// Adapted from the EDL shader code from Christian Boucheny in Cloud Compare
// https://github.com/cloudcompare/trunk/tree/master/plugins/qEDL/shaders/EDL

precision highp float;
precision highp int;

// Uniforms
uniform float screenWidth;         // The width of the screen (or render target) in pixels.
uniform float screenHeight;        // The height of the screen in pixels.
uniform vec2 neighbours[NEIGHBOUR_COUNT]; // Predefined offsets for neighbor sampling.
uniform float edlStrength;         // Strength factor for the Eye Dome Lighting (EDL) effect.
uniform float radius;              // Radius used to determine neighbor distance.
uniform float opacity;             // Global opacity for shaded output.
uniform sampler2D colorMap;        // Texture containing both color data and depth (in its alpha channel).

// Projection matrix used to reconstruct regular depth from log depth.
uniform mat4 uProj;

// Far plane distance, used to reconstruct logarithmic depth buffer values.
uniform float far;

// Orthographic camera flag.
uniform bool useOrthographicCamera;

// Varying variable passed from the vertex shader:
in vec2 vUv;                       // Texture coordinates for the current fragment.

out vec4 fragColor;

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
		float neighbourDepth = texture(colorMap, uvNeighbor).a;
		
		// Background marker: upstream Potree clears alpha to 1.0 and treats it as background.
		// Alpha stores log2(linearDepth), so alpha==1.0 could theoretically collide with real geometry at linearDepth==2.0.
		// We keep this convention for visual parity with upstream.
		neighbourDepth = (neighbourDepth == 1.0) ? 0.0 : neighbourDepth;
		
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
	vec4 color = texture(colorMap, vUv);
	
	// Use the alpha channel as the depth value.
	float depth = color.a;
	// Treat alpha==1.0 as background (see comment in response()).
	depth = (depth == 1.0) ? 0.0 : depth;
	
	// Compute the depth difference response using neighbor sampling.
	float res = response(depth);
	
	// Determine the shading factor using the EDL strength and a scaling constant.
	float factor = edlStrength * 300.0;
	// Compute the shading value with an exponential decay function.
	float shade = exp(-res * factor);
	
	// Discard fragments with no valid depth.
	// (Keeps behavior close to upstream: background is cleared and not composited.)
	if (depth == 0.0) {
		discard;
	}
	
	// Output the final color by combining the original color with the shading effect, and applying the set opacity.
	fragColor = vec4(color.rgb * shade, opacity);

	// Reconstruct linear depth from the stored log2(lenearDepth) value.
	float dl = pow(2.0, depth);
	vec4 dp = uProj * vec4(0.0, 0.0, -dl, 1.0);
	float pz = dp.z / dp.w;

	#if defined(use_reversed_depth)
		float fragmentDepth = pz;
	#else
		float fragmentDepth = (pz + 1.0) / 2.0;
	#endif

	#if defined(use_log_depth)
		if (!useOrthographicCamera) {
			// Logarithmic depth buffer: write depth in the same format as three.js
			// logarithmicDepthBuffer, which uses:
			// vFlagDepth = clipPos.w + 1.0.
			// logDepthBufFC = 2.0 / log(far + 1.0).
			// gl_FragDepth = log2(vFlagDepth) * logDepthBufFC * 0.5;
			// Simplifies to: log2(linearDepth + 1.0) / log2(far + 1.0)
			fragmentDepth = log2(dl + 1.0) / log2(far + 1.0);
		}
	#endif

	gl_FragDepth = fragmentDepth;
}
