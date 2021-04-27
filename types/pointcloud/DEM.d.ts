export class DEM {
    constructor(pointcloud: any);
    pointcloud: any;
    matrix: any;
    boundingBox: any;
    tileSize: number;
    root: DEMNode;
    version: number;
    expandAndFindByBox(box: any, level: any): DEMNode[];
    childIndex(uv: any): number;
    height(position: any): any;
    update(visibleNodes: any): void;
}
import { DEMNode } from "./DEMNode.js";
