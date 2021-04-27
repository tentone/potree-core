export class PointCloudGreyhoundGeometry {
    spacing: number;
    boundingBox: any;
    root: any;
    nodes: any;
    pointAttributes: {};
    hierarchyStepSize: number;
    loader: any;
    schema: any;
    baseDepth: any;
    offset: any;
    projection: any;
    boundingSphere: any;
    serverURL: any;
    normalize: {
        color: boolean;
        intensity: boolean;
    };
}
export function PointCloudGreyhoundGeometryNode(name: any, pcoGeometry: any, boundingBox: any, scale: any, offset: any): void;
export class PointCloudGreyhoundGeometryNode {
    constructor(name: any, pcoGeometry: any, boundingBox: any, scale: any, offset: any);
    id: number;
    name: any;
    index: number;
    pcoGeometry: any;
    geometry: any;
    boundingBox: any;
    boundingSphere: any;
    scale: any;
    offset: any;
    children: {};
    numPoints: number;
    level: any;
    loaded: boolean;
    oneTimeDisposeHandlers: any[];
    baseLoaded: boolean;
    greyhoundBounds: any;
    greyhoundOffset: any;
    isGeometryNode(): boolean;
    isTreeNode(): boolean;
    isLoaded(): boolean;
    getBoundingSphere(): any;
    getBoundingBox(): any;
    getLevel(): any;
    getChildren(): any[];
    getURL(): string;
    addChild(child: any): void;
    load(): void;
    loading: boolean;
    loadPoints(): void;
    loadHierarchyThenPoints(): void;
    getNumPoints(): number;
    dispose(): void;
}
export namespace PointCloudGreyhoundGeometryNode {
    const IDCount: number;
}
