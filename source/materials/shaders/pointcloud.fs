// Set precision for floats and ints
precision highp float;
precision highp int;

// Uniforms for camera, projection and point parameters
uniform mat4 viewMatrix;
uniform vec3 cameraPosition;
uniform mat4 projectionMatrix;
uniform float opacity;
uniform bool useOrthographicCamera;
uniform float blendHardness;
uniform float blendDepthSupplement;
uniform float fov;
uniform float spacing;
uniform float pcIndex;
uniform float screenWidth;
uniform float screenHeight;
uniform float far;
uniform sampler2D depthMap;

out vec4 fragColor;

#ifdef highlight_point
	// Color used to highlight a point
	uniform vec4 highlightedPointColor;
#endif

#ifdef new_format
	in vec4 vColor;
#else
	in vec3 vColor;
#endif

#if !defined(color_type_point_index)
	// Opacity attribute when not using point index color type
	in float vOpacity;
#endif

#if defined(weighted_splats)
	// Linear depth value for weighted splats
	in float vLinearDepth;
#endif

#ifdef use_edl
	// Log depth for EDL rendering
	in float vLogDepth;
#endif

in vec3 vViewPosition;
#if defined(weighted_splats) || defined(paraboloid_point_shape)
	// Radius for point shapes
	in float vRadius;
#endif

#if defined(color_type_phong) && (MAX_POINT_LIGHTS > 0 || MAX_DIR_LIGHTS > 0)
	// Normal for Phong shading
	in vec3 vNormal;
#endif

#ifdef highlight_point
	// Highlight flag for the point
	in float vHighlight;
#endif

float specularStrength = 1.0;

void main() {
	// Choose the proper color format
	#ifdef new_format
		vec3 actualColor = vColor.xyz;
	#else
		vec3 actualColor = vColor;
	#endif
	vec3 color = actualColor;

	// Precompute normalized point coordinate if needed
	#if defined(circle_point_shape) || defined(paraboloid_point_shape) || defined(weighted_splats)
		vec2 pc = 2.0 * gl_PointCoord - 1.0;
	#endif

	// Discard fragments outside circle for certain shapes
	#if defined(circle_point_shape) || defined(weighted_splats)
		if(dot(pc, pc) > 1.0) discard;
	#endif

	// Depth comparison for weighted splats
	#if defined(weighted_splats)
		vec2 uv = gl_FragCoord.xy / vec2(screenWidth, screenHeight);
		if(vLinearDepth > texture2D(depthMap, uv).r + vRadius + blendDepthSupplement) discard;
	#endif

	// Lighting calculations for Phong shading
	#if defined(color_type_phong)
		#if MAX_POINT_LIGHTS > 0 || MAX_DIR_LIGHTS > 0
			vec3 normal = normalize(vNormal);
			normal.z = abs(normal.z);
			vec3 viewDir = normalize(vViewPosition);
		#endif

		#if MAX_POINT_LIGHTS > 0
			vec3 pointDiffuse = vec3(0.0);
			vec3 pointSpecular = vec3(0.0);
			// Loop through each point light
			for(int i = 0; i < MAX_POINT_LIGHTS; i++) {
				vec4 lPos = viewMatrix * vec4(pointLightPosition[i], 1.0);
				vec3 lVector = normalize(lPos.xyz + vViewPosition);
				float lDistance = (pointLightDistance[i] > 0.0)
					? 1.0 - min(length(lVector)/pointLightDistance[i], 1.0)
					: 1.0;
				float dotVal = dot(normal, lVector);
				#ifdef WRAP_AROUND
					// Use wrap around lighting if enabled
					float fullW = max(dotVal, 0.0);
					float halfW = max(0.5 * dotVal + 0.5, 0.0);
					float diffuseW = mix(fullW, halfW, wrapRGB);
				#else
					float diffuseW = max(dotVal, 0.0);
				#endif
				pointDiffuse += diffuse * pointLightColor[i] * diffuseW * lDistance;
				vec3 halfVec = normalize(lVector + viewDir);
				float specW = specularStrength * max(pow(max(dot(normal, halfVec), 0.0), shininess), 0.0);
				float normFactor = (shininess + 2.0) / 8.0;
				vec3 schlick = specular + (vec3(1.0)-specular)*pow(max(1.0-dot(lVector, halfVec), 0.0), 5.0);
				pointSpecular += schlick * pointLightColor[i] * specW * diffuseW * lDistance * normFactor;
				// Disable specular effect if required
				pointSpecular = vec3(0.0);
			}
		#endif

		#if MAX_DIR_LIGHTS > 0
			vec3 dirDiffuse = vec3(0.0);
			vec3 dirSpecular = vec3(0.0);
			// Loop through each directional light
			for(int i = 0; i < MAX_DIR_LIGHTS; i++) {
				vec4 lDir = viewMatrix * vec4(directionalLightDirection[i], 0.0);
				vec3 dVector = normalize(lDir.xyz);
				float dotVal = dot(normal, dVector);
				#ifdef WRAP_AROUND
					float fullW = max(dotVal, 0.0);
					float halfW = max(0.5 * dotVal + 0.5, 0.0);
					float diffuseW = mix(fullW, halfW, wrapRGB);
				#else
					float diffuseW = max(dotVal, 0.0);
				#endif
				dirDiffuse += diffuse * directionalLightColor[i] * diffuseW;
				vec3 halfVec = normalize(dVector + viewDir);
				float specW = specularStrength * max(pow(max(dot(normal, halfVec), 0.0), shininess), 0.0);
				float normFactor = (shininess + 2.0) / 8.0;
				vec3 schlick = specular + (vec3(1.0)-specular)*pow(max(1.0-dot(dVector, halfVec), 0.0), 5.0);
				dirSpecular += schlick * directionalLightColor[i] * specW * diffuseW * normFactor;
			}
		#endif

		// Combine lighting contributions from both light types
		vec3 totalDiffuse = vec3(0.0);
		vec3 totalSpecular = vec3(0.0);
		#if MAX_POINT_LIGHTS > 0
			totalDiffuse += pointDiffuse;
			totalSpecular += pointSpecular;
		#endif
		#if MAX_DIR_LIGHTS > 0
			totalDiffuse += dirDiffuse;
			totalSpecular += dirSpecular;
		#endif
		fragColor.xyz = fragColor.xyz * (emissive + totalDiffuse + ambientLightColor * ambient) + totalSpecular;
	#endif

	// Handle weighted splats or default opacity and color
	#if defined(weighted_splats)
		float wx = 2.0 * length(pc);
		float w = exp(-wx * wx * 0.5);
		fragColor.rgb *= w;
		fragColor.a = w;
	#else
		#if defined(color_type_point_index)
			fragColor = vec4(color, pcIndex / 255.0);
		#else
			fragColor = vec4(color, vOpacity);
		#endif
	#endif

	// Compute depth from view position
	vec4 pos = vec4(vViewPosition, 1.0);
	#if defined(paraboloid_point_shape)
		if(!useOrthographicCamera){
			// Adjust depth based on point shape
			pos.z += -dot(pc, pc) * vRadius;
		}
	#endif

	float linearDepth = -pos.z;
	vec4 clipPos = projectionMatrix * pos;
	clipPos /= clipPos.w;
	#if defined(use_log_depth)
		// Logarithmic depth
		gl_FragDepth = log2(linearDepth + 1.0) * log(2.0) / log(far + 1.0);
	#else
		// Standard depth computation
		gl_FragDepth = (clipPos.z + 1.0) / 2.0;
	#endif

	#if defined(color_type_depth)
		// Render depth information into color channels
		fragColor.r = linearDepth;
		fragColor.g = clipPos.z;
	#endif

	#if defined(use_edl)
		// For EDL, pass the log depth
		fragColor.a = vLogDepth;
	#endif

	#if defined(highlight_point)
		// Override color for highlighted points
		if(vHighlight > 0.0) {
			fragColor = highlightedPointColor;
		}
	#endif
}
