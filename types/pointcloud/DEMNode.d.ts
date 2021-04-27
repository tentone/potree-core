export class DEMNode {
    constructor(name: any, box: any, tileSize: any);
    name: any;
    box: any;
    tileSize: any;
    level: number;
    data: Float32Array;
    children: any[];
    mipMap: Float32Array[];
    mipMapNeedsUpdate: boolean;
    createMipMap(): void;
    uv(position: any): number[];
    heightAtMipMapLevel(position: any, mipMapLevel: any): number;
    height(position: any): number;
    traverse(handler: any, level?: number): void;
}
