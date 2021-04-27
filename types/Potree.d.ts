export namespace AttributeLocations {
    const position: number;
    const color: number;
    const intensity: number;
    const classification: number;
    const returnNumber: number;
    const numberOfReturns: number;
    const pointSourceID: number;
    const indices: number;
    const normal: number;
    const spacing: number;
}
export namespace Classification {
    const DEFAULT: {
        0: any;
        1: any;
        2: any;
        3: any;
        4: any;
        5: any;
        6: any;
        7: any;
        8: any;
        9: any;
        12: any;
        DEFAULT: any;
    };
}
export namespace ClipTask {
    const NONE: number;
    const HIGHLIGHT: number;
    const SHOW_INSIDE: number;
    const SHOW_OUTSIDE: number;
}
export namespace ClipMethod {
    const INSIDE_ANY: number;
    const INSIDE_ALL: number;
}
export namespace PointSizeType {
    const FIXED: number;
    const ATTENUATED: number;
    const ADAPTIVE: number;
}
export namespace PointShape {
    const SQUARE: number;
    const CIRCLE: number;
    const PARABOLOID: number;
}
export namespace PointColorType {
    const RGB: number;
    const COLOR: number;
    const DEPTH: number;
    const HEIGHT: number;
    const ELEVATION: number;
    const INTENSITY: number;
    const INTENSITY_GRADIENT: number;
    const LOD: number;
    const LEVEL_OF_DETAIL: number;
    const POINT_INDEX: number;
    const CLASSIFICATION: number;
    const RETURN_NUMBER: number;
    const SOURCE: number;
    const NORMAL: number;
    const PHONG: number;
    const RGB_HEIGHT: number;
    const COMPOSITE: number;
}
export namespace TreeType {
    const OCTREE: number;
    const KDTREE: number;
}
export namespace PointSelectionType {
    const BRIGHTNESS: number;
    const COLOR: number;
}
export function loadPointCloud(path: any, name: any, callback: any): void;
export function updateVisibility(pointclouds: any, camera: any, renderer: any): {
    visibleNodes: any[];
    numVisiblePoints: number;
    lowestSpacing: number;
};
export function updatePointClouds(pointclouds: any, camera: any, renderer: any): {
    visibleNodes: any[];
    numVisiblePoints: number;
    lowestSpacing: number;
};
export function updateVisibilityStructures(pointclouds: any, camera: any, renderer: any): {
    frustums: any[];
    camObjPositions: any[];
    priorityQueue: BinaryHeap;
};
export const VERSION: string;
import { BinaryHeap } from "./lib/BinaryHeap.js";
