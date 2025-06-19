precision highp float;
precision highp int;

// Uniforms for projection, screen size, and texture sampler
uniform mat4 projectionMatrix;
uniform float screenWidth;
uniform float screenHeight;
uniform sampler2D map;

varying vec2 vUv;

void main() {
	// Calculate pixel offsets
	float dx = 1.0 / screenWidth;
	float dy = 1.0 / screenHeight;

	// Average the color of the 9 surrounding pixels
	vec3 color = texture2D(map, vUv + vec2(-dx, -dy)).rgb;
	color += texture2D(map, vUv + vec2( 0.0, -dy)).rgb;
	color += texture2D(map, vUv + vec2( dx, -dy)).rgb;
	color += texture2D(map, vUv + vec2(-dx,  0.0)).rgb;
	color += texture2D(map, vUv + vec2( 0.0,  0.0)).rgb;
	color += texture2D(map, vUv + vec2( dx,  0.0)).rgb;
	color += texture2D(map, vUv + vec2(-dx,  dy)).rgb;
	color += texture2D(map, vUv + vec2( 0.0,  dy)).rgb;
	color += texture2D(map, vUv + vec2( dx,  dy)).rgb;

	// Set the output color with alpha = 1.0
	gl_FragColor = vec4(color / 9.0, 1.0);
}
