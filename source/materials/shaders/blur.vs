// Vertex shader for blur effect.
precision highp float;  // Use high precision for floats.
precision highp int;    // Use high precision for ints.

attribute vec3 position;    // Vertex position.
attribute vec2 uv;          // Texture coordinate.

uniform mat4 modelViewMatrix;  // Model-view transformation.
uniform mat4 projectionMatrix; // Projection transformation.

varying vec2 vUv;            // Pass uv coordinates to fragment shader.

void main() {
	// Pass the texture coordinate.
	vUv = uv;

	// Compute the vertex position.
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}