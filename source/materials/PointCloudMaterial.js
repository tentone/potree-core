import {
	AdditiveBlending,
	AlwaysDepth,
	CanvasTexture,
	ClampToEdgeWrapping,
	Color,
	DataTexture,
	LessEqualDepth,
	LinearFilter,
	Matrix4,
	NearestFilter,
	NoBlending,
	RGBAFormat,
	ShaderMaterial,
	VertexColors
} from 'three';
import {HelperUtils} from '../utils/HelperUtils.js';
import {Gradients} from '../Gradients.js';
import {Classification, PointColorType, PointShape, PointSizeType, TreeType} from '../Potree.js';
import {Shaders} from './Shaders.js';

class PointCloudMaterial extends ShaderMaterial
{
	constructor(parameters = {})
	{
		super();

		this.extensions.derivatives = true;

		this.visibleNodesTexture = HelperUtils.generateDataTexture(2048, 1, new Color(0xffffff));
		this.visibleNodesTexture.minFilter = NearestFilter;
		this.visibleNodesTexture.magFilter = NearestFilter;

		const getValid = function(a, b)
		{
			return a !== undefined ? a : b;
		};

		const pointSize = getValid(parameters.size, 1.0);
		const minSize = getValid(parameters.minSize, 2.0);
		const maxSize = getValid(parameters.maxSize, 50.0);
		const treeType = getValid(parameters.treeType, TreeType.OCTREE);

		this._pointSizeType = PointSizeType.FIXED;
		this._shape = PointShape.SQUARE;
		this._pointColorType = PointColorType.RGB;
		this._weighted = false;
		this._gradient = Gradients.SPECTRAL;
		this._treeType = treeType;
		this._defaultIntensityRangeChanged = false;
		this._defaultElevationRangeChanged = false;

		this.gradientTexture = PointCloudMaterial.generateGradientTexture(this._gradient);
		this.lights = false;
		this.fog = false;
		this.defines = new Map();

		this.attributes =
		{
			position: {type: 'fv', value: []},
			color: {type: 'fv', value: []},
			normal: {type: 'fv', value: []},
			intensity: {type: 'f', value: []},
			classification: {type: 'f', value: []},
			returnNumber: {type: 'f', value: []},
			numberOfReturns: {type: 'f', value: []},
			pointSourceID: {type: 'f', value: []},
			indices: {type: 'fv', value: []}
		};

		this.uniforms =
		{
			projectionMatrix: {value: new Matrix4()},
			uViewInv: {value: new Matrix4()},
			clipPlanes: {value: []},
			level: {type: 'f', value: 0.0},
			vnStart: {type: 'f', value: 0.0},
			spacing: {type: 'f', value: 1.0},
			fov: {type: 'f', value: 1.0},
			uScreenWidth: {type: 'f', value: 1.0},
			uScreenHeight: {type: 'f', value: 1.0},
			uOctreeSpacing: {type: 'f', value: 0.0},
			near: {type: 'f', value: 0.1},
			far: {type: 'f', value: 1.0},
			uColor: {type: 'c', value: new Color( 0xffffff )},
			uOpacity: {type: 'f', value: 1.0},
			size: {type: 'f', value: pointSize},
			minSize: {type: 'f', value: minSize},
			maxSize: {type: 'f', value: maxSize},
			octreeSize: {type: 'f', value: 0},
			bbSize: {type: 'fv', value: [0, 0, 0]},
			elevationRange: {type: '2fv', value: [0, 0]},
			visibleNodes: {type: 't', value: this.visibleNodesTexture},
			gradient: {type: 't', value: this.gradientTexture},
			classificationLUT: {type: 't', value: null},
			diffuse: {type: 'fv', value: [1, 1, 1]},
			transition: {type: 'f', value: 0.5},
			intensityRange: {type: 'fv', value: [0, 65000]},
			intensityGamma: {type: 'f', value: 1},
			intensityContrast: {type: 'f', value: 0},
			intensityBrightness: {type: 'f', value: 0},
			rgbGamma: {type: 'f', value: 1},
			rgbBrightness: {type: 'f', value: 0},
			uTransition: {type: 'f', value: 0},
			wRGB: {type: 'f', value: 1},
			wIntensity: {type: 'f', value: 0},
			wElevation: {type: 'f', value: 0},
			wClassification: {type: 'f', value: 0},
			wReturnNumber: {type: 'f', value: 0},
			wSourceID: {type: 'f', value: 0},
			logDepthBufFC: {type: 'f', value: 0},
			uPCIndex: {value: 0.0}
		};

		this.classification = Classification.DEFAULT;
		this.defaultAttributeValues.normal = [0, 0, 0];
		this.defaultAttributeValues.classification = [0, 0, 0];
		this.defaultAttributeValues.indices = [0, 0, 0, 0];

		this.defines = this.getDefines();
		this.vertexColors = VertexColors;

		this.vertexShader = Shaders.vertex;
		this.fragmentShader = Shaders.fragment;
	}

	setDefine(key, value)
	{
		if (value !== undefined && value !== null)
		{
			if (this.defines.get(key) !== value)
			{
				this.defines.set(key, value);
				this.updateMaterial();
			}
		}
		else
		{
			this.removeDefine(key);
		}
	}

	removeDefine(key)
	{
		this.defines.delete(key);
	}

	updateMaterial()
	{
		this.defines = this.getDefines();

		if (this.opacity === 1.0)
		{
			this.blending = NoBlending;
			this.transparent = false;
			this.depthTest = true;
			this.depthWrite = true;
			this.depthFunc = LessEqualDepth;
		}
		else
		{
			this.blending = AdditiveBlending;
			this.transparent = true;
			this.depthTest = false;
			this.depthWrite = true;
			this.depthFunc = AlwaysDepth;
		}

		if (this.weighted)
		{
			this.blending = AdditiveBlending;
			this.transparent = true;
			this.depthTest = true;
			this.depthWrite = false;
		}

		this.needsUpdate = true;
	}

	onBeforeCompile(shader, renderer)
	{
		if (renderer.capabilities.logarithmicDepthBuffer)
		{
			this.defines = {...this.defines, USE_LOGDEPTHBUF: true, USE_LOGDEPTHBUF_EXT: true, EPSILON: 1e-6};
		}
	}

	getDefines()
	{
		const pointSizeTypes = [];
		pointSizeTypes[PointSizeType.FIXED] = {fixed_point_size: true};
		pointSizeTypes[PointSizeType.ATTENUATED] = {attenuated_point_size: true};
		pointSizeTypes[PointSizeType.ADAPTIVE] = {adaptive_point_size: true};

		const pointShapes = [];
		pointShapes[PointShape.SQUARE] = {square_point_shape: true};
		pointShapes[PointShape.CIRCLE] = {circle_point_shape: true};
		pointShapes[PointShape.PARABOLOID] = {paraboloid_point_shape: true};

		const pointColorTypes = [];
		pointColorTypes[PointColorType.RGB] = {color_type_rgb: true};
		pointColorTypes[PointColorType.COLOR] = {color_type_color: true};
		pointColorTypes[PointColorType.DEPTH] = {color_type_depth: true};
		pointColorTypes[PointColorType.COLOR] = {color_type_color: true};
		pointColorTypes[PointColorType.HEIGHT] = {color_type_height: true};
		pointColorTypes[PointColorType.INTENSITY] = {color_type_intensity: true};
		pointColorTypes[PointColorType.INTENSITY_GRADIENT] = {color_type_intensity_gradient: true};
		pointColorTypes[PointColorType.POINT_INDEX] = {color_type_point_index: true};
		pointColorTypes[PointColorType.CLASSIFICATION] = {color_type_classification: true};
		pointColorTypes[PointColorType.RETURN_NUMBER] = {color_type_return_number: true};
		pointColorTypes[PointColorType.SOURCE] = {color_type_source: true};
		pointColorTypes[PointColorType.NORMAL] = {color_type_normal: true};
		pointColorTypes[PointColorType.RGB] = {color_type_rgb: true};
		pointColorTypes[PointColorType.PHONG] = {color_type_phong: true};
		pointColorTypes[PointColorType.RGB_HEIGHT] = {color_type_rgb_height: true};
		pointColorTypes[PointColorType.COMPOSITE] = {color_type_composite: true};

		const treeTypes = [];
		treeTypes[TreeType.OCTREE] = {tree_type_octree: true};
		treeTypes[TreeType.KDTREE] = {tree_type_kdtree: true};

		return {
			...pointSizeTypes[this.pointSizeType],
			...pointShapes[this.shape],
			...pointColorTypes[this._pointColorType],
			...treeTypes[this.treeType],
			...this.weighted ? {weighted_splats: true} : {}
		};
	}

	get gradient()
	{
		return this._gradient;
	}

	set gradient(value)
	{
		if (this._gradient !== value)
		{
			this._gradient = value;
			this.gradientTexture = PointCloudMaterial.generateGradientTexture(this._gradient);
			this.uniforms.gradient.value = this.gradientTexture;
		}
	}

	get classification()
	{
		return this._classification;
	}

	set classification(value)
	{
		const copy = {};
		for (var key of Object.keys(value))
		{
			copy[key] = value[key].clone();
		}

		let isEqual = false;
		if (this._classification === undefined)
		{
			isEqual = false;
		}
		else
		{
			isEqual = Object.keys(copy).length === Object.keys(this._classification).length;
			for (var key of Object.keys(copy))
			{
				isEqual = isEqual && this._classification[key] !== undefined;
				isEqual = isEqual && copy[key].equals(this._classification[key]);
			}
		}

		if (!isEqual)
		{
			this._classification = copy;
			this.recomputeClassification();
		}
	}

	recomputeClassification()
	{
		this.classificationTexture = PointCloudMaterial.generateClassificationTexture(this._classification);
		this.uniforms.classificationLUT.value = this.classificationTexture;
		this.dispatchEvent(
			{
				type: 'material_property_changed',
				target: this
			});
	}

	get spacing()
	{
		return this.uniforms.spacing.value;
	}

	set spacing(value)
	{
		if (this.uniforms.spacing.value !== value)
		{
			this.uniforms.spacing.value = value;
		}
	}

	get weighted()
	{
		return this._weighted;
	}

	set weighted(value)
	{
		if (this._weighted !== value)
		{
			this._weighted = value;
			this.updateMaterial();
		}
	}

	get fov()
	{
		return this.uniforms.fov.value;
	}

	set fov(value)
	{
		if (this.uniforms.fov.value !== value)
		{
			this.uniforms.fov.value = value;
			this.updateMaterial();
		}
	}

	get screenWidth()
	{
		return this.uniforms.screenWidth.value;
	}

	set screenWidth(value)
	{
		if (this.uniforms.screenWidth.value !== value)
		{
			this.uniforms.screenWidth.value = value;
			this.updateMaterial();
		}
	}

	get screenHeight()
	{
		return this.uniforms.screenHeight.value;
	}

	set screenHeight(value)
	{
		if (this.uniforms.screenHeight.value !== value)
		{
			this.uniforms.screenHeight.value = value;
			this.updateMaterial();
		}
	}

	get near()
	{
		return this.uniforms.near.value;
	}

	set near(value)
	{
		if (this.uniforms.near.value !== value)
		{
			this.uniforms.near.value = value;
		}
	}

	get far()
	{
		return this.uniforms.far.value;
	}

	set far(value)
	{
		if (this.uniforms.far.value !== value)
		{
			this.uniforms.far.value = value;
		}
	}

	get opacity()
	{
		return this.uniforms.uOpacity.value;
	}

	set opacity(value)
	{
		if (this.uniforms && this.uniforms.uOpacity)
		{
			if (this.uniforms.uOpacity.value !== value)
			{
				this.uniforms.uOpacity.value = value;
				this.updateMaterial();
				this.dispatchEvent(
					{
						type: 'opacity_changed',
						target: this
					});
				this.dispatchEvent(
					{
						type: 'material_property_changed',
						target: this
					});
			}
		}
	}

	get pointColorType()
	{
		return this._pointColorType;
	}

	set pointColorType(value)
	{
		if (this._pointColorType !== value)
		{
			this._pointColorType = value;
			this.updateMaterial();
			this.dispatchEvent(
				{
					type: 'point_color_type_changed',
					target: this
				});
			this.dispatchEvent(
				{
					type: 'material_property_changed',
					target: this
				});
		}
	}

	get pointSizeType()
	{
		return this._pointSizeType;
	}

	set pointSizeType(value)
	{
		if (this._pointSizeType !== value)
		{
			this._pointSizeType = value;
			this.updateMaterial();
			this.dispatchEvent(
				{
					type: 'point_size_type_changed',
					target: this
				});
			this.dispatchEvent(
				{
					type: 'material_property_changed',
					target: this
				});
		}
	}

	get color()
	{
		return this.uniforms.uColor.value;
	}

	set color(value)
	{
		if (!this.uniforms.uColor.value.equals(value))
		{
			this.uniforms.uColor.value.copy(value);
			this.dispatchEvent(
				{
					type: 'color_changed',
					target: this
				});
			this.dispatchEvent(
				{
					type: 'material_property_changed',
					target: this
				});
		}
	}

	get shape()
	{
		return this._shape;
	}

	set shape(value)
	{
		if (this._shape !== value)
		{
			this._shape = value;
			this.updateMaterial();
			this.dispatchEvent(
				{
					type: 'point_shape_changed',
					target: this
				});
			this.dispatchEvent(
				{
					type: 'material_property_changed',
					target: this
				});
		}
	}

	get treeType()
	{
		return this._treeType;
	}

	set treeType(value)
	{
		if (this._treeType !== value)
		{
			this._treeType = value;
			this.updateMaterial();
		}
	}

	get bbSize()
	{
		return this.uniforms.bbSize.value;
	}

	set bbSize(value)
	{
		this.uniforms.bbSize.value = value;
	}

	get size()
	{
		return this.uniforms.size.value;
	}

	set size(value)
	{
		if (this.uniforms.size.value !== value)
		{
			this.uniforms.size.value = value;
			this.dispatchEvent(
				{
					type: 'point_size_changed',
					target: this
				});
			this.dispatchEvent(
				{
					type: 'material_property_changed',
					target: this
				});
		}
	}

	get elevationRange()
	{
		return this.uniforms.elevationRange.value;
	}

	set elevationRange(value)
	{
		const changed = this.uniforms.elevationRange.value[0] !== value[0] ||
			this.uniforms.elevationRange.value[1] !== value[1];
		if (changed)
		{
			this.uniforms.elevationRange.value = value;
			this._defaultElevationRangeChanged = true;
			this.dispatchEvent(
				{
					type: 'material_property_changed',
					target: this
				});
		}
	}

	get heightMin()
	{
		return this.uniforms.elevationRange.value[0];
	}

	set heightMin(value)
	{
		this.elevationRange = [value, this.elevationRange[1]];
	}

	get heightMax()
	{
		return this.uniforms.elevationRange.value[1];
	}

	set heightMax(value)
	{
		this.elevationRange = [this.elevationRange[0], value];
	}

	get transition()
	{
		return this.uniforms.transition.value;
	}

	set transition(value)
	{
		this.uniforms.transition.value = value;
	}

	get intensityRange()
	{
		return this.uniforms.intensityRange.value;
	}

	set intensityRange(value)
	{
		if (!(value instanceof Array && value.length === 2))
		{
			return;
		}

		if (value[0] === this.uniforms.intensityRange.value[0] && value[1] === this.uniforms.intensityRange.value[1])
		{
			return;
		}

		this.uniforms.intensityRange.value = value;
		this._defaultIntensityRangeChanged = true;

		this.dispatchEvent(
			{
				type: 'material_property_changed',
				target: this
			});
	}

	get intensityGamma()
	{
		return this.uniforms.intensityGamma.value;
	}

	set intensityGamma(value)
	{
		if (this.uniforms.intensityGamma.value !== value)
		{
			this.uniforms.intensityGamma.value = value;
			this.dispatchEvent(
				{
					type: 'material_property_changed',
					target: this
				});
		}
	}

	get intensityContrast()
	{
		return this.uniforms.intensityContrast.value;
	}

	set intensityContrast(value)
	{
		if (this.uniforms.intensityContrast.value !== value)
		{
			this.uniforms.intensityContrast.value = value;
			this.dispatchEvent(
				{
					type: 'material_property_changed',
					target: this
				});
		}
	}

	get intensityBrightness()
	{
		return this.uniforms.intensityBrightness.value;
	}

	set intensityBrightness(value)
	{
		if (this.uniforms.intensityBrightness.value !== value)
		{
			this.uniforms.intensityBrightness.value = value;
			this.dispatchEvent(
				{
					type: 'material_property_changed',
					target: this
				});
		}
	}

	get rgbGamma()
	{
		return this.uniforms.rgbGamma.value;
	}

	set rgbGamma(value)
	{
		if (this.uniforms.rgbGamma.value !== value)
		{
			this.uniforms.rgbGamma.value = value;
			this.dispatchEvent(
				{
					type: 'material_property_changed',
					target: this
				});
		}
	}

	// get rgbContrast()
	// {
	// 	return this.uniforms.rgbContrast.value;
	// }

	// set rgbContrast(value)
	// {
	// 	if(this.uniforms.rgbContrast.value !== value)
	// 	{
	// 		this.uniforms.rgbContrast.value = value;
	// 		this.dispatchEvent(
	// 		{
	// 			type: "material_property_changed",
	// 			target: this
	// 		});
	// 	}
	// }

	get rgbBrightness()
	{
		return this.uniforms.rgbBrightness.value;
	}

	set rgbBrightness(value)
	{
		if (this.uniforms.rgbBrightness.value !== value)
		{
			this.uniforms.rgbBrightness.value = value;
			this.dispatchEvent(
				{
					type: 'material_property_changed',
					target: this
				});
		}
	}

	get weightRGB()
	{
		return this.uniforms.wRGB.value;
	}

	set weightRGB(value)
	{
		if (this.uniforms.wRGB.value !== value)
		{
			this.uniforms.wRGB.value = value;
			this.dispatchEvent(
				{
					type: 'material_property_changed',
					target: this
				});
		}
	}

	get weightIntensity()
	{
		return this.uniforms.wIntensity.value;
	}

	set weightIntensity(value)
	{
		if (this.uniforms.wIntensity.value !== value)
		{
			this.uniforms.wIntensity.value = value;
			this.dispatchEvent(
				{
					type: 'material_property_changed',
					target: this
				});
		}
	}

	get weightElevation()
	{
		return this.uniforms.wElevation.value;
	}

	set weightElevation(value)
	{
		if (this.uniforms.wElevation.value !== value)
		{
			this.uniforms.wElevation.value = value;
			this.dispatchEvent(
				{
					type: 'material_property_changed',
					target: this
				});
		}
	}

	get weightClassification()
	{
		return this.uniforms.wClassification.value;
	}

	set weightClassification(value)
	{
		if (this.uniforms.wClassification.value !== value)
		{
			this.uniforms.wClassification.value = value;
			this.dispatchEvent(
				{
					type: 'material_property_changed',
					target: this
				});
		}
	}

	get weightReturnNumber()
	{
		return this.uniforms.wReturnNumber.value;
	}

	set weightReturnNumber(value)
	{
		if (this.uniforms.wReturnNumber.value !== value)
		{
			this.uniforms.wReturnNumber.value = value;
			this.dispatchEvent(
				{
					type: 'material_property_changed',
					target: this
				});
		}
	}

	get weightSourceID()
	{
		return this.uniforms.wSourceID.value;
	}

	set weightSourceID(value)
	{
		if (this.uniforms.wSourceID.value !== value)
		{
			this.uniforms.wSourceID.value = value;
			this.dispatchEvent(
				{
					type: 'material_property_changed',
					target: this
				});
		}
	}

	static generateGradientTexture(gradient)
	{
		const size = 64;

		// Create canvas
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;

		// Get context
		const context = canvas.getContext('2d');

		// Draw gradient
		context.rect(0, 0, size, size);
		const ctxGradient = context.createLinearGradient(0, 0, size, size);
		for (let i = 0; i < gradient.length; i++)
		{
			const step = gradient[i];
			ctxGradient.addColorStop(step[0], '#' + step[1].getHexString());
		}
		context.fillStyle = ctxGradient;
		context.fill();

		const texture = new CanvasTexture(canvas);
		texture.needsUpdate = true;
		texture.minFilter = LinearFilter;

		return texture;
	}

	static generateClassificationTexture(classification)
	{
		const width = 256;
		const height = 256;
		const size = width * height;
		const data = new Uint8Array(4 * size);
		for (let x = 0; x < width; x++)
		{
			for (let y = 0; y < height; y++)
			{
				const i = x + width * y;
				let color;
				if (classification[x])
				{
					color = classification[x];
				}
				else if (classification[x % 32])
				{
					color = classification[x % 32];
				}
				else
				{
					color = classification.DEFAULT;
				}
				data[4 * i] = 255 * color.x;
				data[4 * i + 1] = 255 * color.y;
				data[4 * i + 2] = 255 * color.z;
				data[4 * i + 3] = 255 * color.w;
			}
		}
		const texture = new DataTexture(data, width, height, RGBAFormat);
		texture.magFilter = NearestFilter;
		texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
		texture.needsUpdate = true;
		return texture;
	}

	disableEvents()
	{
		if (this._hiddenListeners === undefined)
		{
			this._hiddenListeners = this._listeners;
			this._listeners = {};
		}
	}

	enableEvents()
	{
		this._listeners = this._hiddenListeners;
		this._hiddenListeners = undefined;
	}

	copyFrom(from)
	{
		for (const name of this.uniforms)
		{
			this.uniforms[name].value = from.uniforms[name].value;
		}
	}
}

export {PointCloudMaterial};
