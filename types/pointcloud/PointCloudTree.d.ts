export class PointCloudTree extends Object3D {
    dem: DEM;
    initialized(): boolean;
}
export class PointCloudTreeNode {
    needsTransformUpdate: boolean;
    getChildren(): void;
    getBoundingBox(): void;
    isLoaded(): void;
    isGeometryNode(): void;
    isTreeNode(): void;
    getLevel(): void;
    getBoundingSphere(): void;
}
import { Object3D } from "three";
import { DEM } from "./DEM.js";
