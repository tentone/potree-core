export class PointCloudArena4D extends PointCloudTree {
    constructor(geometry: any);
    root: any;
    visiblePointsTarget: number;
    minimumNodePixelSize: number;
    numVisibleNodes: number;
    numVisiblePoints: number;
    boundingBoxNodes: any[];
    loadQueue: any[];
    visibleNodes: any[];
    pcoGeometry: any;
    boundingBox: any;
    boundingSphere: any;
    material: PointCloudMaterial;
    profileRequests: any[];
    name: string;
    getBoundingBoxWorld(): any;
    setName(name: any): void;
    getName(): string;
    getLevel(): any;
    toTreeNode(geometryNode: any, parent: any): PointCloudArena4DNode;
    updateMaterial(material: any, visibleNodes: any, camera: any, renderer: any): void;
    updateVisibleBounds(): void;
    hideDescendants(object: any): void;
    updateMatrixWorld(force: any): void;
    matrixWorldNeedsUpdate: boolean;
    nodesOnRay(nodes: any, ray: any): any[];
    pick(viewer: any, camera: any, ray: any, params?: {}): any;
    pickState: {
        renderTarget: any;
        material: PointCloudMaterial;
        scene: any;
    };
    computeVisibilityTextureData(nodes: any): {
        data: Uint8Array;
        offsets: Map<any, any>;
    };
    get progress(): 1 | 0;
}
export class PointCloudArena4DNode extends PointCloudTreeNode {
    left: any;
    right: any;
    sceneNode: any;
    kdtree: any;
    getNumPoints(): any;
    toTreeNode(child: any): void;
}
import { PointCloudTree } from "./PointCloudTree.js";
import { PointCloudMaterial } from "./materials/PointCloudMaterial.js";
import { PointCloudTreeNode } from "./PointCloudTree.js";
