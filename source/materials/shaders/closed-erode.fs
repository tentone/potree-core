precision highp float;
precision highp int;

uniform sampler2D normalDepthMap;
uniform int radius;
out vec4 fragColor;

void main()
{
	ivec2 p = ivec2(gl_FragCoord.xy);
	ivec2 extent = textureSize(normalDepthMap, 0);
	fragColor = vec4(0.0);
	// Binary erosion uses the same square kernel as dilation. Cache its result
	// once so EDL can sample the closed mask without repeating this neighbourhood.
	for (int y = -radius; y <= radius; y++)
	{
		for (int x = -radius; x <= radius; x++)
		{
			ivec2 q = p + ivec2(x, y);
			if (any(lessThan(q, ivec2(0))) || any(greaterThanEqual(q, extent))) return;
			if (texelFetch(normalDepthMap, q, 0).a <= 0.0) return;
		}
	}
	fragColor = vec4(1.0);
}
