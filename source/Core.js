"use strict";

Potree.ClipTask = {

	NONE: 0,
	HIGHLIGHT: 1,
	SHOW_INSIDE: 2,
	SHOW_OUTSIDE: 3
};

Potree.ClipMethod = {
	INSIDE_ANY: 0,
	INSIDE_ALL: 1
};

Potree.getWorkerPath = function()
{
	if(document.currentScript.src)
	{
		Potree.scriptPath = new URL(document.currentScript.src + "/..").href;
		if(Potree.scriptPath.slice(-1) === "/")
		{
			Potree.scriptPath = Potree.scriptPath.slice(0, -1);
		}
	}
	else
	{
		console.error("Potree was unable to find its script path using document.currentScript. Is Potree included with a script tag? Does your browser support this function?");
	}
	Potree.resourcePath = Potree.scriptPath + "/resources";
};

Potree.getWorkerPath();

Potree.getDEMWorkerInstance = function()
{
	if(!PotreeDEMWorkerInstance)
	{
		let workerPath = Potree.scriptPath + "/workers/DEMWorker.js";
		PotreeDEMWorkerInstance = Potree.workerPool.getWorker(workerPath);
	}

	return PotreeDEMWorkerInstance;
};

// Copied from three.js: WebGLRenderer.js
Potree.paramThreeToGL = function paramThreeToGL(_gl, p)
{
	let extension;

	if(p === THREE.RepeatWrapping) return _gl.REPEAT;
	if(p === THREE.ClampToEdgeWrapping) return _gl.CLAMP_TO_EDGE;
	if(p === THREE.MirroredRepeatWrapping) return _gl.MIRRORED_REPEAT;

	if(p === THREE.NearestFilter) return _gl.NEAREST;
	if(p === THREE.NearestMipMapNearestFilter) return _gl.NEAREST_MIPMAP_NEAREST;
	if(p === THREE.NearestMipMapLinearFilter) return _gl.NEAREST_MIPMAP_LINEAR;

	if(p === THREE.LinearFilter) return _gl.LINEAR;
	if(p === THREE.LinearMipMapNearestFilter) return _gl.LINEAR_MIPMAP_NEAREST;
	if(p === THREE.LinearMipMapLinearFilter) return _gl.LINEAR_MIPMAP_LINEAR;

	if(p === THREE.UnsignedByteType) return _gl.UNSIGNED_BYTE;
	if(p === THREE.UnsignedShort4444Type) return _gl.UNSIGNED_SHORT_4_4_4_4;
	if(p === THREE.UnsignedShort5551Type) return _gl.UNSIGNED_SHORT_5_5_5_1;
	if(p === THREE.UnsignedShort565Type) return _gl.UNSIGNED_SHORT_5_6_5;

	if(p === THREE.ByteType) return _gl.BYTE;
	if(p === THREE.ShortType) return _gl.SHORT;
	if(p === THREE.UnsignedShortType) return _gl.UNSIGNED_SHORT;
	if(p === THREE.IntType) return _gl.INT;
	if(p === THREE.UnsignedIntType) return _gl.UNSIGNED_INT;
	if(p === THREE.FloatType) return _gl.FLOAT;

	if(p === THREE.HalfFloatType)
	{
		extension = extensions.get("OES_texture_half_float");
		if(extension !== null) return extension.HALF_FLOAT_OES;
	}

	if(p === THREE.AlphaFormat) return _gl.ALPHA;
	if(p === THREE.RGBFormat) return _gl.RGB;
	if(p === THREE.RGBAFormat) return _gl.RGBA;
	if(p === THREE.LuminanceFormat) return _gl.LUMINANCE;
	if(p === THREE.LuminanceAlphaFormat) return _gl.LUMINANCE_ALPHA;
	if(p === THREE.DepthFormat) return _gl.DEPTH_COMPONENT;
	if(p === THREE.DepthStencilFormat) return _gl.DEPTH_STENCIL;

	if(p === THREE.AddEquation) return _gl.FUNC_ADD;
	if(p === THREE.SubtractEquation) return _gl.FUNC_SUBTRACT;
	if(p === THREE.ReverseSubtractEquation) return _gl.FUNC_REVERSE_SUBTRACT;

	if(p === THREE.ZeroFactor) return _gl.ZERO;
	if(p === THREE.OneFactor) return _gl.ONE;
	if(p === THREE.SrcColorFactor) return _gl.SRC_COLOR;
	if(p === THREE.OneMinusSrcColorFactor) return _gl.ONE_MINUS_SRC_COLOR;
	if(p === THREE.SrcAlphaFactor) return _gl.SRC_ALPHA;
	if(p === THREE.OneMinusSrcAlphaFactor) return _gl.ONE_MINUS_SRC_ALPHA;
	if(p === THREE.DstAlphaFactor) return _gl.DST_ALPHA;
	if(p === THREE.OneMinusDstAlphaFactor) return _gl.ONE_MINUS_DST_ALPHA;

	if(p === THREE.DstColorFactor) return _gl.DST_COLOR;
	if(p === THREE.OneMinusDstColorFactor) return _gl.ONE_MINUS_DST_COLOR;
	if(p === THREE.SrcAlphaSaturateFactor) return _gl.SRC_ALPHA_SATURATE;

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

};

Potree.attributeLocations = {
	"position": 0,
	"color": 1,
	"intensity": 2,
	"classification": 3,
	"returnNumber": 4,
	"numberOfReturns": 5,
	"pointSourceID": 6,
	"indices": 7,
	"normal": 8,
	"spacing": 9,
};


Potree.Points = class Points
{
	constructor()
	{
		this.boundingBox = new THREE.Box3();
		this.numPoints = 0;
		this.data = {};
	}

	add(points)
	{
		let currentSize = this.numPoints;
		let additionalSize = points.numPoints;
		let newSize = currentSize + additionalSize;

		let thisAttributes = Object.keys(this.data);
		let otherAttributes = Object.keys(points.data);
		let attributes = new Set([...thisAttributes, ...otherAttributes]);

		for(let attribute of attributes)
		{
			if(thisAttributes.includes(attribute) && otherAttributes.includes(attribute))
			{
				// attribute in both, merge
				let Type = this.data[attribute].constructor;
				let merged = new Type(this.data[attribute].length + points.data[attribute].length);
				merged.set(this.data[attribute], 0);
				merged.set(points.data[attribute], this.data[attribute].length);
				this.data[attribute] = merged;
			}
			else if(thisAttributes.includes(attribute) && !otherAttributes.includes(attribute))
			{
				// attribute only in this; take over this and expand to new size
				let elementsPerPoint = this.data[attribute].length / this.numPoints;
				let Type = this.data[attribute].constructor;
				let expanded = new Type(elementsPerPoint * newSize);
				expanded.set(this.data[attribute], 0);
				this.data[attribute] = expanded;
			}
			else if(!thisAttributes.includes(attribute) && otherAttributes.includes(attribute))
			{
				// attribute only in points to be added; take over new points and expand to new size
				let elementsPerPoint = points.data[attribute].length / points.numPoints;
				let Type = points.data[attribute].constructor;
				let expanded = new Type(elementsPerPoint * newSize);
				expanded.set(points.data[attribute], elementsPerPoint * currentSize);
				this.data[attribute] = expanded;
			}
		}

		this.numPoints = newSize;

		this.boundingBox.union(points.boundingBox);
	}
};

Potree.Shader = class Shader
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
		let gl = this.gl;

		gl.shaderSource(shader, source);

		gl.compileShader(shader);

		let success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
		if(!success)
		{
			let info = gl.getShaderInfoLog(shader);
			let numberedSource = source.split("\n").map((a, i) => `${i + 1}`.padEnd(5) + a).join("\n");
			throw `could not compile shader ${this.name}: ${info}, \n${numberedSource}`;
		}
	}

	linkProgram()
	{

		let gl = this.gl;

		this.uniformLocations = {};
		this.attributeLocations = {};

		gl.useProgram(null);

		let cached = this.cache.get(`${this.vsSource}, ${this.fsSource}`);
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

			for(let name of Object.keys(Potree.attributeLocations))
			{
				let location = Potree.attributeLocations[name];
				gl.bindAttribLocation(this.program, location, name);
			}

			this.compileShader(this.vs, this.vsSource);
			this.compileShader(this.fs, this.fsSource);

			let program = this.program;

			gl.attachShader(program, this.vs);
			gl.attachShader(program, this.fs);

			gl.linkProgram(program);

			gl.detachShader(program, this.vs);
			gl.detachShader(program, this.fs);

			let success = gl.getProgramParameter(program, gl.LINK_STATUS);
			if(!success)
			{
				let info = gl.getProgramInfoLog(program);
				throw `could not link program ${this.name}: ${info}`;
			}

			// attribute locations
			let numAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);

			for(let i = 0; i < numAttributes; i++)
			{
				let attribute = gl.getActiveAttrib(program, i);

				let location = gl.getAttribLocation(program, attribute.name);

				this.attributeLocations[attribute.name] = location;
			}

			// uniform locations
			let numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);

			for(let i = 0; i < numUniforms; i++)
			{
				let uniform = gl.getActiveUniform(program, i);

				let location = gl.getUniformLocation(program, uniform.name);

				this.uniformLocations[uniform.name] = location;
			}

			let cached = {
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

		let tmp = new Float32Array(value.elements);
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
		else if(value instanceof Potree.WebGLTexture)
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
			console.error("unhandled uniform type: ", name, value);
		}

	}

	setUniform1i(name, value)
	{
		let gl = this.gl;
		let location = this.uniformLocations[name];

		if(location == null)
		{
			return;
		}

		gl.uniform1i(location, value);
	}

};

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

Potree.WebGLBuffer = class WebGLBuffer
{
	constructor()
	{
		this.numElements = 0;
		this.vao = null;
		this.vbos = new Map();
	}
};


Potree.PointCloudTreeNode = class
{
	constructor()
	{
		this.needsTransformUpdate = true;
	}

	getChildren(){}

	getBoundingBox(){}

	isLoaded(){}

	isGeometryNode(){}

	isTreeNode(){}

	getLevel(){}

	getBoundingSphere(){}
};

Potree.PointCloudTree = class PointCloudTree extends THREE.Object3D
{
	constructor()
	{
		super();

		this.dem = new PotreeDEM(this);
	}

	initialized()
	{
		return this.root !== null;
	}
};

/**
 * @class Loads mno files and returns a PointcloudOctree
 * for a description of the mno binary file format, read mnoFileFormat.txt
 *
 * @author Markus Schuetz
 */
Potree.POCLoader = function(){};

/**
 * @return a point cloud octree with the root node data loaded.
 * loading of descendants happens asynchronously when they"re needed
 *
 * @param url
 * @param loadingFinishedListener executed after loading the binary has been finished
 */
Potree.POCLoader.load = function load(url, callback)
{
	try
	{
		let pco = new Potree.PointCloudOctreeGeometry();
		pco.url = url;
		let xhr = XHRFactory.createXMLHttpRequest();
		xhr.open("GET", url, true);

		xhr.onreadystatechange = function()
		{
			if(xhr.readyState === 4 && (xhr.status === 200 || xhr.status === 0))
			{
				let fMno = JSON.parse(xhr.responseText);

				let version = new Potree.Version(fMno.version);

				// assume octreeDir is absolute if it starts with http
				if(fMno.octreeDir.indexOf("http") === 0)
				{
					pco.octreeDir = fMno.octreeDir;
				}
				else
				{
					pco.octreeDir = url + "/../" + fMno.octreeDir;
				}

				pco.spacing = fMno.spacing;
				pco.hierarchyStepSize = fMno.hierarchyStepSize;

				pco.pointAttributes = fMno.pointAttributes;

				let min = new THREE.Vector3(fMno.boundingBox.lx, fMno.boundingBox.ly, fMno.boundingBox.lz);
				let max = new THREE.Vector3(fMno.boundingBox.ux, fMno.boundingBox.uy, fMno.boundingBox.uz);
				let boundingBox = new THREE.Box3(min, max);
				let tightBoundingBox = boundingBox.clone();

				if(fMno.tightBoundingBox)
				{
					tightBoundingBox.min.copy(new THREE.Vector3(fMno.tightBoundingBox.lx, fMno.tightBoundingBox.ly, fMno.tightBoundingBox.lz));
					tightBoundingBox.max.copy(new THREE.Vector3(fMno.tightBoundingBox.ux, fMno.tightBoundingBox.uy, fMno.tightBoundingBox.uz));
				}

				let offset = min.clone();

				boundingBox.min.sub(offset);
				boundingBox.max.sub(offset);

				tightBoundingBox.min.sub(offset);
				tightBoundingBox.max.sub(offset);

				pco.projection = fMno.projection;
				pco.boundingBox = boundingBox;
				pco.tightBoundingBox = tightBoundingBox;
				pco.boundingSphere = boundingBox.getBoundingSphere(new THREE.Sphere());
				pco.tightBoundingSphere = tightBoundingBox.getBoundingSphere(new THREE.Sphere());
				pco.offset = offset;
				if(fMno.pointAttributes === "LAS")
				{
					pco.loader = new Potree.LasLazLoader(fMno.version);
				}
				else if(fMno.pointAttributes === "LAZ")
				{
					pco.loader = new Potree.LasLazLoader(fMno.version);
				}
				else
				{
					pco.loader = new Potree.BinaryLoader(fMno.version, boundingBox, fMno.scale);
					pco.pointAttributes = new Potree.PointAttributes(pco.pointAttributes);
				}

				let nodes = {};

				{ // load root
					let name = "r";

					let root = new Potree.PointCloudOctreeGeometryNode(name, pco, boundingBox);
					root.level = 0;
					root.hasChildren = true;
					root.spacing = pco.spacing;
					if(version.upTo("1.5"))
					{
						root.numPoints = fMno.hierarchy[0][1];
					}
					else
					{
						root.numPoints = 0;
					}
					pco.root = root;
					pco.root.load();
					nodes[name] = root;
				}

				// load remaining hierarchy
				if(version.upTo("1.4"))
				{
					for(let i = 1; i < fMno.hierarchy.length; i++)
					{
						let name = fMno.hierarchy[i][0];
						let numPoints = fMno.hierarchy[i][1];
						let index = parseInt(name.charAt(name.length - 1));
						let parentName = name.substring(0, name.length - 1);
						let parentNode = nodes[parentName];
						let level = name.length - 1;
						let boundingBox = Potree.POCLoader.createChildAABB(parentNode.boundingBox, index);

						let node = new Potree.PointCloudOctreeGeometryNode(name, pco, boundingBox);
						node.level = level;
						node.numPoints = numPoints;
						node.spacing = pco.spacing / Math.pow(2, level);
						parentNode.addChild(node);
						nodes[name] = node;
					}
				}

				pco.nodes = nodes;

				callback(pco);
			}
		};

		xhr.send(null);
	}
	catch(e)
	{
		console.log("loading failed: \"" + url + "\"");
		console.log(e);

		callback();
	}
};

Potree.POCLoader.loadPointAttributes = function(mno)
{
	let fpa = mno.pointAttributes;
	let pa = new Potree.PointAttributes();

	for(let i = 0; i < fpa.length; i++)
	{
		let pointAttribute = Potree.PointAttribute[fpa[i]];
		pa.add(pointAttribute);
	}

	return pa;
};

Potree.POCLoader.createChildAABB = function(aabb, index)
{
	let min = aabb.min.clone();
	let max = aabb.max.clone();
	let size = new THREE.Vector3().subVectors(max, min);

	if((index & 0b0001) > 0)
	{
		min.z += size.z / 2;
	}
	else
	{
		max.z -= size.z / 2;
	}

	if((index & 0b0010) > 0)
	{
		min.y += size.y / 2;
	}
	else
	{
		max.y -= size.y / 2;
	}

	if((index & 0b0100) > 0)
	{
		min.x += size.x / 2;
	}
	else
	{
		max.x -= size.x / 2;
	}

	return new THREE.Box3(min, max);
};

Potree.PointAttributeNames = {};

Potree.PointAttributeNames.POSITION_CARTESIAN = 0; // float x, y, z;
Potree.PointAttributeNames.COLOR_PACKED = 1; // byte r, g, b, a; 	I = [0,1]
Potree.PointAttributeNames.COLOR_FLOATS_1 = 2; // float r, g, b; 		I = [0,1]
Potree.PointAttributeNames.COLOR_FLOATS_255 = 3; // float r, g, b; 		I = [0,255]
Potree.PointAttributeNames.NORMAL_FLOATS = 4; // float x, y, z;
Potree.PointAttributeNames.FILLER = 5;
Potree.PointAttributeNames.INTENSITY = 6;
Potree.PointAttributeNames.CLASSIFICATION = 7;
Potree.PointAttributeNames.NORMAL_SPHEREMAPPED = 8;
Potree.PointAttributeNames.NORMAL_OCT16 = 9;
Potree.PointAttributeNames.NORMAL = 10;
Potree.PointAttributeNames.RETURN_NUMBER = 11;
Potree.PointAttributeNames.NUMBER_OF_RETURNS = 12;
Potree.PointAttributeNames.SOURCE_ID = 13;
Potree.PointAttributeNames.INDICES = 14;
Potree.PointAttributeNames.SPACING = 15;

/**
 * Some types of possible point attribute data formats
 *
 * @class
 */
Potree.PointAttributeTypes = {
	DATA_TYPE_DOUBLE:
	{
		ordinal: 0,
		size: 8
	},
	DATA_TYPE_FLOAT:
	{
		ordinal: 1,
		size: 4
	},
	DATA_TYPE_INT8:
	{
		ordinal: 2,
		size: 1
	},
	DATA_TYPE_UINT8:
	{
		ordinal: 3,
		size: 1
	},
	DATA_TYPE_INT16:
	{
		ordinal: 4,
		size: 2
	},
	DATA_TYPE_UINT16:
	{
		ordinal: 5,
		size: 2
	},
	DATA_TYPE_INT32:
	{
		ordinal: 6,
		size: 4
	},
	DATA_TYPE_UINT32:
	{
		ordinal: 7,
		size: 4
	},
	DATA_TYPE_INT64:
	{
		ordinal: 8,
		size: 8
	},
	DATA_TYPE_UINT64:
	{
		ordinal: 9,
		size: 8
	}
};

let i = 0;
for(let obj in Potree.PointAttributeTypes)
{
	Potree.PointAttributeTypes[i] = Potree.PointAttributeTypes[obj];
	i++;
}

/**
 * A single point attribute such as color/normal/.. and its data format/number of elements/...
 *
 * @class
 * @param name
 * @param type
 * @param size
 * @returns
 */
Potree.PointAttribute = function(name, type, numElements)
{
	this.name = name;
	this.type = type;
	this.numElements = numElements;
	this.byteSize = this.numElements * this.type.size;
};

Potree.PointAttribute.POSITION_CARTESIAN = new Potree.PointAttribute(
	Potree.PointAttributeNames.POSITION_CARTESIAN,
	Potree.PointAttributeTypes.DATA_TYPE_FLOAT, 3);

Potree.PointAttribute.RGBA_PACKED = new Potree.PointAttribute(
	Potree.PointAttributeNames.COLOR_PACKED,
	Potree.PointAttributeTypes.DATA_TYPE_INT8, 4);

Potree.PointAttribute.COLOR_PACKED = Potree.PointAttribute.RGBA_PACKED;

Potree.PointAttribute.RGB_PACKED = new Potree.PointAttribute(
	Potree.PointAttributeNames.COLOR_PACKED,
	Potree.PointAttributeTypes.DATA_TYPE_INT8, 3);

Potree.PointAttribute.NORMAL_FLOATS = new Potree.PointAttribute(
	Potree.PointAttributeNames.NORMAL_FLOATS,
	Potree.PointAttributeTypes.DATA_TYPE_FLOAT, 3);

Potree.PointAttribute.FILLER_1B = new Potree.PointAttribute(
	Potree.PointAttributeNames.FILLER,
	Potree.PointAttributeTypes.DATA_TYPE_UINT8, 1);

Potree.PointAttribute.INTENSITY = new Potree.PointAttribute(
	Potree.PointAttributeNames.INTENSITY,
	Potree.PointAttributeTypes.DATA_TYPE_UINT16, 1);

Potree.PointAttribute.CLASSIFICATION = new Potree.PointAttribute(
	Potree.PointAttributeNames.CLASSIFICATION,
	Potree.PointAttributeTypes.DATA_TYPE_UINT8, 1);

Potree.PointAttribute.NORMAL_SPHEREMAPPED = new Potree.PointAttribute(
	Potree.PointAttributeNames.NORMAL_SPHEREMAPPED,
	Potree.PointAttributeTypes.DATA_TYPE_UINT8, 2);

Potree.PointAttribute.NORMAL_OCT16 = new Potree.PointAttribute(
	Potree.PointAttributeNames.NORMAL_OCT16,
	Potree.PointAttributeTypes.DATA_TYPE_UINT8, 2);

Potree.PointAttribute.NORMAL = new Potree.PointAttribute(
	Potree.PointAttributeNames.NORMAL,
	Potree.PointAttributeTypes.DATA_TYPE_FLOAT, 3);

Potree.PointAttribute.RETURN_NUMBER = new Potree.PointAttribute(
	Potree.PointAttributeNames.RETURN_NUMBER,
	Potree.PointAttributeTypes.DATA_TYPE_UINT8, 1);

Potree.PointAttribute.NUMBER_OF_RETURNS = new Potree.PointAttribute(
	Potree.PointAttributeNames.NUMBER_OF_RETURNS,
	Potree.PointAttributeTypes.DATA_TYPE_UINT8, 1);

Potree.PointAttribute.SOURCE_ID = new Potree.PointAttribute(
	Potree.PointAttributeNames.SOURCE_ID,
	Potree.PointAttributeTypes.DATA_TYPE_UINT8, 1);

Potree.PointAttribute.INDICES = new Potree.PointAttribute(
	Potree.PointAttributeNames.INDICES,
	Potree.PointAttributeTypes.DATA_TYPE_UINT32, 1);

Potree.PointAttribute.SPACING = new Potree.PointAttribute(
	Potree.PointAttributeNames.SPACING,
	Potree.PointAttributeTypes.DATA_TYPE_FLOAT, 1);

/**
 * Ordered list of PointAttributes used to identify how points are aligned in a buffer.
 *
 * @class
 *
 */
Potree.PointAttributes = function(pointAttributes)
{
	this.attributes = [];
	this.byteSize = 0;
	this.size = 0;

	if(pointAttributes != null)
	{
		for(let i = 0; i < pointAttributes.length; i++)
		{
			let pointAttributeName = pointAttributes[i];
			let pointAttribute = Potree.PointAttribute[pointAttributeName];
			this.attributes.push(pointAttribute);
			this.byteSize += pointAttribute.byteSize;
			this.size++;
		}
	}
};

Potree.PointAttributes.prototype.add = function(pointAttribute)
{
	this.attributes.push(pointAttribute);
	this.byteSize += pointAttribute.byteSize;
	this.size++;
};

Potree.PointAttributes.prototype.hasColors = function()
{
	for(let name in this.attributes)
	{
		let pointAttribute = this.attributes[name];
		if(pointAttribute.name === Potree.PointAttributeNames.COLOR_PACKED)
		{
			return true;
		}
	}

	return false;
};

Potree.PointAttributes.prototype.hasNormals = function()
{
	for(let name in this.attributes)
	{
		let pointAttribute = this.attributes[name];
		if(
			pointAttribute === Potree.PointAttribute.NORMAL_SPHEREMAPPED ||
			pointAttribute === Potree.PointAttribute.NORMAL_FLOATS ||
			pointAttribute === Potree.PointAttribute.NORMAL ||
			pointAttribute === Potree.PointAttribute.NORMAL_OCT16)
		{
			return true;
		}
	}

	return false;
};




/**
 * @class Loads greyhound metadata and returns a PointcloudOctree
 *
 * @author Maarten van Meersbergen
 * @author Oscar Martinez Rubi
 * @author Connor Manning
 */

class GreyhoundUtils
{
	static getQueryParam(name)
	{
		name = name.replace(/[[\]]/g, "\\$&");
		let regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)");
		let results = regex.exec(window.location.href);
		if(!results) return null;
		if(!results[2]) return "";
		return decodeURIComponent(results[2].replace(/\+/g, " "));
	}

	static createSchema(attributes)
	{
		let schema = [
			{
				"name": "X",
				"size": 4,
				"type": "signed"
			},
			{
				"name": "Y",
				"size": 4,
				"type": "signed"
			},
			{
				"name": "Z",
				"size": 4,
				"type": "signed"
			}
		];

		// Once we include options in the UI to load a dynamic list of available
		// attributes for visualization (f.e. Classification, Intensity etc.)
		// we will be able to ask for that specific attribute from the server,
		// where we are now requesting all attributes for all points all the time.
		// If we do that though, we also need to tell Potree to redraw the points
		// that are already loaded (with different attributes).
		// This is not default behaviour.
		attributes.forEach(function(item)
		{
			if(item === "COLOR_PACKED")
			{
				schema.push(
				{
					"name": "Red",
					"size": 2,
					"type": "unsigned"
				});
				schema.push(
				{
					"name": "Green",
					"size": 2,
					"type": "unsigned"
				});
				schema.push(
				{
					"name": "Blue",
					"size": 2,
					"type": "unsigned"
				});
			}
			else if(item === "INTENSITY")
			{
				schema.push(
				{
					"name": "Intensity",
					"size": 2,
					"type": "unsigned"
				});
			}
			else if(item === "CLASSIFICATION")
			{
				schema.push(
				{
					"name": "Classification",
					"size": 1,
					"type": "unsigned"
				});
			}
		});

		return schema;
	}

	static fetch(url, cb)
	{
		let xhr = XHRFactory.createXMLHttpRequest();
		xhr.open("GET", url, true);
		xhr.onreadystatechange = function()
		{
			if(xhr.readyState === 4)
			{
				if(xhr.status === 200 || xhr.status === 0)
				{
					cb(null, xhr.responseText);
				}
				else
				{
					cb(xhr.responseText);
				}
			}
		};
		xhr.send(null);
	};

	static fetchBinary(url, cb)
	{
		let xhr = XHRFactory.createXMLHttpRequest();
		xhr.open("GET", url, true);
		xhr.responseType = "arraybuffer";
		xhr.onreadystatechange = function()
		{
			if(xhr.readyState === 4)
			{
				if(xhr.status === 200 || xhr.status === 0)
				{
					cb(null, xhr.response);
				}
				else
				{
					cb(xhr.responseText);
				}
			}
		};
		xhr.send(null);
	};

	static pointSizeFrom(schema)
	{
		return schema.reduce((p, c) => p + c.size, 0);
	};

	static getNormalization(serverURL, baseDepth, cb)
	{
		let s = [
			{
				"name": "X",
				"size": 4,
				"type": "floating"
			},
			{
				"name": "Y",
				"size": 4,
				"type": "floating"
			},
			{
				"name": "Z",
				"size": 4,
				"type": "floating"
			},
			{
				"name": "Red",
				"size": 2,
				"type": "unsigned"
			},
			{
				"name": "Green",
				"size": 2,
				"type": "unsigned"
			},
			{
				"name": "Blue",
				"size": 2,
				"type": "unsigned"
			},
			{
				"name": "Intensity",
				"size": 2,
				"type": "unsigned"
			}
		];

		let url = serverURL + "read?depth=" + baseDepth +
			"&schema=" + JSON.stringify(s);

		GreyhoundUtils.fetchBinary(url, function(err, buffer)
		{
			if(err) throw new Error(err);

			let view = new DataView(buffer);
			let numBytes = buffer.byteLength - 4;
			// TODO Unused: let numPoints = view.getUint32(numBytes, true);
			let pointSize = GreyhoundUtils.pointSizeFrom(s);

			let colorNorm = false;
			let intensityNorm = false;

			for(let offset = 0; offset < numBytes; offset += pointSize)
			{
				if(view.getUint16(offset + 12, true) > 255 ||
					view.getUint16(offset + 14, true) > 255 ||
					view.getUint16(offset + 16, true) > 255)
				{
					colorNorm = true;
				}

				if(view.getUint16(offset + 18, true) > 255)
				{
					intensityNorm = true;
				}

				if(colorNorm && intensityNorm) break;
			}

			if(colorNorm) console.log("Normalizing color");
			if(intensityNorm) console.log("Normalizing intensity");

			cb(null,
			{
				color: colorNorm,
				intensity: intensityNorm
			});
		});
	};
};


/**
 * laslaz code taken and adapted from plas.io js-laslaz
 *	http://plas.io/
 *  https://github.com/verma/plasio
 *
 * Thanks to Uday Verma and Howard Butler
 *
 */

Potree.LasLazLoader = class LasLazLoader
{
	constructor(version)
	{
		if(typeof(version) === "string")
		{
			this.version = new Potree.Version(version);
		}
		else
		{
			this.version = version;
		}
	}

	static progressCB()
	{}

	load(node)
	{
		if(node.loaded)
		{
			return;
		}

		let pointAttributes = node.pcoGeometry.pointAttributes;

		let url = node.getURL();

		if(this.version.equalOrHigher("1.4"))
		{
			url += "." + pointAttributes.toLowerCase();
		}

		let xhr = XHRFactory.createXMLHttpRequest();
		xhr.open("GET", url, true);
		xhr.responseType = "arraybuffer";
		xhr.overrideMimeType("text/plain; charset=x-user-defined");
		xhr.onreadystatechange = () =>
		{
			if(xhr.readyState === 4)
			{
				if(xhr.status === 200)
				{
					let buffer = xhr.response;
					this.parse(node, buffer);
				}
				else
				{
					console.log("Failed to load file! HTTP status: " + xhr.status + ", file: " + url);
				}
			}
		};

		xhr.send(null);
	}

	parse(node, buffer)
	{
		let lf = new LASFile(buffer);
		let handler = new Potree.LasLazBatcher(node);

		//
		// DEBUG
		//
		// invoke the laz decompress worker thousands of times to check for memory leaks
		// until 2018/03/05, it tended to run out of memory at ~6230 invocations
		// 
		//
		//lf.open()
		//.then( msg => {
		//	lf.isOpen = true;
		//	return lf;
		//}).catch( msg => {
		//	console.log("failed to open file. :(");	
		//}).then( lf => {
		//	return lf.getHeader().then(function (h) {
		//		return [lf, h];
		//	});
		//}).then( v => {
		//	let lf = v[0];
		//	let header = v[1];

		//	lf.readData(1000000, 0, 1)
		//	.then( v => {
		//		console.log("read");

		//		this.parse(node, buffer);
		//	}).then (v => {
		//		lf.close();	
		//	});

		//})

		lf.open()
			.then(msg =>
			{
				lf.isOpen = true;
				return lf;
			}).catch(msg =>
			{
				console.log("failed to open file. :(");
			}).then(lf =>
			{
				return lf.getHeader().then(function(h)
				{
					return [lf, h];
				});
			}).then(v =>
			{
				let lf = v[0];
				let header = v[1];

				let skip = 1;
				let totalRead = 0;
				let totalToRead = (skip <= 1 ? header.pointsCount : header.pointsCount / skip);
				let reader = function()
				{
					let p = lf.readData(1000000, 0, skip);
					return p.then(function(data)
					{
						handler.push(new LASDecoder(data.buffer,
							header.pointsFormatId,
							header.pointsStructSize,
							data.count,
							header.scale,
							header.offset,
							header.mins, header.maxs));

						totalRead += data.count;
						Potree.LasLazLoader.progressCB(totalRead / totalToRead);

						if(data.hasMoreData)
						{
							return reader();
						}
						else
						{
							header.totalRead = totalRead;
							header.versionAsString = lf.versionAsString;
							header.isCompressed = lf.isCompressed;
							return [lf, header, handler];
						}
					});
				};

				return reader();
			}).then(v =>
			{
				let lf = v[0];
				// we"re done loading this file
				//
				Potree.LasLazLoader.progressCB(1);

				// Close it
				return lf.close().then(function()
				{
					lf.isOpen = false;

					return v.slice(1);
				}).catch(e =>
				{
					// If there was a cancellation, make sure the file is closed, if the file is open
					// close and then fail
					if(lf.isOpen)
					{
						return lf.close().then(function()
						{
							lf.isOpen = false;
							throw e;
						});
					}
					throw e;
				});
			});
	}

	handle(node, url)
	{

	}
};

Potree.LasLazBatcher = class LasLazBatcher
{
	constructor(node)
	{
		this.node = node;
	}

	push(lasBuffer)
	{
		let workerPath = Potree.scriptPath + "/workers/LASDecoderWorker.js";
		let worker = Potree.workerPool.getWorker(workerPath);
		let node = this.node;

		worker.onmessage = (e) =>
		{
			let geometry = new THREE.BufferGeometry();
			let numPoints = lasBuffer.pointsCount;

			let positions = new Float32Array(e.data.position);
			let colors = new Uint8Array(e.data.color);
			let intensities = new Float32Array(e.data.intensity);
			let classifications = new Uint8Array(e.data.classification);
			let returnNumbers = new Uint8Array(e.data.returnNumber);
			let numberOfReturns = new Uint8Array(e.data.numberOfReturns);
			let pointSourceIDs = new Uint16Array(e.data.pointSourceID);
			let indices = new Uint8Array(e.data.indices);

			geometry.addAttribute("position", new THREE.BufferAttribute(positions, 3));
			geometry.addAttribute("color", new THREE.BufferAttribute(colors, 4, true));
			geometry.addAttribute("intensity", new THREE.BufferAttribute(intensities, 1));
			geometry.addAttribute("classification", new THREE.BufferAttribute(classifications, 1));
			geometry.addAttribute("returnNumber", new THREE.BufferAttribute(returnNumbers, 1));
			geometry.addAttribute("numberOfReturns", new THREE.BufferAttribute(numberOfReturns, 1));
			geometry.addAttribute("pointSourceID", new THREE.BufferAttribute(pointSourceIDs, 1));
			//geometry.addAttribute("normal", new THREE.BufferAttribute(new Float32Array(numPoints * 3), 3));
			geometry.addAttribute("indices", new THREE.BufferAttribute(indices, 4));
			geometry.attributes.indices.normalized = true;

			let tightBoundingBox = new THREE.Box3(
				new THREE.Vector3().fromArray(e.data.tightBoundingBox.min),
				new THREE.Vector3().fromArray(e.data.tightBoundingBox.max)
			);

			geometry.boundingBox = this.node.boundingBox;
			this.node.tightBoundingBox = tightBoundingBox;

			this.node.geometry = geometry;
			this.node.numPoints = numPoints;
			this.node.loaded = true;
			this.node.loading = false;
			Potree.numNodesLoading--;
			this.node.mean = new THREE.Vector3(...e.data.mean);

			//debugger;

			Potree.workerPool.returnWorker(workerPath, worker);
		};

		let message = {
			buffer: lasBuffer.arrayb,
			numPoints: lasBuffer.pointsCount,
			pointSize: lasBuffer.pointSize,
			pointFormatID: 2,
			scale: lasBuffer.scale,
			offset: lasBuffer.offset,
			mins: lasBuffer.mins,
			maxs: lasBuffer.maxs
		};
		worker.postMessage(message, [message.buffer]);
	};
};

//
//
//
// how to calculate the radius of a projected sphere in screen space
// http://stackoverflow.com/questions/21648630/radius-of-projected-sphere-in-screen-space
// http://stackoverflow.com/questions/3717226/radius-of-projected-sphere
//

//
// to get a ready to use gradient array from a chroma.js gradient:
// http://gka.github.io/chroma.js/
//
// let stops = [];
// for(let i = 0; i <= 10; i++){
//	let range = chroma.scale(["yellow", "navy"]).mode("lch").domain([10,0])(i)._rgb
//		.slice(0, 3)
//		.map(v => (v / 255).toFixed(4))
//		.join(", ");
//
//	let line = `[${i / 10}, new THREE.Color(${range})],`;
//
//	stops.push(line);
// }
// stops.join("\n");

// to get a ready to use gradient array from matplotlib:
// import matplotlib.pyplot as plt
// import matplotlib.colors as colors
//
// norm = colors.Normalize(vmin=0,vmax=1)
// cmap = plt.cm.viridis
//
// for i in range(0,11):
//    u = i / 10
//    rgb = cmap(norm(u))[0:3]
//    rgb = ["{0:.3f}".format(v) for v in rgb]
//    rgb = "[" + str(u) + ", new THREE.Color(" +  ", ".join(rgb) + ")],"
//    print(rgb)

Potree.Gradients = {
	RAINBOW: [
		[0, new THREE.Color(0.278, 0, 0.714)],
		[1 / 6, new THREE.Color(0, 0, 1)],
		[2 / 6, new THREE.Color(0, 1, 1)],
		[3 / 6, new THREE.Color(0, 1, 0)],
		[4 / 6, new THREE.Color(1, 1, 0)],
		[5 / 6, new THREE.Color(1, 0.64, 0)],
		[1, new THREE.Color(1, 0, 0)]
	],
	// From chroma spectral http://gka.github.io/chroma.js/
	SPECTRAL: [
		[0, new THREE.Color(0.3686, 0.3098, 0.6353)],
		[0.1, new THREE.Color(0.1961, 0.5333, 0.7412)],
		[0.2, new THREE.Color(0.4000, 0.7608, 0.6471)],
		[0.3, new THREE.Color(0.6706, 0.8667, 0.6431)],
		[0.4, new THREE.Color(0.9020, 0.9608, 0.5961)],
		[0.5, new THREE.Color(1.0000, 1.0000, 0.7490)],
		[0.6, new THREE.Color(0.9961, 0.8784, 0.5451)],
		[0.7, new THREE.Color(0.9922, 0.6824, 0.3804)],
		[0.8, new THREE.Color(0.9569, 0.4275, 0.2627)],
		[0.9, new THREE.Color(0.8353, 0.2431, 0.3098)],
		[1, new THREE.Color(0.6196, 0.0039, 0.2588)]
	],
	PLASMA: [
		[0.0, new THREE.Color(0.241, 0.015, 0.610)],
		[0.1, new THREE.Color(0.387, 0.001, 0.654)],
		[0.2, new THREE.Color(0.524, 0.025, 0.653)],
		[0.3, new THREE.Color(0.651, 0.125, 0.596)],
		[0.4, new THREE.Color(0.752, 0.227, 0.513)],
		[0.5, new THREE.Color(0.837, 0.329, 0.431)],
		[0.6, new THREE.Color(0.907, 0.435, 0.353)],
		[0.7, new THREE.Color(0.963, 0.554, 0.272)],
		[0.8, new THREE.Color(0.992, 0.681, 0.195)],
		[0.9, new THREE.Color(0.987, 0.822, 0.144)],
		[1.0, new THREE.Color(0.940, 0.975, 0.131)]
	],
	YELLOW_GREEN: [
		[0, new THREE.Color(0.1647, 0.2824, 0.3451)],
		[0.1, new THREE.Color(0.1338, 0.3555, 0.4227)],
		[0.2, new THREE.Color(0.0610, 0.4319, 0.4864)],
		[0.3, new THREE.Color(0.0000, 0.5099, 0.5319)],
		[0.4, new THREE.Color(0.0000, 0.5881, 0.5569)],
		[0.5, new THREE.Color(0.1370, 0.6650, 0.5614)],
		[0.6, new THREE.Color(0.2906, 0.7395, 0.5477)],
		[0.7, new THREE.Color(0.4453, 0.8099, 0.5201)],
		[0.8, new THREE.Color(0.6102, 0.8748, 0.4850)],
		[0.9, new THREE.Color(0.7883, 0.9323, 0.4514)],
		[1, new THREE.Color(0.9804, 0.9804, 0.4314)]
	],
	VIRIDIS: [
		[0.0, new THREE.Color(0.267, 0.005, 0.329)],
		[0.1, new THREE.Color(0.283, 0.141, 0.458)],
		[0.2, new THREE.Color(0.254, 0.265, 0.530)],
		[0.3, new THREE.Color(0.207, 0.372, 0.553)],
		[0.4, new THREE.Color(0.164, 0.471, 0.558)],
		[0.5, new THREE.Color(0.128, 0.567, 0.551)],
		[0.6, new THREE.Color(0.135, 0.659, 0.518)],
		[0.7, new THREE.Color(0.267, 0.749, 0.441)],
		[0.8, new THREE.Color(0.478, 0.821, 0.318)],
		[0.9, new THREE.Color(0.741, 0.873, 0.150)],
		[1.0, new THREE.Color(0.993, 0.906, 0.144)]
	],
	INFERNO: [
		[0.0, new THREE.Color(0.077, 0.042, 0.206)],
		[0.1, new THREE.Color(0.225, 0.036, 0.388)],
		[0.2, new THREE.Color(0.373, 0.074, 0.432)],
		[0.3, new THREE.Color(0.522, 0.128, 0.420)],
		[0.4, new THREE.Color(0.665, 0.182, 0.370)],
		[0.5, new THREE.Color(0.797, 0.255, 0.287)],
		[0.6, new THREE.Color(0.902, 0.364, 0.184)],
		[0.7, new THREE.Color(0.969, 0.516, 0.063)],
		[0.8, new THREE.Color(0.988, 0.683, 0.072)],
		[0.9, new THREE.Color(0.961, 0.859, 0.298)],
		[1.0, new THREE.Color(0.988, 0.998, 0.645)]
	],
	GRAYSCALE: [
		[0, new THREE.Color(0, 0, 0)],
		[1, new THREE.Color(1, 1, 1)]
	]
};

Potree.Classification = {
	"DEFAULT":
	{
		0: new THREE.Vector4(0.5, 0.5, 0.5, 1.0),
		1: new THREE.Vector4(0.5, 0.5, 0.5, 1.0),
		2: new THREE.Vector4(0.63, 0.32, 0.18, 1.0),
		3: new THREE.Vector4(0.0, 1.0, 0.0, 1.0),
		4: new THREE.Vector4(0.0, 0.8, 0.0, 1.0),
		5: new THREE.Vector4(0.0, 0.6, 0.0, 1.0),
		6: new THREE.Vector4(1.0, 0.66, 0.0, 1.0),
		7: new THREE.Vector4(1.0, 0, 1.0, 1.0),
		8: new THREE.Vector4(1.0, 0, 0.0, 1.0),
		9: new THREE.Vector4(0.0, 0.0, 1.0, 1.0),
		12: new THREE.Vector4(1.0, 1.0, 0.0, 1.0),
		"DEFAULT": new THREE.Vector4(0.3, 0.6, 0.6, 0.5)
	}
};

Potree.PointSizeType = {
	FIXED: 0,
	ATTENUATED: 1,
	ADAPTIVE: 2
};

Potree.PointShape = {
	SQUARE: 0,
	CIRCLE: 1,
	PARABOLOID: 2
};

Potree.PointColorType = {
	RGB: 0,
	COLOR: 1,
	DEPTH: 2,
	HEIGHT: 3,
	ELEVATION: 3,
	INTENSITY: 4,
	INTENSITY_GRADIENT: 5,
	LOD: 6,
	LEVEL_OF_DETAIL: 6,
	POINT_INDEX: 7,
	CLASSIFICATION: 8,
	RETURN_NUMBER: 9,
	SOURCE: 10,
	NORMAL: 11,
	PHONG: 12,
	RGB_HEIGHT: 13,
	COMPOSITE: 50
};

Potree.TreeType = {
	OCTREE: 0,
	KDTREE: 1
};

Potree.utils = class
{
	static loadShapefileFeatures(file, callback)
	{
		let features = [];

		let handleFinish = () =>
		{
			callback(features);
		};

		shapefile.open(file)
			.then(source =>
			{
				source.read()
					.then(function log(result)
					{
						if(result.done)
						{
							handleFinish();
							return;
						}

						// console.log(result.value);

						if(result.value && result.value.type === "Feature" && result.value.geometry !== undefined)
						{
							features.push(result.value);
						}

						return source.read().then(log);
					});
			});
	}

	static toString(value)
	{
		if(value instanceof THREE.Vector3)
		{
			return value.x.toFixed(2) + ", " + value.y.toFixed(2) + ", " + value.z.toFixed(2);
		}
		else
		{
			return "" + value;
		}
	}

	static normalizeURL(url)
	{
		let u = new URL(url);

		return u.protocol + "//" + u.hostname + u.pathname.replace(/\/+/g, "/");
	};

	static pathExists(url)
	{
		let req = XHRFactory.createXMLHttpRequest();
		req.open("GET", url, false);
		req.send(null);
		if(req.status !== 200)
		{
			return false;
		}
		return true;
	};

	static debugSphere(parent, position, scale, color)
	{
		let geometry = new THREE.SphereGeometry(1, 8, 8);
		let material;

		if(color !== undefined)
		{
			material = new THREE.MeshBasicMaterial(
			{
				color: color
			});
		}
		else
		{
			material = new THREE.MeshNormalMaterial();
		}
		let sphere = new THREE.Mesh(geometry, material);
		sphere.position.copy(position);
		sphere.scale.set(scale, scale, scale);
		parent.add(sphere);
	}

	static debugLine(parent, start, end, color)
	{
		let material = new THREE.LineBasicMaterial(
		{
			color: color
		});
		let geometry = new THREE.Geometry();
		geometry.vertices.push(start, end);
		let tl = new THREE.Line(geometry, material);
		parent.add(tl);
	}

	/**
	 * adapted from mhluska at https://github.com/mrdoob/three.js/issues/1561
	 */
	static computeTransformedBoundingBox(box, transform)
	{
		let vertices = [
			new THREE.Vector3(box.min.x, box.min.y, box.min.z).applyMatrix4(transform),
			new THREE.Vector3(box.min.x, box.min.y, box.min.z).applyMatrix4(transform),
			new THREE.Vector3(box.max.x, box.min.y, box.min.z).applyMatrix4(transform),
			new THREE.Vector3(box.min.x, box.max.y, box.min.z).applyMatrix4(transform),
			new THREE.Vector3(box.min.x, box.min.y, box.max.z).applyMatrix4(transform),
			new THREE.Vector3(box.min.x, box.max.y, box.max.z).applyMatrix4(transform),
			new THREE.Vector3(box.max.x, box.max.y, box.min.z).applyMatrix4(transform),
			new THREE.Vector3(box.max.x, box.min.y, box.max.z).applyMatrix4(transform),
			new THREE.Vector3(box.max.x, box.max.y, box.max.z).applyMatrix4(transform)
		];

		let boundingBox = new THREE.Box3();
		boundingBox.setFromPoints(vertices);

		return boundingBox;
	};

	/**
	 * add separators to large numbers
	 *
	 * @param nStr
	 * @returns
	 */
	static addCommas(nStr)
	{
		nStr += "";
		let x = nStr.split(".");
		let x1 = x[0];
		let x2 = x.length > 1 ? "." + x[1] : "";
		let rgx = /(\d+)(\d{3})/;
		while(rgx.test(x1))
		{
			x1 = x1.replace(rgx, "$1" + "," + "$2");
		}
		return x1 + x2;
	};

	static removeCommas(str)
	{
		return str.replace(/,/g, "");
	}

	/**
	 * create worker from a string
	 *
	 * code from http://stackoverflow.com/questions/10343913/how-to-create-a-web-worker-from-a-string
	 */
	static createWorker(code)
	{
		let blob = new Blob([code],
		{
			type: "application/javascript"
		});
		let worker = new Worker(URL.createObjectURL(blob));

		return worker;
	};

	static getMousePointCloudIntersection(mouse, camera, viewer, pointclouds, params = {})
	{

		let renderer = viewer.renderer;

		let nmouse = {
			x: (mouse.x / renderer.domElement.clientWidth) * 2 - 1,
			y: -(mouse.y / renderer.domElement.clientHeight) * 2 + 1
		};

		let pickParams = {};

		if(params.pickClipped)
		{
			pickParams.pickClipped = params.pickClipped;
		}

		pickParams.x = mouse.x;
		pickParams.y = renderer.domElement.clientHeight - mouse.y;

		let raycaster = new THREE.Raycaster();
		raycaster.setFromCamera(nmouse, camera);
		let ray = raycaster.ray;

		let selectedPointcloud = null;
		let closestDistance = Infinity;
		let closestIntersection = null;
		let closestPoint = null;

		for(let pointcloud of pointclouds)
		{
			let point = pointcloud.pick(viewer, camera, ray, pickParams);

			if(!point)
			{
				continue;
			}

			let distance = camera.position.distanceTo(point.position);

			if(distance < closestDistance)
			{
				closestDistance = distance;
				selectedPointcloud = pointcloud;
				closestIntersection = point.position;
				closestPoint = point;
			}
		}

		if(selectedPointcloud)
		{
			return {
				location: closestIntersection,
				distance: closestDistance,
				pointcloud: selectedPointcloud,
				point: closestPoint
			};
		}
		else
		{
			return null;
		}
	};

	static pixelsArrayToImage(pixels, width, height)
	{
		let canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;

		let context = canvas.getContext("2d");

		pixels = new pixels.constructor(pixels);

		for(let i = 0; i < pixels.length; i++)
		{
			pixels[i * 4 + 3] = 255;
		}

		let imageData = context.createImageData(width, height);
		imageData.data.set(pixels);
		context.putImageData(imageData, 0, 0);

		let img = new Image();
		img.src = canvas.toDataURL();
		// img.style.transform = "scaleY(-1)";

		return img;
	};

	static pixelsArrayToDataUrl(pixels, width, height)
	{
		let canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;

		let context = canvas.getContext("2d");

		pixels = new pixels.constructor(pixels);

		for(let i = 0; i < pixels.length; i++)
		{
			pixels[i * 4 + 3] = 255;
		}

		let imageData = context.createImageData(width, height);
		imageData.data.set(pixels);
		context.putImageData(imageData, 0, 0);

		let dataURL = canvas.toDataURL();

		return dataURL;
	};

	static pixelsArrayToCanvas(pixels, width, height)
	{
		let canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;

		let context = canvas.getContext("2d");

		pixels = new pixels.constructor(pixels);

		//for (let i = 0; i < pixels.length; i++) {
		//	pixels[i * 4 + 3] = 255;
		//}

		// flip vertically
		let bytesPerLine = width * 4;
		for(let i = 0; i < parseInt(height / 2); i++)
		{
			let j = height - i - 1;

			let lineI = pixels.slice(i * bytesPerLine, i * bytesPerLine + bytesPerLine);
			let lineJ = pixels.slice(j * bytesPerLine, j * bytesPerLine + bytesPerLine);
			pixels.set(lineJ, i * bytesPerLine);
			pixels.set(lineI, j * bytesPerLine);
		}

		let imageData = context.createImageData(width, height);
		imageData.data.set(pixels);
		context.putImageData(imageData, 0, 0);

		return canvas;
	};

	static mouseToRay(mouse, camera, width, height)
	{

		let normalizedMouse = {
			x: (mouse.x / width) * 2 - 1,
			y: -(mouse.y / height) * 2 + 1
		};

		let vector = new THREE.Vector3(normalizedMouse.x, normalizedMouse.y, 0.5);
		let origin = new THREE.Vector3(normalizedMouse.x, normalizedMouse.y, 0);
		vector.unproject(camera);
		origin.unproject(camera);
		let direction = new THREE.Vector3().subVectors(vector, origin).normalize();

		let ray = new THREE.Ray(origin, direction);

		return ray;
	}

	static projectedRadius(radius, camera, distance, screenWidth, screenHeight)
	{
		if(camera instanceof THREE.OrthographicCamera)
		{
			return Potree.utils.projectedRadiusOrtho(radius, camera.projectionMatrix, screenWidth, screenHeight);
		}
		else if(camera instanceof THREE.PerspectiveCamera)
		{
			return Potree.utils.projectedRadiusPerspective(radius, camera.fov * Math.PI / 180, distance, screenHeight);
		}
		else
		{
			throw new Error("invalid parameters");
		}
	}

	static projectedRadiusPerspective(radius, fov, distance, screenHeight)
	{
		let projFactor = (1 / Math.tan(fov / 2)) / distance;
		projFactor = projFactor * screenHeight / 2;

		return radius * projFactor;
	};

	static projectedRadiusOrtho(radius, proj, screenWidth, screenHeight)
	{
		let p1 = new THREE.Vector4(0);
		let p2 = new THREE.Vector4(radius);

		p1.applyMatrix4(proj);
		p2.applyMatrix4(proj);
		p1 = new THREE.Vector3(p1.x, p1.y, p1.z);
		p2 = new THREE.Vector3(p2.x, p2.y, p2.z);
		p1.x = (p1.x + 1.0) * 0.5 * screenWidth;
		p1.y = (p1.y + 1.0) * 0.5 * screenHeight;
		p2.x = (p2.x + 1.0) * 0.5 * screenWidth;
		p2.y = (p2.y + 1.0) * 0.5 * screenHeight;
		return p1.distanceTo(p2);
	}

	static topView(camera, node)
	{
		camera.position.set(0, 1, 0);
		camera.rotation.set(-Math.PI / 2, 0, 0);
		camera.zoomTo(node, 1);
	};

	static frontView(camera, node)
	{
		camera.position.set(0, 0, 1);
		camera.rotation.set(0, 0, 0);
		camera.zoomTo(node, 1);
	};

	static leftView(camera, node)
	{
		camera.position.set(-1, 0, 0);
		camera.rotation.set(0, -Math.PI / 2, 0);
		camera.zoomTo(node, 1);
	};

	static rightView(camera, node)
	{
		camera.position.set(1, 0, 0);
		camera.rotation.set(0, Math.PI / 2, 0);
		camera.zoomTo(node, 1);
	};

	/**
	 *
	 * 0: no intersection
	 * 1: intersection
	 * 2: fully inside
	 */
	static frustumSphereIntersection(frustum, sphere)
	{
		let planes = frustum.planes;
		let center = sphere.center;
		let negRadius = -sphere.radius;

		let minDistance = Number.MAX_VALUE;

		for(let i = 0; i < 6; i++)
		{
			let distance = planes[i].distanceToPoint(center);

			if(distance < negRadius)
			{
				return 0;
			}

			minDistance = Math.min(minDistance, distance);
		}

		return(minDistance >= sphere.radius) ? 2 : 1;
	};

	// code taken from three.js
	// ImageUtils - generateDataTexture()
	static generateDataTexture(width, height, color)
	{
		let size = width * height;
		let data = new Uint8Array(4 * width * height);

		let r = Math.floor(color.r * 255);
		let g = Math.floor(color.g * 255);
		let b = Math.floor(color.b * 255);

		for(let i = 0; i < size; i++)
		{
			data[i * 3] = r;
			data[i * 3 + 1] = g;
			data[i * 3 + 2] = b;
		}

		let texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
		texture.needsUpdate = true;
		texture.magFilter = THREE.NearestFilter;

		return texture;
	};
};


Potree.Version = function(version)
{
	this.version = version;
	let vmLength = (version.indexOf(".") === -1) ? version.length : version.indexOf(".");
	this.versionMajor = parseInt(version.substr(0, vmLength));
	this.versionMinor = parseInt(version.substr(vmLength + 1));
	if(this.versionMinor.length === 0)
	{
		this.versionMinor = 0;
	}
};

Potree.Version.prototype.newerThan = function(version)
{
	let v = new Potree.Version(version);

	if(this.versionMajor > v.versionMajor)
	{
		return true;
	}
	else if(this.versionMajor === v.versionMajor && this.versionMinor > v.versionMinor)
	{
		return true;
	}
	else
	{
		return false;
	}
};

Potree.Version.prototype.equalOrHigher = function(version)
{
	let v = new Potree.Version(version);

	if(this.versionMajor > v.versionMajor)
	{
		return true;
	}
	else if(this.versionMajor === v.versionMajor && this.versionMinor >= v.versionMinor)
	{
		return true;
	}
	else
	{
		return false;
	}
};

Potree.Version.prototype.upTo = function(version)
{
	return !this.newerThan(version);
};

