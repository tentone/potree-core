import {
	Camera,
	FloatType,
	GLSL3,
	Matrix4,
	NearestFilter,
	NoBlending,
	NormalBlending,
	OrthographicCamera,
	PerspectiveCamera,
	RawShaderMaterial,
	RedFormat,
	WebGLMultipleRenderTargets,
	WebGLRenderer,
	WebGLRenderTarget,
} from 'three';
import { ClipMode } from '../materials/clipping';
import { PointColorType } from '../materials/enums';
import { PointCloudOctree } from '../point-cloud-octree';
import { ScreenPass } from './screen-pass';
import { RendererState } from './renderer-state';

const vertexShader: string = require('../materials/shaders/edl.vs').default;
const dilationShader: string = require('../materials/shaders/closed-dilate.fs').default;
const erosionShader: string = require('../materials/shaders/closed-erode.fs').default;
const compositeShader: string = require('../materials/shaders/closed-composite.fs').default;

/** Screen-space reconstruction settings used by PointShape.CLOSED. */
export interface ClosedPointOptions
{
	/** Square-kernel radius in physical pixels, rounded to the nearest integer. Default: 2. */
	radius?: number;

	/** Maximum relative view-depth difference for interpolation. Default: 0.02 (2%). */
	depthThreshold?: number;
}

interface ClosedEDLOptions
{
	enabled: boolean;
	strength?: number;
	radius?: number;
	opacity?: number;
	neighbourCount?: number;
}

// The r152 typings omit inherited render-target fields from the MRT declaration.
type SurfaceTarget = WebGLMultipleRenderTargets & Pick<WebGLRenderTarget, 'viewport'>;

function createTarget(depthBuffer: boolean): SurfaceTarget
{
	const target = new WebGLMultipleRenderTargets(1, 1, 2, {
		type: FloatType,
		minFilter: NearestFilter,
		magFilter: NearestFilter,
		depthBuffer,
		stencilBuffer: false,
	}) as SurfaceTarget;
	for (const texture of target.texture) texture.generateMipmaps = false;
	return target;
}

/** Internal GPU resources, reused sequentially across clouds to keep memory bounded. */
export class ClosedPointPass
{
	private samples = createTarget(true);
	private dilated = createTarget(false);
	private closedMask = new WebGLRenderTarget(1, 1, {
		format: RedFormat,
		minFilter: NearestFilter,
		magFilter: NearestFilter,
		depthBuffer: false,
		stencilBuffer: false,
	});
	private screenPass = new ScreenPass();
	private state = new RendererState();
	private erosion = new RawShaderMaterial({
		glslVersion: GLSL3,
		vertexShader,
		fragmentShader: erosionShader,
		depthTest: false,
		depthWrite: false,
		blending: NoBlending,
		uniforms: {
			normalDepthMap: { value: this.dilated.texture[1] },
			radius: { value: 2 },
		},
	});
	private dilation = new RawShaderMaterial({
		glslVersion: GLSL3,
		vertexShader,
		fragmentShader: dilationShader,
		depthTest: false,
		depthWrite: false,
		blending: NoBlending,
		uniforms: {
			colorMap: { value: this.samples.texture[0] },
			normalDepthMap: { value: this.samples.texture[1] },
			radius: { value: 2 },
			depthThreshold: { value: 0.02 },
		},
	});
	private composite = new RawShaderMaterial({
		glslVersion: GLSL3,
		vertexShader,
		fragmentShader: compositeShader,
		depthTest: true,
		depthWrite: true,
		transparent: true,
		blending: NormalBlending,
		defines: {
			CLIP_DISABLED: ClipMode.DISABLED,
			CLIP_OUTSIDE: ClipMode.CLIP_OUTSIDE,
			CLIP_INSIDE: ClipMode.CLIP_INSIDE,
			CLIP_HIGHLIGHT: ClipMode.HIGHLIGHT_INSIDE,
		},
		uniforms: {
			colorMap: { value: this.dilated.texture[0] },
			normalDepthMap: { value: this.dilated.texture[1] },
			closedMask: { value: this.closedMask.texture },
			sourceNormalDepth: { value: this.samples.texture[1] },
			radius: { value: 2 },
			depthThreshold: { value: 0.02 },
			uProj: { value: new Matrix4() },
			inverseProjection: { value: new Matrix4() },
			cameraWorld: { value: new Matrix4() },
			far: { value: 1000 },
			orthographic: { value: false },
			logDepth: { value: false },
			reversedDepth: { value: false },
			showNormals: { value: false },
			edlEnabled: { value: false },
			edlStrength: { value: 0.4 },
			edlRadius: { value: 1.4 },
			edlOpacity: { value: 1 },
			neighbourCount: { value: 8 },
			clipMode: { value: ClipMode.DISABLED },
			clipBoxes: { value: new Float32Array(30 * 16) },
			clipBoxModes: { value: new Float32Array(30) },
			clipSpheres: { value: new Float32Array(30 * 4) },
			clipSphereModes: { value: new Float32Array(30) },
			clipPlanes: { value: new Float32Array(30 * 4) },
		},
	});

	/** Release all owned targets, materials and fullscreen geometry. */
	public dispose(): void
	{
		this.samples.dispose();
		this.dilated.dispose();
		this.closedMask.dispose();
		this.erosion.dispose();
		this.dilation.dispose();
		this.composite.dispose();
		this.screenPass.dispose();
	}

	/** Validate before rendering the scene so unsupported hardware fails without changing state. */
	public validate(renderer: WebGLRenderer, camera: Camera): void
	{
		if (!(camera instanceof PerspectiveCamera || camera instanceof OrthographicCamera))
		{
			throw new Error('PointShape.CLOSED requires a perspective or orthographic camera.');
		}
		if (!renderer.capabilities.isWebGL2 || !renderer.extensions.has('EXT_color_buffer_float'))
		{
			throw new Error('PointShape.CLOSED requires WebGL2 and EXT_color_buffer_float.');
		}
	}

	/** Reconstruct one cloud and composite into the current target without clearing its depth. */
	public render(
		renderer: WebGLRenderer,
		cloud: PointCloudOctree,
		camera: Camera,
		options: ClosedPointOptions,
		edl: ClosedEDLOptions,
	): void
	{
		this.validate(renderer, camera);
		const requestedRadius = options.radius ?? 2;
		const requestedThreshold = options.depthThreshold ?? 0.02;
		
		const radius = Number.isFinite(requestedRadius) ? Math.round(requestedRadius) : 2;
		const threshold = Number.isFinite(requestedThreshold) ? Math.max(0, requestedThreshold) : 0.02;

		this.state.capture(renderer);
		const width = Math.max(1, this.state.viewport.z);
		const height = Math.max(1, this.state.viewport.w);
		// Padding gives erosion the dilation outside the viewport, preserving edge samples.
		this.samples.setSize(width + 2 * radius, height + 2 * radius);
		this.dilated.setSize(width + 2 * radius, height + 2 * radius);
		this.closedMask.setSize(width + 2 * radius, height + 2 * radius);
		this.samples.viewport.set(radius, radius, width, height);

		const material = cloud.material;
		const oldBlending = material.blending;
		const oldTransparent = material.transparent;
		const oldDepthTest = material.depthTest;
		const oldDepthWrite = material.depthWrite;
		try
		{
			renderer.autoClear = false;
			renderer.setClearColor(0x000000, 0);
			renderer.setScissorTest(false);
			renderer.setRenderTarget(this.samples);
			renderer.clear(true, true, false);
			material.blending = NoBlending;
			material.transparent = false;
			material.depthTest = true;
			material.depthWrite = true;
			renderer.render(cloud, camera);

			this.dilation.uniforms.radius.value = radius;
			this.dilation.uniforms.depthThreshold.value = threshold;
			this.screenPass.render(renderer, this.dilation, this.dilated);
			this.erosion.uniforms.radius.value = radius;
			this.screenPass.render(renderer, this.erosion, this.closedMask);

			const uniforms = this.composite.uniforms;
			uniforms.radius.value = radius;
			uniforms.depthThreshold.value = threshold;
			uniforms.uProj.value.copy(camera.projectionMatrix);
			uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
			uniforms.cameraWorld.value.copy(camera.matrixWorld);
			uniforms.far.value = (camera as PerspectiveCamera | OrthographicCamera).far;
			uniforms.orthographic.value = camera instanceof OrthographicCamera;
			const capabilities = renderer.capabilities as typeof renderer.capabilities & {
				reversedDepthBuffer?: boolean;
				reverseDepthBuffer?: boolean;
			};
			uniforms.reversedDepth.value = capabilities.reversedDepthBuffer === true || capabilities.reverseDepthBuffer === true;
			uniforms.logDepth.value = renderer.capabilities.logarithmicDepthBuffer && !uniforms.reversedDepth.value;
			uniforms.showNormals.value = material.pointColorType === PointColorType.NORMAL;
			uniforms.edlEnabled.value = edl.enabled;
			uniforms.edlStrength.value = edl.strength ?? 0.4;
			uniforms.edlRadius.value = edl.radius ?? 1.4;
			uniforms.edlOpacity.value = edl.opacity ?? 1;
			const neighbourCount = edl.neighbourCount ?? 8;
			uniforms.neighbourCount.value = Number.isFinite(neighbourCount) ? Math.max(1, Math.floor(neighbourCount)) : 8;
			uniforms.clipMode.value = material.clipMode;
			for (const name of ['clipBoxCount', 'clipSphereCount', 'clipPlaneCount'])
			{
				uniforms[name] = material.uniforms[name];
			}
			for (const name of ['clipBoxes', 'clipBoxModes', 'clipSpheres', 'clipSphereModes', 'clipPlanes'])
			{
				uniforms[name].value.set(material.uniforms[name].value);
			}
			this.state.bindTarget(renderer);
			this.screenPass.render(renderer, this.composite, this.state.target);
		}
		finally
		{
			material.blending = oldBlending;
			material.transparent = oldTransparent;
			material.depthTest = oldDepthTest;
			material.depthWrite = oldDepthWrite;
			this.state.restore(renderer);
		}
	}
}
