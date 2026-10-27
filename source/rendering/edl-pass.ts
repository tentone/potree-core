import {
    Camera,
    FloatType,
    HalfFloatType,
    NearestFilter,
    Object3D,
    OrthographicCamera,
    PerspectiveCamera,
    RGBAFormat,
    Scene,
    UnsignedByteType,
    WebGLRenderer,
    WebGLRenderTarget,
} from 'three';

import { EyeDomeLightingMaterial } from '../materials/eye-dome-lighting-material';
import { PointCloudOctree } from '../point-cloud-octree';
import { ScreenPass } from './screen-pass';
import { RendererState } from './renderer-state';
import { ORTHOGRAPHIC_CAMERA } from '../constants';

export type EDLPassParams = {
    renderer: WebGLRenderer;
    scene: Object3D;
    camera: Camera;
    pointClouds?: PointCloudOctree[];
    pointCloudLayer?: number;
};

function isPerspectiveOrOrthographicCamera(camera: Camera): camera is PerspectiveCamera | OrthographicCamera {
    return (camera as PerspectiveCamera).isPerspectiveCamera === true || (camera as OrthographicCamera).isOrthographicCamera === true;
}

export class EDLPass {
    public edlStrength: number = 0.4;
    public radius: number = 1.4;
    public opacity: number = 1.0;
    public neighbourCount: number = 8;

    private rtEDL: WebGLRenderTarget;
    private rtTypeChecked = false;
    private edlMaterial: EyeDomeLightingMaterial;
    private screenPass: ScreenPass;
	private state = new RendererState();

    public constructor() {
        this.edlMaterial = new EyeDomeLightingMaterial();
        this.screenPass = new ScreenPass();

        this.rtEDL = new WebGLRenderTarget(1, 1, {
            minFilter: NearestFilter,
            magFilter: NearestFilter,
            format: RGBAFormat,
            type: HalfFloatType,
            depthBuffer: true,
        });

        // WebGL2 + float color buffers are required for robust quality.
        this.rtEDL.texture.generateMipmaps = false;
    }

    private ensureRenderTargetType(renderer: WebGLRenderer): void {
        if (this.rtTypeChecked) {
            return;
        }

        this.rtTypeChecked = true;

        const gl = renderer.getContext();
        const isWebGL2 = renderer.capabilities.isWebGL2 === true;

        // We encode depth in alpha, so we want as much precision as possible.
        // Prefer FloatType when WebGL2 + EXT_color_buffer_float is available.
        // Otherwise fall back to HalfFloatType (WebGL1: EXT_color_buffer_half_float),
        // and finally UnsignedByteType as a last resort.
        const hasColorBufferFloat = Boolean(
            gl.getExtension('EXT_color_buffer_float') ||
            gl.getExtension('WEBGL_color_buffer_float'),
        );
        const hasColorBufferHalfFloat = Boolean(gl.getExtension('EXT_color_buffer_half_float'));

        let desiredType: any = UnsignedByteType;
        if (isWebGL2 && hasColorBufferFloat) {
            desiredType = FloatType;
        } else if (!isWebGL2 && (hasColorBufferHalfFloat || hasColorBufferFloat)) {
            desiredType = HalfFloatType;
        }

        if (this.rtEDL.texture.type !== desiredType) {
            const w = this.rtEDL.width;
            const h = this.rtEDL.height;
            this.rtEDL.dispose();
            this.rtEDL = new WebGLRenderTarget(w, h, {
                minFilter: NearestFilter,
                magFilter: NearestFilter,
                format: RGBAFormat,
                type: desiredType,
                depthBuffer: true,
            });
            this.rtEDL.texture.generateMipmaps = false;
        }
    }

    public dispose(): void {
        this.rtEDL.dispose();

        // Three.js does not automatically release GPU resources on GC.
        // Explicitly dispose materials/geometry we own.
        this.edlMaterial.dispose();
        this.screenPass.dispose();
    }

	public render(params: EDLPassParams): void
	{
		const { renderer, scene, camera } = params;
		if (!isPerspectiveOrOrthographicCamera(camera))
		{
			throw new Error('EDLPass.render: camera must be PerspectiveCamera or OrthographicCamera');
		}
		const pointCloudLayer = params.pointCloudLayer ?? 1;
		this.ensureRenderTargetType(renderer);
		this.state.capture(renderer);
		this.rtEDL.setSize(Math.max(1, this.state.viewport.z), Math.max(1, this.state.viewport.w));
		if (this.edlMaterial.neighbourCount !== this.neighbourCount)
		{
			this.edlMaterial.neighbourCount = this.neighbourCount;
		}

		const oldLayerMask = camera.layers.mask;
		const background = scene instanceof Scene ? scene.background : null;
		try
		{
			renderer.autoClear = false;
			// Render to the caller's current target and viewport, including its depth.
			renderer.clear(true, true, true);
			camera.layers.mask = oldLayerMask & ~(1 << pointCloudLayer);
			renderer.render(scene, camera);

			// The scene background must not overwrite the offscreen occupancy marker.
			if (scene instanceof Scene) scene.background = null;
			renderer.setClearColor(0x000000, 1);
			renderer.setRenderTarget(this.rtEDL);
			renderer.clear(true, true, true);
			camera.layers.mask = 1 << pointCloudLayer;
			renderer.render(scene, camera);

			this.edlMaterial.uniforms.screenWidth.value = this.rtEDL.width;
			this.edlMaterial.uniforms.screenHeight.value = this.rtEDL.height;
			this.edlMaterial.uniforms.edlStrength.value = this.edlStrength;
			this.edlMaterial.uniforms.radius.value = this.radius;
			this.edlMaterial.uniforms.opacity.value = this.opacity;
			this.edlMaterial.uniforms.colorMap.value = this.rtEDL.texture;
			this.edlMaterial.setProjectionMatrix(camera.projectionMatrix);
			const capabilities = renderer.capabilities as typeof renderer.capabilities & {
				reversedDepthBuffer?: boolean;
				reverseDepthBuffer?: boolean;
			};
			const useReversedDepth = capabilities.reversedDepthBuffer === true || capabilities.reverseDepthBuffer === true;
			this.edlMaterial.uniforms.far.value = camera.far;
			this.edlMaterial.useLogDepth = renderer.capabilities.logarithmicDepthBuffer && !useReversedDepth;
			this.edlMaterial.useReversedDepth = useReversedDepth;
			this.edlMaterial.uniforms.useOrthographicCamera.value = camera.type === ORTHOGRAPHIC_CAMERA;

			this.state.bindTarget(renderer);
			this.screenPass.render(renderer, this.edlMaterial, this.state.target);
		}
		finally
		{
			if (scene instanceof Scene) scene.background = background;
			camera.layers.mask = oldLayerMask;
			this.state.restore(renderer);
		}
	}
}
