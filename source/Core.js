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

Potree.WebGLBuffer = class WebGLBuffer
{
	constructor()
	{
		this.numElements = 0;
		this.vao = null;
		this.vbos = new Map();
	}
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
