// Declare a varying vec2 to pass UV coordinates to the fragment shader
varying vec2 vUv;

void main() {
	// Assign the UV coordinates from the vertex data to vUv
	vUv = uv;
	
	// Compute the model-view position of the vertex
	vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

	// Project the computed position onto the screen
	gl_Position = projectionMatrix * mvPosition;
}