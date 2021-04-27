import { Mesh } from "three";

/**
 * Potree object is a wrapper to use Potree alongside other THREE based frameworks.
 *
 * The object can be used a normal Object3D.
 *
 * It is based on THREE.Mesh and automatically updates the point cloud based on visibility.
 *
 * Also takes care of geometry ajustments to allow the point clouds to be frustum culled.
 */
export class BasicGroup extends Mesh {
    frustumCulled: boolean;
    pointclouds: any[];
    nodeSize: number;
    pointBudget: number;
    nodeLoadRate: number;
    /**
     * Empty raycast method to avoid getting valid collision detection with the box geometry attached.
     */
    raycast(raycaster: any, intersects: any): void;
    /**
     * Changes the point budget to be used by potree.
     */
    setPointBudget(budget: any): void;
    /**
     * Used to update the point cloud visibility relative to a camera.
     *
     * Called automatically before rendering.
     */
    // onBeforeRender(renderer: any, scene: any, camera: any, geometry: any, material: any, group: any): void;
    /**
     * Recalculate the box geometry attached to this group.
     *
     * The geometry its not visible and its only used for frustum culling.
     */
    recalculateBoxGeometry(): void;
    geometry: any;
    /**
     * Add an object as children of this scene.
     *
     * Point cloud objects are detected and used to recalculate the geometry box used for frustum culling.
     */
    add(object: any): this;
    /**
     * Remove object from group.
     *
     * Point cloud objects are detected and used to recalculate the geometry box used for frustum culling
     */
    remove(object: any): this;
    /**
     * Get the point cloud bouding box.
     */
    getBoundingBox(): any;
    /**
     * Estimate the point cloud height at a given position.
     */
    estimateHeightAt(position: any): any;
    visible: boolean;
}
