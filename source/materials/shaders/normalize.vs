// Varying vector to pass texture coordinates to the fragment shader
varying vec2 vUv;

void main() {
	// Pass the UV coordinate to the fragment shader
	vUv = uv;

	// Compute the final vertex position using projection and model-view matrices
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}