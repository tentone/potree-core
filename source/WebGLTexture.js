
Potree.WebGLTexture = class WebGLTexture
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

		let gl = this.gl;
		let texture = this.texture;

		if(this.version === texture.version)
		{
			return;
		}

		this.target = gl.TEXTURE_2D;

		gl.bindTexture(this.target, this.id);

		let level = 0;
		let internalFormat = Potree.paramThreeToGL(gl, texture.format);
		let width = texture.image.width;
		let height = texture.image.height;
		let border = 0;
		let srcFormat = internalFormat;
		let srcType = Potree.paramThreeToGL(gl, texture.type);
		let data;

		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, texture.flipY);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, texture.premultiplyAlpha);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, texture.unpackAlignment);

		if(texture instanceof THREE.DataTexture)
		{
			data = texture.image.data;

			gl.texParameteri(this.target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(this.target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

			gl.texParameteri(this.target, gl.TEXTURE_MAG_FILTER, Potree.paramThreeToGL(gl, texture.magFilter));
			gl.texParameteri(this.target, gl.TEXTURE_MIN_FILTER, Potree.paramThreeToGL(gl, texture.minFilter));

			gl.texImage2D(this.target, level, internalFormat,
				width, height, border, srcFormat, srcType,
				data);
		}
		else if(texture instanceof THREE.CanvasTexture)
		{
			data = texture.image;

			gl.texParameteri(this.target, gl.TEXTURE_WRAP_S, Potree.paramThreeToGL(gl, texture.wrapS));
			gl.texParameteri(this.target, gl.TEXTURE_WRAP_T, Potree.paramThreeToGL(gl, texture.wrapT));

			gl.texParameteri(this.target, gl.TEXTURE_MAG_FILTER, Potree.paramThreeToGL(gl, texture.magFilter));
			gl.texParameteri(this.target, gl.TEXTURE_MIN_FILTER, Potree.paramThreeToGL(gl, texture.minFilter));

			gl.texImage2D(this.target, level, internalFormat,
				internalFormat, srcType, data);
		}

		gl.bindTexture(this.target, null);

		this.version = texture.version;
	}

};