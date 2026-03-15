import { Camera, Object3D, WebGLRenderer } from 'three';

import { PointCloudMaterial } from '../materials/point-cloud-material';
import { PointCloudOctree } from '../point-cloud-octree';
import { Potree } from '../potree';
import { IVisibilityUpdateResult } from '../types';
import { EDLPass } from './edl-pass';

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
    private edlPass: EDLPass | null = null;
    private edlOptions: PotreeRendererEDLOptions = { enabled: false, pointCloudLayer: 1 };
    private lastPointClouds: PointCloudOctree[] | null = null;
    private overriddenMaterials = new WeakMap<PointCloudMaterial, { useEDL: boolean; weighted: boolean }>();
    private overriddenLayerMasks = new WeakMap<PointCloudOctree, number>();

    public constructor(options: PotreeRendererOptions = {}) {
        if (options.edl) {
            this.setEDL(options.edl);
        }
    }

    /** Releases internally owned GPU resources (render targets). */
    public dispose(): void {
        this.edlPass?.dispose();
        this.edlPass = null;
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

            if (enabled) {
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
                }

                // Restore layer mask if we previously overrode it.
                const prevMask = this.overriddenLayerMasks.get(pco);
                if (prevMask !== undefined) {
                    this.setLayerMaskRecursive(pco, prevMask);
                }
            }
        }
    }

    /**
     * Renders a frame.
     *
     * - EDL disabled: calls `renderer.render(scene, camera)`.
     * - EDL enabled: runs the EDL multi-pass pipeline via {@link EDLPass}.
     */
    public render(params: PotreeRendererRenderParams): void {
        const { renderer, scene, camera, pointClouds } = params;

        const edlEnabled = Boolean(this.edlOptions.enabled);
        const pointCloudLayer = this.edlOptions.pointCloudLayer ?? 1;

        if (pointClouds) {
            this.lastPointClouds = pointClouds;
            // Apply/restore state for these point clouds.
            this.applyEDLState(pointClouds, edlEnabled);
        }

        if (edlEnabled) {
            if (!this.edlPass) {
                this.edlPass = new EDLPass();
                this.setEDL(this.edlOptions);
            }

            this.edlPass.render({ renderer, scene, camera, pointClouds, pointCloudLayer });
            return;
        }

        renderer.render(scene, camera);
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
