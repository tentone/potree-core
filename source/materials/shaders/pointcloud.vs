precision highp float;
precision highp int;

#define max_clip_boxes 30  // Maximum number of clipping boxes

// Input Attributes
in vec3 position;
in vec3 normal;
in float intensity;
in float classification;
in float returnNumber;
in float numberOfReturns;
in float pointSourceID;
in vec4 indices;


// Uniforms
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat3 normalMatrix;

uniform float pcIndex;

uniform float screenWidth;
uniform float screenHeight;
uniform float fov;
uniform float spacing;
uniform float viewScale;

uniform bool useOrthographicCamera;
uniform float orthoWidth;
uniform float orthoHeight;

#if defined use_clip_box
	uniform mat4 clipBoxes[max_clip_boxes]; // Clipping box transforms
#endif

uniform float heightMin;
uniform float heightMax;
uniform float size; // Base pixel size
uniform float minSize; // Minimum point size
uniform float maxSize; // Maximum point size
uniform float octreeSize;
uniform vec3 bbSize;
uniform vec3 uColor;
uniform float opacity;
uniform float clipBoxCount;
uniform float level;
uniform float vnStart;
uniform bool isLeafNode;

uniform float filterByNormalThreshold;
uniform vec2 intensityRange;
uniform float opacityAttenuation;
uniform float intensityGamma;
uniform float intensityContrast;
uniform float intensityBrightness;
uniform float rgbGamma;
uniform float rgbContrast;
uniform float rgbBrightness;
uniform float transition;
uniform float wRGB;
uniform float wIntensity;
uniform float wElevation;
uniform float wClassification;
uniform float wReturnNumber;
uniform float wSourceID;

uniform sampler2D visibleNodes;
uniform sampler2D gradient;
uniform sampler2D classificationLUT;
uniform sampler2D depthMap;

#ifdef highlight_point
	uniform vec3 highlightedPointCoordinate;
	uniform bool enablePointHighlighting;
	uniform float highlightedPointScale;
#endif

#ifdef new_format
	in vec4 rgba;
	out vec4 vColor;
#else
	in vec3 color;
	out vec3 vColor;
#endif

#if !defined(color_type_point_index)
	out float vOpacity;
#endif

#if defined(weighted_splats)
	out float vLinearDepth;
#endif

#ifdef use_edl
	out float vLogDepth;
#endif

out vec3 vViewPosition;

#if defined(weighted_splats) || defined(paraboloid_point_shape)
	out float vRadius;
#endif

#if defined(color_type_phong) && (MAX_POINT_LIGHTS > 0 || MAX_DIR_LIGHTS > 0)
	out vec3 vNormal;
#endif

#ifdef highlight_point
	out float vHighlight;
#endif


// OCTREE LOD FUNCTIONS
#if (defined(adaptive_point_size) || defined(color_type_lod)) && defined(tree_type_octree)

// Returns count of bits set up to a given index
int numberOfOnes(int number, int index) {
	int numOnes = 0;
	int tmp = 128;
	for (int i = 7; i >= 0; i--) {
		if (number >= tmp) {
			number -= tmp;
			if (i <= index) { numOnes++; }
		}
		tmp /= 2;
	}
	return numOnes;
}

// Checks if bit at specific index is set
bool isBitSet(int number, int index){
	int powi = (index == 0) ? 1 :
			   (index == 1) ? 2 :
			   (index == 2) ? 4 :
			   (index == 3) ? 8 :
			   (index == 4) ? 16 :
			   (index == 5) ? 32 :
			   (index == 6) ? 64 : 128;
	return mod(float(number / powi), 2.0) != 0.0;
}

// Computes level-of-detail based on octree visibility
float getLOD() {
	vec3 offset = vec3(0.0);
	int iOffset = int(vnStart);
	float depth = level;

	for (float i = 0.0; i <= 30.0; i++) {
		float nodeSizeAtLevel = octreeSize / pow(2.0, i + level);
		vec3 index3d = floor((position - offset) / nodeSizeAtLevel + 0.5);
		int index = int(round(4.0 * index3d.x + 2.0 * index3d.y + index3d.z));
		
		vec4 value = texture(visibleNodes, vec2(float(iOffset) / 2048.0, 0.0));
		int mask = int(round(value.r * 255.0));

		if (isBitSet(mask, index)) {
			int advanceG = int(round(value.g * 255.0)) * 256;
			int advanceB = int(round(value.b * 255.0));
			int advanceChild = numberOfOnes(mask, index - 1);
			int advance = advanceG + advanceB + advanceChild;
			iOffset += advance;
			depth++;
		} else {
			return value.a * 255.0;
		}
		offset += (vec3(1.0) * nodeSizeAtLevel * 0.5) * index3d;
	}
	return depth;
}

float getPointSizeAttenuation() {
	return 0.5 * pow(2.0, getLOD());
}

#endif


// KD-TREE LOD FUNCTIONS

#if (defined(adaptive_point_size) || defined(color_type_lod)) && defined(tree_type_kdtree)

float getLOD() {
	vec3 offset = vec3(0.0);
	float intOffset = 0.0;
	float depth = 0.0;
	vec3 size_ = bbSize;
	vec3 pos = position;
		
	for (float i = 0.0; i <= 1000.0; i++) {
		vec4 value = texture(visibleNodes, vec2(intOffset / 2048.0, 0.0));
		int children = int(value.r * 255.0);
		float next = value.g * 255.0;
		int split = int(value.b * 255.0);
		
		if (next == 0.0) { return depth; }
		
		vec3 splitv = (split == 1) ? vec3(1.0, 0.0, 0.0) :
					 (split == 2) ? vec3(0.0, 1.0, 0.0) :
					 (split == 4) ? vec3(0.0, 0.0, 1.0) : vec3(0.0);
		
		intOffset += next;
		
		float factor = length((pos * splitv) / size_);
		if (factor < 0.5) {
			if (children == 0 || children == 2) { return depth; }
		} else {
			pos -= size_ * splitv * 0.5;
			if (children == 0 || children == 1) { return depth; }
			if (children == 3) { intOffset += 1.0; }
		}
		size_ *= ((1.0 - (splitv + 1.0) / 2.0) + 0.5);
		depth++;
	}
	return depth;	
}

float getPointSizeAttenuation() {
	return 0.5 * pow(1.3, getLOD());
}

#endif


// COLOR/BRIGHTNESS FUNCTIONS

float getContrastFactor(float contrast) {
	return 1.0158730158730156 * (contrast + 1.0) / (1.0158730158730156 - contrast);
}

#ifndef new_format
// Adjusts RGB values with gamma, contrast and brightness factors
vec3 getRGB() {
	#if defined(use_rgb_gamma_contrast_brightness)
		vec3 rgb = pow(color, vec3(rgbGamma));
		rgb += rgbBrightness;
		rgb = (rgb - 0.5) * getContrastFactor(rgbContrast) + 0.5;
		return clamp(rgb, 0.0, 1.0);
	#else
		return color;
	#endif
}
#endif

// Adjusts intensity value based on settings
float getIntensity() {
	float w = (intensity - intensityRange.x) / (intensityRange.y - intensityRange.x);
	w = pow(w, intensityGamma) + intensityBrightness;
	w = (w - 0.5) * getContrastFactor(intensityContrast) + 0.5;
	return clamp(w, 0.0, 1.0);
}

// Maps elevation to a gradient color
vec3 getElevation() {
	vec4 world = modelMatrix * vec4(position, 1.0);
	float w = (world.z - heightMin) / (heightMax - heightMin);
	return texture(gradient, vec2(w, 1.0 - w)).rgb;
}

// Gets classification color and transparency from texture LUT
vec4 getClassification() {
	vec2 uv = vec2(classification / 255.0, 0.5);
	return texture(classificationLUT, uv);
}

// Returns color based on number of returns and return number
vec3 getReturnNumber() {
	return (numberOfReturns == 1.0) ? vec3(1.0, 1.0, 0.0) :
		   (returnNumber == 1.0)    ? vec3(1.0, 0.0, 0.0) :
		   (returnNumber == numberOfReturns) ? vec3(0.0, 0.0, 1.0) :
										vec3(0.0, 1.0, 0.0);
}

// Gets source ID color from gradient
vec3 getSourceID() {
	float w = mod(pointSourceID, 10.0) / 10.0;
	return texture(gradient, vec2(w, 1.0 - w)).rgb;
}

#ifndef new_format
// Combines multiple color sources into one composite color
vec3 getCompositeColor() {
	vec3 c = wRGB * getRGB();
	float w = wRGB;
	c += wIntensity * getIntensity() * vec3(1.0);
	w += wIntensity;
	c += wElevation * getElevation();
	w += wElevation;
	c += wReturnNumber * getReturnNumber();
	w += wReturnNumber;
	c += wSourceID * getSourceID();
	w += wSourceID;

	vec4 cl = wClassification * getClassification();
	c += cl.a * cl.rgb;
	w += wClassification * cl.a;

	c /= w;
	if (w == 0.0) {
		gl_Position = vec4(100.0, 100.0, 100.0, 0.0);
	}
	return c;
}
#endif

#ifdef new_format
// sRGB conversion functions
vec4 fromLinear(vec4 linearRGB) {
	bvec4 cutoff = lessThan(linearRGB, vec4(0.0031308));
	return mix(linearRGB * vec4(12.92), vec4(1.055) * pow(linearRGB, vec4(1.0/2.4)) - vec4(0.055), cutoff);
} 
vec4 toLinear(vec4 sRGB) {
	bvec4 cutoff = lessThan(sRGB, vec4(0.04045));
	return mix(sRGB/vec4(12.92), pow((sRGB + vec4(0.055))/vec4(1.055), vec4(2.4)), cutoff);
}
#else
vec3 fromLinear(vec3 linearRGB) {
	bvec3 cutoff = lessThan(linearRGB, vec3(0.0031308));
	return mix(linearRGB * vec3(12.92), vec3(1.055) * pow(linearRGB, vec3(1.0/2.4)) - vec3(0.055), cutoff);
}
vec3 toLinear(vec3 sRGB) {
	bvec3 cutoff = lessThan(sRGB, vec3(0.04045));
	return mix(sRGB/vec3(12.92), pow((sRGB + vec3(0.055))/vec3(1.055), vec3(2.4)), cutoff);
}
#endif

void main() {
	// Compute model-view position and projected position
	vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
	gl_Position = projectionMatrix * mvPosition;
	vViewPosition = mvPosition.xyz;

	#if defined weighted_splats
		vLinearDepth = gl_Position.w;
	#endif

	#if defined(color_type_phong) && (MAX_POINT_LIGHTS > 0 || MAX_DIR_LIGHTS > 0)
		vNormal = normalize(normalMatrix * normal);
	#endif

	#ifdef use_edl
		vLogDepth = log2(-mvPosition.z);
	#endif


	// POINT SIZE COMPUTATION
	float tanHalfFOV = tan(fov * 0.5);
	float projFactor = -0.5 * screenHeight / (tanHalfFOV * mvPosition.z);
	// Scale compensation based on transformation difference 
	float scale = length(modelViewMatrix * vec4(0, 0, 0, 1) - modelViewMatrix * vec4(spacing, 0, 0, 1)) / spacing;
	projFactor *= scale;
	
	float pointSize = 1.0;
	#if defined fixed_point_size
		pointSize = size;
	#elif defined attenuated_point_size
		pointSize = useOrthographicCamera ? size : size * spacing * projFactor;
	#elif defined adaptive_point_size
		float worldSpaceSize = 2.0 * size * spacing / getPointSizeAttenuation();
		pointSize = useOrthographicCamera ? (worldSpaceSize / orthoWidth) * screenWidth : worldSpaceSize * projFactor;
	#endif

	pointSize = clamp(pointSize, minSize, maxSize);
	#if defined(weighted_splats) || defined(paraboloid_point_shape)
		vRadius = pointSize / projFactor;
	#endif
	
	pointSize *= viewScale;
	gl_PointSize = pointSize;


	// HIGHLIGHTING
	#ifdef highlight_point
		vec4 mPosition = modelMatrix * vec4(position, 1.0);
		if (enablePointHighlighting &&
			abs(mPosition.x - highlightedPointCoordinate.x) < 0.0001 &&
			abs(mPosition.y - highlightedPointCoordinate.y) < 0.0001 &&
			abs(mPosition.z - highlightedPointCoordinate.z) < 0.0001) {
			vHighlight = 1.0;
			gl_PointSize = pointSize * highlightedPointScale;
		} else {
			vHighlight = 0.0;
		}
	#endif


	// OPACITY
	#ifndef color_type_point_index
		#ifdef attenuated_opacity
			vOpacity = opacity * exp(-length(-mvPosition.xyz) / opacityAttenuation);
		#else
			vOpacity = opacity;
		#endif
	#endif


	// NORMAL FILTERING
	#ifdef use_filter_by_normal
		if(abs((modelViewMatrix * vec4(normal, 0.0)).z) > filterByNormalThreshold) {
			gl_Position = vec4(0.0, 0.0, 2.0, 1.0); // Cull point
		}
	#endif


	// POINT COLOR SELECTION
	#ifdef new_format
		vColor = rgba;
	#elif defined color_type_rgb
		vColor = getRGB();
	#elif defined color_type_height
		vColor = getElevation();
	#elif defined color_type_rgb_height
		vec3 cHeight = getElevation();
		vColor = mix(getRGB(), cHeight, transition);
	#elif defined color_type_depth
		float linearDepth = -mvPosition.z;
		float expDepth = (gl_Position.z / gl_Position.w) * 0.5 + 0.5;
		vColor = vec3(linearDepth, expDepth, 0.0);
	#elif defined color_type_intensity
		float w = getIntensity();
		vColor = vec3(w);
	#elif defined color_type_intensity_gradient
		float w = getIntensity();
		vColor = texture(gradient, vec2(w, 1.0 - w)).rgb;
	#elif defined color_type_color
		vColor = uColor;
	#elif defined color_type_lod
		float w = getLOD() / 10.0;
		vColor = texture(gradient, vec2(w, 1.0 - w)).rgb;
	#elif defined color_type_point_index
		vColor = indices.rgb;
	#elif defined color_type_classification
		vec4 cl = getClassification();
		vColor = cl.rgb;
	#elif defined color_type_return_number
		vColor = getReturnNumber();
	#elif defined color_type_source
		vColor = getSourceID();
	#elif defined color_type_normal
		vColor = (modelMatrix * vec4(normal, 0.0)).xyz;
	#elif defined color_type_phong
		vColor = color;
	#elif defined color_type_composite
		vColor = getCompositeColor();
	#endif
	
	#if !defined color_type_composite && defined color_type_classification
		if (getClassification().a == 0.0) {
			gl_Position = vec4(100.0, 100.0, 100.0, 0.0); // Cull point if classification alpha is zero
			return;
		}
	#endif


	// CLIPPING
	#if defined use_clip_box
		bool insideAny = false;
		for (int i = 0; i < max_clip_boxes; i++) {
			if (i == int(clipBoxCount)) break;
			vec4 clipPosition = clipBoxes[i] * modelMatrix * vec4(position, 1.0);
			bool inside = abs(clipPosition.x) <= 0.5 && abs(clipPosition.y) <= 0.5 && abs(clipPosition.z) <= 0.5;
			insideAny = insideAny || inside;
		}

		#if defined clip_outside
			if (!insideAny) { gl_Position = vec4(1000.0); } // Cull if outside any clip box
		#elif defined clip_inside
			if (insideAny) { gl_Position = vec4(1000.0); } // Cull if inside any clip box
		#elif defined clip_highlight_inside && !defined(color_type_depth)
			if (!insideAny) { /* additional processing if needed */ }
		#endif

		#if defined clip_highlight_inside
			if (insideAny) { vColor.r += 0.5; }
		#endif
	#endif


	// COLOR ENCODING ADJUSTMENTS
	#if defined(output_color_encoding_sRGB) && defined(input_color_encoding_linear) && !defined(color_type_point_index)
		vColor = toLinear(vColor);
	#endif

	#if defined(output_color_encoding_linear) && defined(input_color_encoding_sRGB) && !defined(color_type_point_index)
		vColor = fromLinear(vColor);
	#endif
}
