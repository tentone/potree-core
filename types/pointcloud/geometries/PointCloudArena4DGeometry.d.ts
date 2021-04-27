export class PointCloudArena4DGeometry {
    static load(url: any, callback: any): void;
    numPoints: number;
    version: number;
    boundingBox: any;
    numNodes: number;
    name: any;
    provider: any;
    url: any;
    root: PointCloudArena4DGeometryNode;
    levels: number;
    _spacing: any;
    pointAttributes: PointAttributes;
    loadHierarchy(): void;
    set spacing(arg: any);
    get spacing(): any;
}
export class PointCloudArena4DGeometryNode {
    left: any;
    right: any;
    boundingBox: any;
    number: any;
    pcoGeometry: any;
    loaded: boolean;
    numPoints: number;
    level: number;
    children: any[];
    oneTimeDisposeHandlers: any[];
    isGeometryNode(): boolean;
    isTreeNode(): boolean;
    isLoaded(): boolean;
    getBoundingSphere(): any;
    getBoundingBox(): any;
    getChildren(): any[];
    getLevel(): number;
    load(): void;
    loading: boolean;
    dispose(): void;
    geometry: any;
    getNumPoints(): number;
}
import { PointAttributes } from "../../PointAttributes.js";
