"use strict";

class WebGLBuffer
{
	constructor()
	{
		this.numElements = 0;
		this.vao = null;
		this.vbos = new Map();
	}
};

export {WebGLBuffer};