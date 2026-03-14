import {
    Camera,
    Color,
    FloatType,
    HalfFloatType,
    NearestFilter,
    Object3D,
    OrthographicCamera,
    PerspectiveCamera,
    RGBAFormat,
    UnsignedByteType,
    Vector2,
    WebGLRenderer,
    WebGLRenderTarget,
} from 'three';

import { EyeDomeLightingMaterial } from '../materials/eye-dome-lighting-material';
import { PointCloudOctree } from '../point-cloud-octree';
import { ScreenPass } from './screen-pass';
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
    private size = new Vector2();

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

    private resizeToRenderer(renderer: WebGLRenderer): void {
        renderer.getSize(this.size);
        const dpr = renderer.getPixelRatio();
        const width = Math.max(1, Math.floor(this.size.x * dpr));
        const height = Math.max(1, Math.floor(this.size.y * dpr));

        if (this.rtEDL.width !== width || this.rtEDL.height !== height) {
            this.rtEDL.setSize(width, height);
        }
    }

    public render(params: EDLPassParams): void {
        const { renderer, scene, camera } = params;
        const pointCloudLayer = params.pointCloudLayer ?? 1;

        this.ensureRenderTargetType(renderer);

        this.resizeToRenderer(renderer);

        // Ensure shader define counts are correct.
        if (this.edlMaterial.neighbourCount !== this.neighbourCount) {
            this.edlMaterial.neighbourCount = this.neighbourCount;
        }

        const oldAutoClear = renderer.autoClear;
        renderer.autoClear = false;

        const oldTarget = renderer.getRenderTarget();
        const oldLayerMask = camera.layers.mask;

        // Clear default framebuffer
        renderer.setRenderTarget(null);
        renderer.clear(true, true, true);

        // 1) Render everything the camera would normally render, except the point-cloud layer.
        // This respects user-defined layer masks.
        camera.layers.mask = oldLayerMask & ~(1 << pointCloudLayer);
        renderer.render(scene, camera);

        // 2) Render pointclouds into offscreen target.
        // Note: We intentionally do NOT mutate point-cloud materials here.
        // Material flags (e.g. `useEDL`) should be configured by the caller when enabling/disabling EDL.

        // Background marker: we clear alpha==1.0 so the EDL shader can discard background fragments.
        // Note: This matches upstream Potree behavior. In theory, the EDL alpha channel stores log2(linearDepth),
        // so alpha==1.0 can collide with real geometry when linearDepth==2.0 exactly.
        // We keep the upstream convention for visual parity; collisions are expected to be extremely rare in practice.
        const oldClearColor = new Color();
        renderer.getClearColor(oldClearColor);
        const oldClearAlpha = renderer.getClearAlpha();
        renderer.setClearColor(0x000000, 1);

        renderer.setRenderTarget(this.rtEDL);
        renderer.clear(true, true, true);

        renderer.setClearColor(oldClearColor, oldClearAlpha);
        camera.layers.mask = 1 << pointCloudLayer;
        renderer.render(scene, camera);

        // 3) EDL fullscreen pass (depth-tested against layer0 depth buffer)
        this.edlMaterial.uniforms.screenWidth.value = this.rtEDL.width;
        this.edlMaterial.uniforms.screenHeight.value = this.rtEDL.height;
        this.edlMaterial.uniforms.edlStrength.value = this.edlStrength;
        this.edlMaterial.uniforms.radius.value = this.radius;
        this.edlMaterial.uniforms.opacity.value = this.opacity;
        this.edlMaterial.uniforms.colorMap.value = this.rtEDL.texture;
        if (!isPerspectiveOrOrthographicCamera(camera)) {
            throw new Error('EDLPass.render: camera must be PerspectiveCamera or OrthographicCamera');
        }
        this.edlMaterial.setProjectionMatrix(camera.projectionMatrix);

        // Pass far plane and log depth flag so EDL shader can reconstruct depth in the correct format.
        this.edlMaterial.uniforms.far.value = camera.far;
        this.edlMaterial.uniforms.useLogDepth.value = renderer.capabilities.logarithmicDepthBuffer;
        this.edlMaterial.uniforms.useOrthographicCamera.value = camera.type === ORTHOGRAPHIC_CAMERA

        // Keep existing depth buffer from layer0 render.
        this.screenPass.render(renderer, this.edlMaterial, null);

        // restore state
        camera.layers.mask = oldLayerMask;
        renderer.setRenderTarget(oldTarget);
        renderer.autoClear = oldAutoClear;
    }
}
