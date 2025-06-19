#extension GL_EXT_frag_depth : enable

// Uniforms: depth map and texture map.
uniform sampler2D depthMap;
uniform sampler2D texture;

// Varying UV coordinates passed from the vertex shader.
varying vec2 vUv;

void main() {
	// Get the depth value from the depth map (using green channel).
	float depth = texture2D(depthMap, vUv).g;
	if (depth <= 0.0) discard; // Discard fragment if depth is not positive.
	
	// Retrieve the color from the texture.
	vec4 color = texture2D(texture, vUv);
	// Normalize RGB using the alpha (w) component.
	color.rgb /= color.w;
	
	// Output the final color and set fragment depth.
	gl_FragColor = vec4(color.rgb, 1.0);
	gl_FragDepthEXT = depth;
}
