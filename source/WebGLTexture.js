"use strict";

function paramThreeToGL(gl, p)
{
	var extension;

	if(p === THREE.RepeatWrapping) return gl.REPEAT;
	if(p === THREE.ClampToEdgeWrapping) return gl.CLAMP_TO_EDGE;
	if(p === THREE.MirroredRepeatWrapping) return gl.MIRRORED_REPEAT;

	if(p === THREE.NearestFilter) return gl.NEAREST;
	if(p === THREE.NearestMipMapNearestFilter) return gl.NEAREST_MIPMAP_NEAREST;
	if(p === THREE.NearestMipMapLinearFilter) return gl.NEAREST_MIPMAP_LINEAR;

	if(p === THREE.LinearFilter) return gl.LINEAR;
	if(p === THREE.LinearMipMapNearestFilter) return gl.LINEAR_MIPMAP_NEAREST;
	if(p === THREE.LinearMipMapLinearFilter) return gl.LINEAR_MIPMAP_LINEAR;

	if(p === THREE.UnsignedByteType) return gl.UNSIGNED_BYTE;
	if(p === THREE.UnsignedShort4444Type) return gl.UNSIGNED_SHORT_4_4_4_4;
	if(p === THREE.UnsignedShort5551Type) return gl.UNSIGNED_SHORT_5_5_5_1;
	if(p === THREE.UnsignedShort565Type) return gl.UNSIGNED_SHORT_5_6_5;

	if(p === THREE.ByteType) return gl.BYTE;
	if(p === THREE.ShortType) return gl.SHORT;
	if(p === THREE.UnsignedShortType) return gl.UNSIGNED_SHORT;
	if(p === THREE.IntType) return gl.INT;
	if(p === THREE.UnsignedIntType) return gl.UNSIGNED_INT;
	if(p === THREE.FloatType) return gl.FLOAT;

	if(p === THREE.HalfFloatType)
	{
		extension = extensions.get("OES_texture_half_float");
		if(extension !== null) return extension.HALF_FLOAT_OES;
	}

	if(p === THREE.AlphaFormat) return gl.ALPHA;
	if(p === THREE.RGBFormat) return gl.RGB;
	if(p === THREE.RGBAFormat) return gl.RGBA;
	if(p === THREE.LuminanceFormat) return gl.LUMINANCE;
	if(p === THREE.LuminanceAlphaFormat) return gl.LUMINANCE_ALPHA;
	if(p === THREE.DepthFormat) return gl.DEPTH_COMPONENT;
	if(p === THREE.DepthStencilFormat) return gl.DEPTH_STENCIL;

	if(p === THREE.AddEquation) return gl.FUNC_ADD;
	if(p === THREE.SubtractEquation) return gl.FUNC_SUBTRACT;
	if(p === THREE.ReverseSubtractEquation) return gl.FUNC_REVERSE_SUBTRACT;

	if(p === THREE.ZeroFactor) return gl.ZERO;
	if(p === THREE.OneFactor) return gl.ONE;
	if(p === THREE.SrcColorFactor) return gl.SRC_COLOR;
	if(p === THREE.OneMinusSrcColorFactor) return gl.ONE_MINUS_SRC_COLOR;
	if(p === THREE.SrcAlphaFactor) return gl.SRC_ALPHA;
	if(p === THREE.OneMinusSrcAlphaFactor) return gl.ONE_MINUS_SRC_ALPHA;
	if(p === THREE.DstAlphaFactor) return gl.DST_ALPHA;
	if(p === THREE.OneMinusDstAlphaFactor) return gl.ONE_MINUS_DST_ALPHA;

	if(p === THREE.DstColorFactor) return gl.DST_COLOR;
	if(p === THREE.OneMinusDstColorFactor) return gl.ONE_MINUS_DST_COLOR;
	if(p === THREE.SrcAlphaSaturateFactor) return gl.SRC_ALPHA_SATURATE;

	if(p === THREE.RGB_S3TC_DXT1_Format || p === RGBA_S3TC_DXT1_Format || p === THREE.RGBA_S3TC_DXT3_Format || p === RGBA_S3TC_DXT5_Format)
	{
		extension = extensions.get("WEBGL_compressed_texture_s3tc");

		if(extension !== null)
		{
			if(p === THREE.RGB_S3TC_DXT1_Format) return extension.COMPRESSED_RGB_S3TC_DXT1_EXT;
			if(p === THREE.RGBA_S3TC_DXT1_Format) return extension.COMPRESSED_RGBA_S3TC_DXT1_EXT;
			if(p === THREE.RGBA_S3TC_DXT3_Format) return extension.COMPRESSED_RGBA_S3TC_DXT3_EXT;
			if(p === THREE.RGBA_S3TC_DXT5_Format) return extension.COMPRESSED_RGBA_S3TC_DXT5_EXT;
		}
	}

	if(p === THREE.RGB_PVRTC_4BPPV1_Format || p === THREE.RGB_PVRTC_2BPPV1_Format || p === THREE.RGBA_PVRTC_4BPPV1_Format || p === THREE.RGBA_PVRTC_2BPPV1_Format)
	{
		extension = extensions.get("WEBGL_compressed_texture_pvrtc");

		if(extension !== null)
		{
			if(p === THREE.RGB_PVRTC_4BPPV1_Format) return extension.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;
			if(p === THREE.RGB_PVRTC_2BPPV1_Format) return extension.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;
			if(p === THREE.RGBA_PVRTC_4BPPV1_Format) return extension.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;
			if(p === THREE.RGBA_PVRTC_2BPPV1_Format) return extension.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG;
		}
	}

	if(p === THREE.RGB_ETC1_Format)
	{
		extension = extensions.get("WEBGL_compressed_texture_etc1");
		if(extension !== null) return extension.COMPRESSED_RGB_ETC1_WEBGL;
	}

	if(p === THREE.MinEquation || p === THREE.MaxEquation)
	{
		extension = extensions.get("EXT_blend_minmax");

		if(extension !== null)
		{
			if(p === THREE.MinEquation) return extension.MIN_EXT;
			if(p === THREE.MaxEquation) return extension.MAX_EXT;
		}
	}

	if(p === UnsignedInt248Type)
	{
		extension = extensions.get("WEBGL_depth_texture");
		if(extension !== null) return extension.UNSIGNED_INT_24_8_WEBGL;
	}

	return 0;
}

class WebGLTexture
{
	constructor(gl, texture)
	{
		this.gl = gl;

		this.texture = texture;
		this.id = gl.createTexture();

		this.target = gl.TEXTURE_2D;
		this.version = -1;

		this.update(texture);
	}

	update()
	{
		if(!this.texture.image)
		{
			this.version = this.texture.version;
			return;
		}

		var gl = this.gl;
		var texture = this.texture;

		if(this.version === texture.version)
		{
			return;
		}

		this.target = gl.TEXTURE_2D;

		gl.bindTexture(this.target, this.id);

		var level = 0;
		var internalFormat = paramThreeToGL(gl, texture.format);
		var width = texture.image.width;
		var height = texture.image.height;
		var border = 0;
		var srcFormat = internalFormat;
		var srcType = paramThreeToGL(gl, texture.type);
		var data;

		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, texture.flipY);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, texture.premultiplyAlpha);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, texture.unpackAlignment);

		if(texture instanceof THREE.DataTexture)
		{
			data = texture.image.data;

			gl.texParameteri(this.target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(this.target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

			gl.texParameteri(this.target, gl.TEXTURE_MAG_FILTER, paramThreeToGL(gl, texture.magFilter));
			gl.texParameteri(this.target, gl.TEXTURE_MIN_FILTER, paramThreeToGL(gl, texture.minFilter));

			gl.texImage2D(this.target, level, internalFormat, width, height, border, srcFormat, srcType, data);
		}
		else if(texture instanceof THREE.CanvasTexture)
		{
			data = texture.image;

			gl.texParameteri(this.target, gl.TEXTURE_WRAP_S, paramThreeToGL(gl, texture.wrapS));
			gl.texParameteri(this.target, gl.TEXTURE_WRAP_T, paramThreeToGL(gl, texture.wrapT));

			gl.texParameteri(this.target, gl.TEXTURE_MAG_FILTER, paramThreeToGL(gl, texture.magFilter));
			gl.texParameteri(this.target, gl.TEXTURE_MIN_FILTER, paramThreeToGL(gl, texture.minFilter));

			gl.texImage2D(this.target, level, internalFormat, internalFormat, srcType, data);
		}

		gl.bindTexture(this.target, null);

		this.version = texture.version;
	}
};

export {WebGLTexture};