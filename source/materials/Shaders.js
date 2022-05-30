import {ShaderChunk} from 'three';
import PointCloudMaterialVS from './PointCloudMaterial.vs.glsl';

export const Shaders = {
	vertex: `
precision highp float;
precision highp int;

` + ShaderChunk.common + `
` + ShaderChunk.logdepthbuf_pars_vertex + `
` + PointCloudMaterialVS + `

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
}`,

	fragment: `

// #if defined USE_LOGDEPTHBUF_EXT || defined paraboloid_point_shape
// 	#extension GL_EXT_frag_depth : enable
// #endif

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
}`
};
