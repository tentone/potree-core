import { Camera, Object3D, WebGLRenderer } from 'three';

import { PointCloudMaterial } from '../materials/point-cloud-material';
import { PointShape } from '../materials/enums';
import { PointCloudOctree } from '../point-cloud-octree';
import { Potree } from '../potree';
import { IVisibilityUpdateResult } from '../types';
import { EDLPass } from './edl-pass';
import { ClosedPointOptions, ClosedPointPass } from './closed-point-pass';

export type { ClosedPointOptions } from './closed-point-pass';

/**
 * Configuration for Eye-Dome Lighting (EDL) rendering.
 *
 * Note: EDL is a multi-pass / post-process effect (render default layer 0 (non-pointcloud), render point clouds to an offscreen target,
 * then composite). Therefore it cannot be expressed as a single `renderer.render(scene, camera)` call.
 */
export type PotreeRendererEDLOptions = {
    enabled: boolean;
    /** Defaults to 1 so layer 0 can remain reserved for non-pointcloud content in the first pass. */
    pointCloudLayer?: number;
    strength?: number;
    radius?: number;
    opacity?: number;
    neighbourCount?: number;
};

/**
 * Options for {@link PotreeRenderer}.
 *
 * This is intentionally additive and does not change existing Potree APIs.
 */
export type PotreeRendererOptions = {
    edl?: PotreeRendererEDLOptions;
	/** Reconstruction settings for clouds using PointShape.CLOSED. */
	closed?: ClosedPointOptions;
};

/**
 * Parameters required to render a frame.
 */
export type PotreeRendererRenderParams = {
    renderer: WebGLRenderer;
    scene: Object3D;
    camera: Camera;
    pointClouds?: PointCloudOctree[];
};

/**
 * Thin helper that renders Potree point clouds.
 *
 * Why this exists:
 * - Without EDL, users typically do: `potree.updatePointClouds(...)` then `renderer.render(scene, camera)`.
 * - With EDL enabled, users previously had to manually:
 *   1) keep point-cloud objects on a dedicated layer, and
 *   2) run `EDLPass.render(...)` instead of `renderer.render(...)`.
 *
 * `PotreeRenderer` keeps that wiring in one place while preserving backward compatibility.
 */
export class PotreeRenderer {
	private closedPass: ClosedPointPass | null = null;
	private closedOptions: ClosedPointOptions = {};
	private closedClouds: PointCloudOctree[] = [];
    private edlPass: EDLPass | null = null;
    private edlOptions: PotreeRendererEDLOptions = { enabled: false, pointCloudLayer: 1 };
    private lastPointClouds: PointCloudOctree[] | null = null;
    private overriddenMaterials = new WeakMap<PointCloudMaterial, { useEDL: boolean; weighted: boolean }>();
    private overriddenLayerMasks = new WeakMap<PointCloudOctree, number>();

    public constructor(options: PotreeRendererOptions = {}) {
		if (options.closed) this.setClosed(options.closed);
        if (options.edl) {
            this.setEDL(options.edl);
        }
    }

    /** Releases internally owned GPU resources (render targets). */
    public dispose(): void {
		this.closedPass?.dispose();
		this.closedPass = null;
		this.closedClouds.length = 0;
		if (this.lastPointClouds) this.applyEDLState(this.lastPointClouds, false);
		this.lastPointClouds = null;
        this.edlPass?.dispose();
        this.edlPass = null;
    }

	/**
	 * Set the square closing radius (physical pixels) and relative depth tolerance.
     * 
	 * Missing settings retain their previous values. Defaults are radius 2 and tolerance 0.02.
	 */
	public setClosed(options: ClosedPointOptions): void
	{
		this.closedOptions = { ...this.closedOptions, ...options };
	}

    /**
     * Enables/disables EDL and updates EDL parameters.
     *
     * This method is safe to call at runtime (e.g. toggling EDL on/off).
     */
    public setEDL(options: PotreeRendererEDLOptions): void {
        const prevEnabled = Boolean(this.edlOptions.enabled);
        this.edlOptions = {
            enabled: options.enabled,
            pointCloudLayer: options.pointCloudLayer ?? this.edlOptions.pointCloudLayer ?? 1,
            strength: options.strength ?? this.edlOptions.strength,
            radius: options.radius ?? this.edlOptions.radius,
            opacity: options.opacity ?? this.edlOptions.opacity,
            neighbourCount: options.neighbourCount ?? this.edlOptions.neighbourCount,
        };

        if (this.edlOptions.enabled && !this.edlPass) {
            this.edlPass = new EDLPass();
        }

        if (this.edlPass) {
            if (this.edlOptions.strength !== undefined) this.edlPass.edlStrength = this.edlOptions.strength;
            if (this.edlOptions.radius !== undefined) this.edlPass.radius = this.edlOptions.radius;
            if (this.edlOptions.opacity !== undefined) this.edlPass.opacity = this.edlOptions.opacity;
            if (this.edlOptions.neighbourCount !== undefined) this.edlPass.neighbourCount = this.edlOptions.neighbourCount;
        }

        // Apply/restore EDL-related state only when toggling enabled state.
        const nextEnabled = Boolean(this.edlOptions.enabled);
        if (prevEnabled !== nextEnabled) {
            if (this.lastPointClouds) {
                this.applyEDLState(this.lastPointClouds, nextEnabled);
            }
        }
    }

    private setLayerMaskRecursive(root: Object3D, desiredMask: number): void {
        // NOTE: We intentionally do NOT change the root object's own layer mask.
        // The root PointCloudOctree has no renderable geometry, so its layer does not
        // affect rendering. Keeping it on the default layer (0) ensures that a standard
        // THREE.js Raycaster can still reach its raycast() method even when EDL is active
        // and child nodes are moved to a dedicated rendering layer.
        root.traverse((obj: Object3D) => {
            if (obj !== root && obj.layers.mask !== desiredMask) {
                obj.layers.mask = desiredMask;
            }
        });
    }

    /**
     * Ensures all point-cloud objects (including newly created child nodes) are on the provided layer.
      * Side effect: overwrites `Object3D.layers` for the point cloud subtree.
     *
     * When EDL is enabled, layer separation is required so we can render:
     * - non-pointcloud content first (layer 0), then
     * - point clouds on a dedicated layer into an offscreen target.
     */
    public syncPointCloudLayers(pointClouds: PointCloudOctree[], layer: number): void {
        const desiredMask = 1 << layer;
        for (const pco of pointClouds) {
            this.setLayerMaskRecursive(pco, desiredMask);
        }
    }

    private applyEDLState(pointClouds: PointCloudOctree[], enabled: boolean): void {
        const pointCloudLayer = this.edlOptions.pointCloudLayer ?? 1;
        const desiredMask = 1 << pointCloudLayer;

        for (const pco of pointClouds) {
            const material = pco.material;

            if (enabled && material.shape !== PointShape.CLOSED) {
                // Remember + override material flags (one-time per material).
                if (!this.overriddenMaterials.has(material)) {
                    this.overriddenMaterials.set(material, { useEDL: material.useEDL, weighted: material.weighted });
                }
                // Only write when needed to avoid accidental per-frame shader churn.
                if (material.useEDL !== true) material.useEDL = true;
                if (material.weighted !== false) material.weighted = false;

                // Remember + override layers (one-time per point cloud).
                if (!this.overriddenLayerMasks.has(pco)) {
                    this.overriddenLayerMasks.set(pco, pco.layers.mask);
                }
                // Keep point-cloud subtree on the dedicated layer.
                // Point cloud nodes are created dynamically during streaming; even if the root mask matches,
                // newly created child nodes may still be on a different layer unless we resync.
                this.setLayerMaskRecursive(pco, desiredMask);
            } else {
                // Restore material flags if we previously overrode them.
                const prevMat = this.overriddenMaterials.get(material);
                if (prevMat) {
                    if (material.useEDL !== prevMat.useEDL) material.useEDL = prevMat.useEDL;
                    if (material.weighted !== prevMat.weighted) material.weighted = prevMat.weighted;
					this.overriddenMaterials.delete(material);
                }

                // Restore layer mask if we previously overrode it.
                const prevMask = this.overriddenLayerMasks.get(pco);
                if (prevMask !== undefined) {
                    this.setLayerMaskRecursive(pco, prevMask);
					this.overriddenLayerMasks.delete(pco);
                }
            }
        }
    }

    /**
     * Renders a frame.
     *
     * CLOSED clouds are rasterized at one physical pixel, dilated, eroded and
     * composited with interpolated color, view depth and normals. Each cloud is
     * reconstructed separately. EDL, when enabled, shades the reconstructed surface.
     * Requires WebGL2 with EXT_color_buffer_float for CLOSED; otherwise throws.
     * Other shapes use the normal renderer or the EDL pipeline.
     */
    public render(params: PotreeRendererRenderParams): void {
        const { renderer, scene, camera, pointClouds } = params;

        const edlEnabled = Boolean(this.edlOptions.enabled);
        const pointCloudLayer = this.edlOptions.pointCloudLayer ?? 1;

		this.closedClouds.length = 0;
		scene.traverseVisible((object) =>
		{
			if (object instanceof PointCloudOctree && !object.disposed && object.material.shape === PointShape.CLOSED)
			{
				this.closedClouds.push(object);
			}
		});
		if (this.closedClouds.length > 0)
		{
			this.closedPass ??= new ClosedPointPass();
			this.closedPass.validate(renderer, camera);
		}

        if (pointClouds) {
            this.lastPointClouds = pointClouds;
            // Apply/restore state for these point clouds.
            this.applyEDLState(pointClouds, edlEnabled);
        }
		else
		{
			this.applyEDLState(this.closedClouds, false);
		}

		// Hide reconstructed clouds while rendering ordinary geometry and other shapes.
		// Restore visibility even if a user render callback or shader setup throws.
		try
		{
			for (const cloud of this.closedClouds) cloud.visible = false;
			if (edlEnabled)
			{
				if (!this.edlPass)
				{
					this.edlPass = new EDLPass();
					this.setEDL(this.edlOptions);
				}
				this.edlPass.render({ renderer, scene, camera, pointClouds, pointCloudLayer });
			}
			else
			{
				renderer.render(scene, camera);
			}
		}
		finally
		{
			for (const cloud of this.closedClouds) cloud.visible = true;
		}

		for (const cloud of this.closedClouds)
		{
			this.closedPass?.render(renderer, cloud, camera, this.closedOptions, this.edlOptions);
		}
    }

    /** Convenience helper: `updatePointClouds()` followed by {@link render}. */
    public updateAndRender(
        potree: Potree,
        pointClouds: PointCloudOctree[],
        camera: Camera,
        renderer: WebGLRenderer,
        scene: Object3D,
    ): IVisibilityUpdateResult {
        const result = potree.updatePointClouds(pointClouds, camera, renderer);
        this.render({ renderer, scene, camera, pointClouds });
        return result;
    }
}
