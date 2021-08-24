import * as THREE from 'three';

export class PointCloudOctree extends PointCloudTree {
    constructor(geometry: any, material: any);
    pointBudget: number;
    pcoGeometry: any;
    boundingBox: any;
    boundingSphere: any;
    material: PointCloudMaterial;
    visiblePointsTarget: number;
    minimumNodePixelSize: number;
    level: number;
    showBoundingBox: boolean;
    boundingBoxNodes: any[];
    loadQueue: any[];
    visibleBounds: any;
    visibleNodes: any[];
    visibleGeometry: any[];
    generateDEM: boolean;
    profileRequests: any[];
    name: string;
    tempVector3: any;
    projection: any;
    root: any;
    setName(name: any): void;
    getName(): string;
    toTreeNode(geometryNode: any, parent: any): PointCloudOctreeNode;
    updateVisibleBounds(): void;
    updateMaterial(material: any, visibleNodes: any, camera: any, renderer: any): void;
    computeVisibilityTextureData(nodes: any, camera: any): {
        data: Uint8Array;
        offsets: Map<any, any>;
    };
    nodeIntersectsProfile(node: any, profile: any): boolean;
    nodesOnRay(nodes: any[], ray: THREE.Ray, recursive?: boolean): any[];
    pointsOnRay(nodes: any[], ray: THREE.Ray, maxDistance: number = 0.5, recursive: boolean = false): any[];
    updateMatrixWorld(force: any): void;
    matrixWorldNeedsUpdate: boolean;
    hideDescendants(object: any): void;
    moveToOrigin(): void;
    moveToGroundPlane(): void;
    getBoundingBoxWorld(): any;
    /**
     * returns points inside the profile points
     *
     * maxDepth:		search points up to the given octree depth
     *
     *
     * The return value is an array with all segments of the profile path
     *  var segment = {
     * 		start: 	THREE.Vector3,
     * 		end: 	THREE.Vector3,
     * 		points: {}
     * 		project: function()
     *  };
     *
     * The project() function inside each segment can be used to transform
     * that segments point coordinates to line up along the x-axis.
     *
     *
     */
    getPointsInProfile(profile: any, maxDepth: any, callback: any): {
        segments: any[];
        boundingBox: any;
        projectedBoundingBox: any;
    };
    /**
     * returns points inside the given profile bounds.
     *
     * start:
     * end:
     * width:
     * depth:		search points up to the given octree depth
     * callback:	if specified, points are loaded before searching
     *
     *
     */
    getProfile(start: any, end: any, width: any, depth: any, callback: any): void;
    getVisibleExtent(): any;
    /**
     *
     *
     *
     * params.pickWindowSize:	Look for points inside a pixel window of this size.
     * 							Use odd values: 1, 3, 5, ...
     *
     *
     * TODO: only draw pixels that are actually read with readPixels().
     *
     */
    pick(viewer: { renderer: THREE.WebGLRenderer, pRenderer: BasicGroup; }, camera: any, ray: any, params?: {}): any;
    /**
     * Looks for points in close proximity to the specified Ray, anywhere along
     * the entire length of the Ray.
     *
     * By default, all points within params.maxDistance (default: 0.5) of the Ray
     * are returned. Setting params.firstHitOnly to true will only return the
     * nearest point to the Ray's origin.
     */
    pickAll(ray: THREE.Ray, params?: { firstHitOnly?: boolean; maxDistance?: number; recursive?: boolean; });
    pickState: {
        renderTarget: any;
        material: PointCloudMaterial;
        scene: any;
    };
    getFittedBoxGen(boxNode: any): Generator<any, void, unknown>;
    getFittedBox(boxNode: any, maxLevel?: number): any;
    get progress(): number;
    find(name: any): any;
}
export class PointCloudOctreeNode extends PointCloudTreeNode {
    children: {};
    sceneNode: any;
    octree: any;
    getNumPoints(): any;
    getPointsInBox(boxNode: any): any[];
    get name(): any;
}
import { PointCloudTree } from "./PointCloudTree.js";
import { PointCloudMaterial } from "./materials/PointCloudMaterial.js";
import { PointCloudTreeNode } from "./PointCloudTree.js"; import { BasicGroup } from '../objects/BasicGroup.js';
