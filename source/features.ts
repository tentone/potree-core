let context: WebGLRenderingContext | null = null;

/**
 * Gets the features supported by the WebGL context.
 * 
 * @returns An object containing the features supported by the WebGL context.
 */
export const getFeatures = () => ({
	SHADER_INTERPOLATION: hasExtension('EXT_frag_depth') && hasMinVaryingVectors(8),
	SHADER_SPLATS:
		hasExtension('EXT_frag_depth') && hasExtension('OES_texture_float') && hasMinVaryingVectors(8),
	SHADER_EDL: hasExtension('OES_texture_float') && hasMinVaryingVectors(8),
	precision: getPrecision()
});

/**
 * Creates a WebGL rendering context.
 * 
 * @returns - The WebGL rendering context or null if not available.
 */
function renderer() {
	if (context) return context; // cache
	if (typeof document === 'undefined') return null; // server side

	// create a new context
	const canvas = document.createElement('canvas');
	context = canvas.getContext('webgl');
	return context;
}

/**
 * Checks if a specific WebGL extension is available.
 * 
 * @param ext - The name of the WebGL extension to check for.
 * @returns True if the extension is available, false otherwise.
 */
function hasExtension(ext: string)
{
	const gl = renderer();
	return gl !== null && Boolean(gl.getExtension(ext));
}

/**
 * Checks if the WebGL context supports a minimum number of varying vectors.
 * 
 * @param value - The minimum number of varying vectors to check for.
 * @returns True if the context supports at least the specified number of varying vectors, false otherwise.
 */
function hasMinVaryingVectors(value: number)
{
	const gl = renderer();
	return gl !== null && gl.getParameter(gl.MAX_VARYING_VECTORS) >= value;
}

/**
 * Gets the precision of the WebGL context.
 * 
 * @returns A string indicating the precision level ('highp', 'mediump', or 'lowp').
 */
function getPrecision()
{
	const gl = renderer();
	if (gl === null)
	{
		return '';
	}

	const vsHighpFloat = gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT);
	const vsMediumpFloat = gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.MEDIUM_FLOAT);

	const fsHighpFloat = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
	const fsMediumpFloat = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT);

	const highpAvailable = vsHighpFloat && fsHighpFloat && vsHighpFloat.precision > 0 && fsHighpFloat.precision > 0;

	const mediumpAvailable =
		vsMediumpFloat &&
		fsMediumpFloat &&
		vsMediumpFloat.precision > 0 &&
		fsMediumpFloat.precision > 0;

	return highpAvailable ? 'highp' : mediumpAvailable ? 'mediump' : 'lowp';
}
