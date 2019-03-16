"use strict";

import {WebGLTexture} from "./WebGLTexture.js";
import {AttributeLocations} from "./Potree.js";

class Shader
{
	constructor(gl, name, vsSource, fsSource)
	{
		this.gl = gl;
		this.name = name;
		this.vsSource = vsSource;
		this.fsSource = fsSource;

		this.cache = new Map();

		this.vs = null;
		this.fs = null;
		this.program = null;

		this.uniformLocations = {};
		this.attributeLocations = {};

		this.update(vsSource, fsSource);
	}

	update(vsSource, fsSource)
	{
		this.vsSource = vsSource;
		this.fsSource = fsSource;

		this.linkProgram();
	}

	compileShader(shader, source)
	{
		var gl = this.gl;

		gl.shaderSource(shader, source);

		gl.compileShader(shader);

		var success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
		if(!success)
		{
			var info = gl.getShaderInfoLog(shader);
			throw new Error("Potree: Could not compile shader " + this.name + ", " + info);
		}
	}

	linkProgram()
	{

		var gl = this.gl;

		this.uniformLocations = {};
		this.attributeLocations = {};

		gl.useProgram(null);

		var cached = this.cache.get(`${this.vsSource}, ${this.fsSource}`);
		if(cached)
		{
			this.program = cached.program;
			this.vs = cached.vs;
			this.fs = cached.fs;
			this.attributeLocations = cached.attributeLocations;
			this.uniformLocations = cached.uniformLocations;

			return;
		}
		else
		{
			this.vs = gl.createShader(gl.VERTEX_SHADER);
			this.fs = gl.createShader(gl.FRAGMENT_SHADER);
			this.program = gl.createProgram();

			for(var name of Object.keys(AttributeLocations))
			{
				var location = AttributeLocations[name];
				gl.bindAttribLocation(this.program, location, name);
			}

			this.compileShader(this.vs, this.vsSource);
			this.compileShader(this.fs, this.fsSource);

			var program = this.program;

			gl.attachShader(program, this.vs);
			gl.attachShader(program, this.fs);

			gl.linkProgram(program);

			gl.detachShader(program, this.vs);
			gl.detachShader(program, this.fs);

			var success = gl.getProgramParameter(program, gl.LINK_STATUS);
			if(!success)
			{
				var info = gl.getProgramInfoLog(program);
				throw new Error("Potree: Could not link program " + this.name + ", " + info);
			}

			//attribute locations
			var numAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);

			for(var i = 0; i < numAttributes; i++)
			{
				var attribute = gl.getActiveAttrib(program, i);

				var location = gl.getAttribLocation(program, attribute.name);

				this.attributeLocations[attribute.name] = location;
			}

			//uniform locations
			var numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);

			for(var i = 0; i < numUniforms; i++)
			{
				var uniform = gl.getActiveUniform(program, i);

				var location = gl.getUniformLocation(program, uniform.name);

				this.uniformLocations[uniform.name] = location;
			}

			var cached = {
				program: this.program,
				vs: this.vs,
				fs: this.fs,
				attributeLocations: this.attributeLocations,
				uniformLocations: this.uniformLocations
			};

			this.cache.set(`${this.vsSource}, ${this.fsSource}`, cached);
		}
	}

	setUniformMatrix4(name, value)
	{
		const gl = this.gl;
		const location = this.uniformLocations[name];

		if(location == null)
		{
			return;
		}

		var tmp = new Float32Array(value.elements);
		gl.uniformMatrix4fv(location, false, tmp);
	}

	setUniform1f(name, value)
	{
		const gl = this.gl;
		const location = this.uniformLocations[name];

		if(location == null)
		{
			return;
		}

		gl.uniform1f(location, value);
	}

	setUniformBoolean(name, value)
	{
		const gl = this.gl;
		const location = this.uniformLocations[name];

		if(location == null)
		{
			return;
		}

		gl.uniform1i(location, value);
	}

	setUniformTexture(name, value)
	{
		const gl = this.gl;
		const location = this.uniformLocations[name];

		if(location == null)
		{
			return;
		}

		gl.uniform1i(location, value);
	}

	setUniform2f(name, value)
	{
		const gl = this.gl;
		const location = this.uniformLocations[name];

		if(location == null)
		{
			return;
		}

		gl.uniform2f(location, value[0], value[1]);
	}

	setUniform3f(name, value)
	{
		const gl = this.gl;
		const location = this.uniformLocations[name];

		if(location == null)
		{
			return;
		}

		gl.uniform3f(location, value[0], value[1], value[2]);
	}

	setUniform(name, value)
	{

		if(value.constructor === THREE.Matrix4)
		{
			this.setUniformMatrix4(name, value);
		}
		else if(typeof value === "number")
		{
			this.setUniform1f(name, value);
		}
		else if(typeof value === "boolean")
		{
			this.setUniformBoolean(name, value);
		}
		else if(value instanceof WebGLTexture)
		{
			this.setUniformTexture(name, value);
		}
		else if(value instanceof Array)
		{
			if(value.length === 2)
			{
				this.setUniform2f(name, value);
			}
			else if(value.length === 3)
			{
				this.setUniform3f(name, value);
			}
		}
		else
		{
			console.error("Potree: Unhandled uniform type: ", name, value);
		}

	}

	setUniform1i(name, value)
	{
		var gl = this.gl;
		var location = this.uniformLocations[name];

		if(location == null)
		{
			return;
		}

		gl.uniform1i(location, value);
	}
};

export {Shader};