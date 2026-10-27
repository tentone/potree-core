precision highp float;
precision highp int;

uniform sampler2D colorMap;
uniform sampler2D normalDepthMap;
uniform int radius;
uniform float depthThreshold;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragNormalDepth;

vec4 sampleSurface(ivec2 p)
{
	ivec2 extent = textureSize(normalDepthMap, 0);
	if (any(lessThan(p, ivec2(0))) || any(greaterThanEqual(p, extent))) return vec4(0.0);
	return texelFetch(normalDepthMap, p, 0);
}

void main()
{
	ivec2 p = ivec2(gl_FragCoord.xy);
	fragNormalDepth = sampleSurface(p);
	fragColor = texelFetch(colorMap, p, 0);
	// Closing is extensive: original samples retain their exact attributes.
	if (fragNormalDepth.a > 0.0) return;

	float nearestDepth = 1e30;
	for (int y = -radius; y <= radius; y++)
	{
		for (int x = -radius; x <= radius; x++)
		{
			float depth = sampleSurface(p + ivec2(x, y)).a;
			if (depth > 0.0) nearestDepth = min(nearestDepth, depth);
		}
	}
	if (nearestDepth == 1e30) return;

	vec4 colorSum = vec4(0.0);
	vec4 surfaceSum = vec4(0.0);
	float weightSum = 0.0;
	for (int y = -radius; y <= radius; y++)
	{
		for (int x = -radius; x <= radius; x++)
		{
			ivec2 q = p + ivec2(x, y);
			vec4 surface = sampleSurface(q);
			// Keep the binary dilation mask independent of attribute interpolation.
			// Only the nearest depth band contributes to a newly occupied pixel.
			if (surface.a <= 0.0 || surface.a - nearestDepth > max(1e-6, nearestDepth * depthThreshold)) continue;
			float weight = 1.0 / float(x * x + y * y);
			colorSum += weight * texelFetch(colorMap, q, 0);
			surfaceSum += weight * surface;
			weightSum += weight;
		}
	}
	fragColor = colorSum / weightSum;
	fragNormalDepth = surfaceSum / weightSum;
	float normalLength = length(fragNormalDepth.xyz);
	if (normalLength > 1e-8) fragNormalDepth.xyz /= normalLength;
}
