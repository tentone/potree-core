import {ShaderChunk} from 'three';

const Shaders = {};

// pointcloud.vs
Shaders.vertex = `
precision highp float;
precision highp int;

` + ShaderChunk.common + `
` + ShaderChunk.logdepthbuf_pars_vertex + `

// attribute vec3 position;
attribute vec3 color;
attribute float intensity;
attribute float classification;
attribute float returnNumber;
attribute float numberOfReturns;
attribute float pointSourceID;
attribute vec4 indices;
attribute float spacing;

// uniform mat4 modelMatrix;
// uniform mat4 modelViewMatrix;
// uniform mat4 projectionMatrix;
// uniform mat4 viewMatrix;
uniform mat4 uViewInv;

uniform float uScreenWidth;
uniform float uScreenHeight;

uniform float fov;
uniform float near;
uniform float far;

uniform bool uDebug;

uniform float size;
uniform float minSize;
uniform float maxSize;

uniform float uPCIndex;
uniform float uOctreeSpacing;
uniform float uNodeSpacing;
uniform float uOctreeSize;
uniform vec3 uBBSize;
uniform float uLevel;
uniform float uVNStart;
uniform bool uIsLeafNode;

uniform vec3 uColor;
uniform float uOpacity;

uniform vec2 elevationRange;
uniform vec2 intensityRange;
uniform float intensityGamma;
uniform float intensityContrast;
uniform float intensityBrightness;
uniform float rgbGamma;
// uniform float rgbContrast;
uniform float rgbBrightness;
uniform float uTransition;
uniform float wRGB;
uniform float wIntensity;
uniform float wElevation;
uniform float wClassification;
uniform float wReturnNumber;
uniform float wSourceID;

uniform sampler2D visibleNodes;
uniform sampler2D gradient;
uniform sampler2D classificationLUT;

#if defined(num_clipplanes) && num_clipplanes > 0 

uniform vec4 clipPlanes[num_clipplanes];

bool isClipped(vec3 point) {
	bool clipped = false;
	for (int i = 0; i < num_clipplanes; ++i) {
		vec4 p = clipPlanes[i];
		clipped = clipped || dot(-point, p.xyz) > p.w;
	}
	return clipped;
}

#else

bool isClipped(vec3 point) {
	return false;
}

#endif

varying vec4 vColor;
varying float vLogDepth;
varying vec3 vViewPosition;
varying float vRadius;
varying float vPointSize;

// The round() function is not available in WebGL 1.0
float myRound(float number)
{
	return floor(number + 0.5);
}

#if (defined(adaptive_point_size) || defined(color_type_lod)) && defined(tree_type_octree)
	/**
	 * number of 1-bits up to inclusive index position
	 * number is treated as if it were an integer in the range 0-255
	 */
	int numberOfOnes(int number, int index)
	{
		int numOnes = 0;
		int tmp = 128;

		for(int i = 7; i >= 0; i--)
		{
			if(number >= tmp)
			{
				number = number - tmp;

				if(i <= index)
				{
					numOnes++;
				}
			}
			
			tmp = tmp / 2;
		}

		return numOnes;
	}

	/**
	 * checks whether the bit at index is 1
	 * number is treated as if it were an integer in the range 0-255
	 */
	bool isBitSet(int number, int index)
	{
		//weird multi else if due to lack of proper array, int and bitwise support in WebGL 1.0
		int powi = 1;

		if(index == 0)
		{
			powi = 1;
		}
		else if(index == 1)
		{
			powi = 2;
		}
		else if(index == 2)
		{
			powi = 4;
		}
		else if(index == 3)
		{
			powi = 8;
		}
		else if(index == 4)
		{
			powi = 16;
		}
		else if(index == 5)
		{
			powi = 32;
		}
		else if(index == 6)
		{
			powi = 64;
		}
		else if(index == 7)
		{
			powi = 128;
		}
		else
		{
			return false;
		}

		int ndp = number / powi;

		return mod(float(ndp), 2.0) != 0.0;
	}

	/**
	 * find the LOD at the point position
	 */
	float getLOD()
	{
		vec3 offset = vec3(0.0, 0.0, 0.0);
		int iOffset = int(uVNStart);
		float depth = uLevel;

		for(float i = 0.0; i <= 30.0; i++)
		{
			float nodeSizeAtLevel = uOctreeSize / pow(2.0, i + uLevel + 0.0);
			
			vec3 index3d = (position-offset) / nodeSizeAtLevel;
			index3d = floor(index3d + 0.5);
			int index = int(myRound(4.0 * index3d.x + 2.0 * index3d.y + index3d.z));

			vec4 value = texture2D(visibleNodes, vec2(float(iOffset) / 2048.0, 0.0));
			int mask = int(myRound(value.r * 255.0));

			if(isBitSet(mask, index))
			{
				//there are more visible child nodes at this position
				int advanceG = int(myRound(value.g * 255.0)) * 256;
				int advanceB = int(myRound(value.b * 255.0));
				int advanceChild = numberOfOnes(mask, index - 1);
				int advance = advanceG + advanceB + advanceChild;

				iOffset = iOffset + advance;
				
				depth++;
			}
			else
			{
				//no more visible child nodes at this position
				return value.a * 255.0;
				//return depth;
			}
			
			offset = offset + (vec3(1.0, 1.0, 1.0) * nodeSizeAtLevel * 0.5) * index3d;
		}
			
		return depth;
	}

	float getSpacing()
	{
		vec3 offset = vec3(0.0, 0.0, 0.0);
		int iOffset = int(uVNStart);
		float depth = uLevel;
		float spacing = uNodeSpacing;

		for(float i = 0.0; i <= 30.0; i++)
		{
			float nodeSizeAtLevel = uOctreeSize / pow(2.0, i + uLevel + 0.0);
			
			vec3 index3d = (position-offset) / nodeSizeAtLevel;
			index3d = floor(index3d + 0.5);
			int index = int(myRound(4.0 * index3d.x + 2.0 * index3d.y + index3d.z));

			vec4 value = texture2D(visibleNodes, vec2(float(iOffset) / 2048.0, 0.0));
			int mask = int(myRound(value.r * 255.0));
			float spacingFactor = value.a;

			if(i > 0.0)
			{
				spacing = spacing / (255.0 * spacingFactor);
			}
			
			if(isBitSet(mask, index))
			{
				//there are more visible child nodes at this position
				int advanceG = int(myRound(value.g * 255.0)) * 256;
				int advanceB = int(myRound(value.b * 255.0));
				int advanceChild = numberOfOnes(mask, index - 1);
				int advance = advanceG + advanceB + advanceChild;

				iOffset = iOffset + advance;

				depth++;
			}
			else
			{
				//no more visible child nodes at this position
				return spacing;
			}
			
			offset = offset + (vec3(1.0, 1.0, 1.0) * nodeSizeAtLevel * 0.5) * index3d;
		}
			
		return spacing;
	}

	float getPointSizeAttenuation()
	{
		return pow(2.0, getLOD());
	}
#endif


#if (defined(adaptive_point_size) || defined(color_type_lod)) && defined(tree_type_kdtree)
	float getLOD()
	{
		vec3 offset = vec3(0.0, 0.0, 0.0);
		float iOffset = 0.0;
		float depth = 0.0;
			
		vec3 size = uBBSize;	
		vec3 pos = position;
			
		for(float i = 0.0; i <= 1000.0; i++)
		{
			vec4 value = texture2D(visibleNodes, vec2(iOffset / 2048.0, 0.0));
			
			int children = int(value.r * 255.0);
			float next = value.g * 255.0;
			int split = int(value.b * 255.0);
			
			if(next == 0.0)
			{
			 	return depth;
			}
			
			vec3 splitv = vec3(0.0, 0.0, 0.0);
			if(split == 1)
			{
				splitv.x = 1.0;
			}
			else if(split == 2)
			{
			 	splitv.y = 1.0;
			}
			else if(split == 4)
			{
			 	splitv.z = 1.0;
			}
			
			iOffset = iOffset + next;
			
			float factor = length(pos * splitv / size);

			//Left
			if(factor < 0.5)
			{
				if(children == 0 || children == 2)
				{
					return depth;
				}
			}
			//Right
			else
			{
				pos = pos - size * splitv * 0.5;
				if(children == 0 || children == 1)
				{
					return depth;
				}
				if(children == 3)
				{
					iOffset = iOffset + 1.0;
				}
			}

			size = size * ((1.0 - (splitv + 1.0) / 2.0) + 0.5);
			depth++;
		}
			
		return depth;	
	}

	float getPointSizeAttenuation()
	{
		return 0.5 * pow(1.3, getLOD());
	}
#endif

//formula adapted from: http://www.dfstudios.co.uk/articles/programming/image-programming-algorithms/image-processing-algorithms-part-5-contrast-adjustment/
float getContrastFactor(float contrast)
{
	return (1.0158730158730156 * (contrast + 1.0)) / (1.0158730158730156 - contrast);
}

vec3 getRGB()
{
	vec3 rgb = color;
	
	rgb = pow(rgb, vec3(rgbGamma));
	rgb = rgb + rgbBrightness;
	rgb = clamp(rgb, 0.0, 1.0);
	
	return rgb;
}

float getIntensity()
{
	float w = (intensity - intensityRange.x) / (intensityRange.y - intensityRange.x);
	w = pow(w, intensityGamma);
	w = w + intensityBrightness;
	w = (w - 0.5) * getContrastFactor(intensityContrast) + 0.5;
	w = clamp(w, 0.0, 1.0);

	return w;
}

vec3 getElevation()
{
	vec4 world = modelMatrix * vec4( position, 1.0 );
	float w = (world.z - elevationRange.x) / (elevationRange.y - elevationRange.x);
	return texture2D(gradient, vec2(w,1.0-w)).rgb;
}

vec4 getClassification()
{
	vec2 uv = vec2(classification / 255.0, 0.5);
	return texture2D(classificationLUT, uv);
}

vec3 getReturnNumber()
{
	if(numberOfReturns == 1.0)
	{
		return vec3(1.0, 1.0, 0.0);
	}
	else
	{
		if(returnNumber == 1.0)
		{
			return vec3(1.0, 0.0, 0.0);
		}
		else if(returnNumber == numberOfReturns)
		{
			return vec3(0.0, 0.0, 1.0);
		}
		else
		{
			return vec3(0.0, 1.0, 0.0);
		}
	}
}

vec3 getSourceID()
{
	float w = mod(pointSourceID, 10.0) / 10.0;
	return texture2D(gradient, vec2(w,1.0 - w)).rgb;
}

vec3 getCompositeColor()
{
	vec3 c;
	float w;

	c += wRGB * getRGB();
	w += wRGB;
	
	c += wIntensity * getIntensity() * vec3(1.0, 1.0, 1.0);
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

	c = c / w;
	
	if(w == 0.0)
	{
		gl_Position = vec4(100.0, 100.0, 100.0, 0.0);
	}
	
	return c;
}

vec4 getColor()
{
	vec3 color;
       float alpha = 1.0;

	#ifdef color_type_rgb
		color = getRGB();
	#elif defined color_type_height
		color = getElevation();
	#elif defined color_type_rgb_height
		vec3 cHeight = getElevation();
		color = (1.0 - uTransition) * getRGB() + uTransition * cHeight;
	#elif defined color_type_depth
		float linearDepth = gl_Position.w;
		float expDepth = (gl_Position.z / gl_Position.w) * 0.5 + 0.5;
		color = vec3(linearDepth, expDepth, 0.0);
	#elif defined color_type_intensity
		float w = getIntensity();
		color = vec3(w, w, w);
	#elif defined color_type_intensity_gradient
		float w = getIntensity();
		color = texture2D(gradient, vec2(w,1.0-w)).rgb;
	#elif defined color_type_color
		color = uColor;
	#elif defined color_type_lod
		float depth = getLOD();
		float w = depth / 10.0;
		color = texture2D(gradient, vec2(w,1.0-w)).rgb;
	#elif defined color_type_point_index
		color = indices.rgb;
	#elif defined color_type_classification
		vec4 cl = getClassification();
		color = cl.rgb;
               alpha = cl.a;
	#elif defined color_type_return_number
		color = getReturnNumber();
	#elif defined color_type_source
		color = getSourceID();
	#elif defined color_type_normal
		color = (modelMatrix * vec4(normal, 0.0)).xyz;
	#elif defined color_type_phong
		color = color;
	#elif defined color_type_composite
		color = getCompositeColor();
	#endif

	return vec4(color, alpha);
}

float getPointSize()
{
	float pointSize = 1.0;
	
	float slope = tan(fov / 2.0);
	float projFactor = -0.5 * uScreenHeight / (slope * vViewPosition.z);
	
	float r = uOctreeSpacing * 1.7;
	vRadius = r;

	#if defined fixed_point_size
		pointSize = size;
	#elif defined attenuated_point_size
		pointSize = size * spacing * projFactor;
	#elif defined adaptive_point_size
		if(uIsLeafNode && false)
		{
			pointSize = size * spacing * projFactor;
		}
		else
		{
			float worldSpaceSize = 1.0 * size * r / getPointSizeAttenuation();
			pointSize = worldSpaceSize * projFactor;
		}
	#endif

	pointSize = max(minSize, pointSize);
	pointSize = min(maxSize, pointSize);
	
	vRadius = pointSize / projFactor;

	return pointSize;
}

void main()
{
	vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
	vViewPosition = mvPosition.xyz;
	gl_Position = projectionMatrix * mvPosition;

	vLogDepth = log2(-mvPosition.z);

	//POINT SIZE
	float pointSize = getPointSize();
	gl_PointSize = pointSize;
	vPointSize = pointSize;
	` + ShaderChunk.logdepthbuf_vertex + `

	//COLOR
	vColor = getColor();

	#if defined hq_depth_pass
		float originalDepth = gl_Position.w;
		float adjustedDepth = originalDepth + 2.0 * vRadius;
		float adjust = adjustedDepth / originalDepth;

		mvPosition.xyz = mvPosition.xyz * adjust;
		gl_Position = projectionMatrix * mvPosition;
	#endif

	// CLIPPING
	vec4 clipPosition = modelMatrix * vec4( position, 1.0 );
	if (isClipped(clipPosition.xyz)) {
		gl_Position = vec4(100.0, 100.0, 100.0, 1.0); // Outside clip volume
	} 
}`;

// "pointcloud.fs"
Shaders.fragment = `

#if defined USE_LOGDEPTHBUF_EXT || defined paraboloid_point_shape
	#extension GL_EXT_frag_depth : enable
#endif

precision highp float;
precision highp int;

` + ShaderChunk.common + `
` + ShaderChunk.logdepthbuf_pars_fragment + `

// uniform mat4 viewMatrix;
uniform mat4 uViewInv;
// uniform mat4 uProjInv;
// uniform vec3 cameraPosition;

uniform mat4 projectionMatrix;
uniform float uOpacity;

uniform float fov;
uniform float uSpacing;
uniform float near;
uniform float far;
uniform float uPCIndex;
uniform float uScreenWidth;
uniform float uScreenHeight;

varying vec4 vColor;
varying float vLogDepth;
varying vec3 vViewPosition;
varying float vRadius;
varying float vPointSize;
varying vec3 vPosition;

void main()
{
	vec3 color = vColor.rgb;
	float depth = gl_FragCoord.z;

	#if defined circle_point_shape || defined paraboloid_point_shape
		float u = (2.0 * gl_PointCoord.x) - 1.0;
		float v = (2.0 * gl_PointCoord.y) - 1.0;
	#endif
	
	#if defined circle_point_shape
		float cc = (u*u) + (v*v);
		if(cc > 1.0)
		{
			discard;
		}
	#endif

	#if defined color_type_point_index
		gl_FragColor = vec4(color, uPCIndex / 255.0);
	#else
               if (vColor.a == 0.0) {
                      discard;
               }
		gl_FragColor = vec4(color, uOpacity);
	#endif

	#if defined paraboloid_point_shape
		float wi = -( u*u + v*v);
		vec4 pos = vec4(vViewPosition, 1.0);
		pos.z += wi * vRadius;
		float linearDepth = -pos.z;
		pos = projectionMatrix * pos;
		pos = pos / pos.w;
		float expDepth = pos.z;
		depth = (pos.z + 1.0) / 2.0;

		gl_FragDepthEXT = depth;
		
		#if defined color_type_depth
			color.r = linearDepth;
			color.g = expDepth;
		#endif
	#endif
	
	` + ShaderChunk.logdepthbuf_fragment + `

	#if defined weighted_splats
		float distance = 2.0 * length(gl_PointCoord.xy - 0.5);
		float weight = max(0.0, 1.0 - distance);
		weight = pow(weight, 1.5);

		gl_FragColor.a = weight;
		gl_FragColor.xyz = gl_FragColor.xyz * weight;
	#endif
}`;

export {Shaders};
