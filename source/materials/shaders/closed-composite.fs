precision highp float;
precision highp int;

uniform sampler2D colorMap;
uniform sampler2D normalDepthMap;
uniform sampler2D closedMask;
uniform sampler2D sourceNormalDepth;
uniform int radius;
uniform float depthThreshold;
uniform mat4 uProj;
uniform mat4 inverseProjection;
uniform mat4 cameraWorld;
uniform float far;
uniform bool orthographic;
uniform bool logDepth;
uniform bool reversedDepth;
uniform bool showNormals;
uniform bool edlEnabled;
uniform float edlStrength;
uniform float edlRadius;
uniform float edlOpacity;
uniform int neighbourCount;

uniform int clipMode;
uniform float clipBoxCount;
uniform mat4 clipBoxes[30];
uniform float clipBoxModes[30];
uniform float clipSphereCount;
uniform vec4 clipSpheres[30];
uniform float clipSphereModes[30];
uniform float clipPlaneCount;
uniform vec4 clipPlanes[30];

in vec2 vUv;
out vec4 fragColor;

vec4 surfaceAt(ivec2 p)
{
	ivec2 extent = textureSize(normalDepthMap, 0);
	if (any(lessThan(p, ivec2(0))) || any(greaterThanEqual(p, extent))) return vec4(0.0);
	return texelFetch(normalDepthMap, p, 0);
}

bool occupied(ivec2 p)
{
	ivec2 extent = textureSize(closedMask, 0);
	if (any(lessThan(p, ivec2(0))) || any(greaterThanEqual(p, extent))) return false;
	return texelFetch(closedMask, p, 0).r > 0.5;
}

vec3 viewPosition(ivec2 p, float depth)
{
	vec2 extent = vec2(textureSize(normalDepthMap, 0) - 2 * radius);
	vec2 ndc = (vec2(p - radius) + 0.5) / extent * 2.0 - 1.0;
	vec4 projected = uProj * vec4(0.0, 0.0, -depth, 1.0);
	vec4 view = inverseProjection * vec4(ndc, projected.z / projected.w, 1.0);
	return view.xyz / view.w;
}

vec3 tangentAt(ivec2 p, ivec2 axis, vec3 center, float depth)
{
	vec4 a = surfaceAt(p - axis);
	vec4 b = surfaceAt(p + axis);
	float tolerance = max(1e-6, depth * depthThreshold);
	bool hasA = a.a > 0.0 && abs(a.a - depth) <= tolerance;
	bool hasB = b.a > 0.0 && abs(b.a - depth) <= tolerance;
	if (hasA && hasB) return viewPosition(p + axis, b.a) - viewPosition(p - axis, a.a);
	if (hasB) return viewPosition(p + axis, b.a) - center;
	if (hasA) return center - viewPosition(p - axis, a.a);
	return vec3(0.0);
}

bool clipped(vec3 view)
{
	if (clipMode == CLIP_DISABLED) return false;
	vec4 world = cameraWorld * vec4(view, 1.0);
	bool insidePlanes = true;
	for (int i = 0; i < int(clipPlaneCount); i++)
	{
		insidePlanes = insidePlanes && dot(clipPlanes[i].xyz, world.xyz) + clipPlanes[i].w >= 0.0;
	}
	bool hasInclude = false;
	bool insideInclude = false;
	bool insideExclude = false;
	for (int i = 0; i < int(clipBoxCount) + int(clipSphereCount); i++)
	{
		bool inside;
		float mode;
		if (i < int(clipBoxCount))
		{
			vec3 local = (clipBoxes[i] * world).xyz;
			inside = all(lessThanEqual(abs(local), vec3(0.5)));
			mode = clipBoxModes[i];
		}
		else
		{
			int j = i - int(clipBoxCount);
			inside = distance(world.xyz, clipSpheres[j].xyz) <= clipSpheres[j].w;
			mode = clipSphereModes[j];
		}
		if (mode == 2.0)
		{
			if (clipMode == CLIP_HIGHLIGHT) continue;
			mode = clipMode == CLIP_INSIDE ? 1.0 : 0.0;
		}
		if (mode == 1.0) insideExclude = insideExclude || inside;
		else
		{
			hasInclude = true;
			insideInclude = insideInclude || inside;
		}
	}
	bool baseVisible = (!hasInclude || insideInclude) && !insideExclude;
	if (clipMode == CLIP_OUTSIDE) return !(baseVisible && insidePlanes);
	if (clipMode == CLIP_INSIDE) return !((clipBoxCount + clipSphereCount > 0.0 && baseVisible) || !insidePlanes);
	return !baseVisible;
}

void main()
{
	ivec2 p = ivec2(vUv * vec2(textureSize(normalDepthMap, 0) - 2 * radius)) + radius;
	if (!occupied(p)) discard;
	vec4 surface = surfaceAt(p);
	vec3 view = viewPosition(p, surface.a);
	// Original samples have already passed clipping at their exact position.
	// Recheck only synthesized pixels, whose positions are reconstructed here.
	if (texelFetch(sourceNormalDepth, p, 0).a <= 0.0 && clipped(view)) discard;
	fragColor = texelFetch(colorMap, p, 0);

	// Supplied normals were transformed with normalMatrix and interpolated in
	// dilation. Clouds without normals use the reconstructed depth surface.
	if (showNormals)
	{
		vec3 normal = surface.xyz;
		if (length(normal) < 1e-8)
		{
			normal = cross(tangentAt(p, ivec2(1, 0), view, surface.a), tangentAt(p, ivec2(0, 1), view, surface.a));
		}
		normal = length(normal) < 1e-8 ? vec3(0.0, 0.0, 1.0) : normalize(normal);
		fragColor.rgb = normal * 0.5 + 0.5;
	}

	if (edlEnabled)
	{
		float response = 0.0;
		for (int i = 0; i < neighbourCount; i++)
		{
			float angle = 6.28318530718 * float(i) / float(neighbourCount);
			ivec2 q = p + ivec2(round(edlRadius * vec2(cos(angle), sin(angle))));
			float depth = surfaceAt(q).a;
			if (depth > 0.0 && occupied(q)) response += max(0.0, log2(surface.a / depth));
		}
		fragColor.rgb *= exp(-response / float(neighbourCount) * edlStrength * 300.0);
		fragColor.a *= edlOpacity;
	}

	vec4 projected = uProj * vec4(view, 1.0);
	float ndcDepth = projected.z / projected.w;
	gl_FragDepth = reversedDepth ? ndcDepth : ndcDepth * 0.5 + 0.5;
	if (logDepth && !orthographic) gl_FragDepth = log2(surface.a + 1.0) / log2(far + 1.0);
}
