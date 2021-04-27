export class PointCloudEptGeometry {
    constructor(url: any, info: any);
    eptScale: any;
    eptOffset: any;
    url: any;
    info: any;
    type: string;
    schema: any;
    span: any;
    boundingBox: any;
    tightBoundingBox: any;
    offset: any;
    boundingSphere: any;
    tightBoundingSphere: any;
    version: VersionUtils;
    projection: any;
    fallbackProjection: any;
    pointAttributes: string;
    spacing: number;
    loader: EptBinaryLoader | EptLaszipLoader;
}
export class PointCloudEptGeometryNode extends PointCloudTreeNode {
    constructor(ept: any, b: any, d: any, x: any, y: any, z: any);
    ept: any;
    key: EptKey;
    id: number;
    geometry: any;
    boundingBox: any;
    tightBoundingBox: any;
    spacing: number;
    boundingSphere: any;
    hasChildren: boolean;
    children: {};
    numPoints: number;
    level: any;
    loaded: boolean;
    loading: boolean;
    oneTimeDisposeHandlers: any[];
    name: string;
    index: number;
    url(): string;
    getNumPoints(): number;
    filename(): string;
    addChild(child: any): void;
    load(): void;
    loadPoints(): void;
    loadHierarchy(): Promise<void>;
    doneLoading(bufferGeometry: any, tightBoundingBox: any, np: any, mean: any): void;
    mean: any;
    toPotreeName(d: any, x: any, y: any, z: any): string;
    dispose(): void;
}
export namespace PointCloudEptGeometryNode {
    const IDCount: number;
}
export class EptKey {
    constructor(ept: any, b: any, d: any, x: any, y: any, z: any);
    ept: any;
    b: any;
    d: any;
    x: any;
    y: any;
    z: any;
    name(): string;
    step(a: any, b: any, c: any): EptKey;
    children(): any[];
}
import { VersionUtils } from "../../utils/VersionUtils.js";
import { EptBinaryLoader } from "../../loaders/ept/EptBinaryLoader";
import { EptLaszipLoader } from "../../loaders/ept/EptLaszipLoader";
import { PointCloudTreeNode } from "../PointCloudTree.js";
