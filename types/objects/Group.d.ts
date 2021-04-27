export class Group extends BasicGroup {
    buffers: Map<any, any>;
    shaders: Map<any, any>;
    textures: Map<any, any>;
    types: Map<any, any>;
    /**
     * Get WebGL extensions required for the more advanced features.
     */
    getExtensions(gl: any): void;
    createBuffer(gl: any, geometry: any): WebGLBuffer;
    updateBuffer(gl: any, geometry: any): void;
    fetchOctrees(): {
        octrees: (Group & PointCloudTree)[];
    };
    renderNodes(renderer: any, octree: any, nodes: any, visibilityTextureData: any, camera: any, shader: any): void;
    renderOctree(renderer: any, octree: any, nodes: any, camera: any): void;
}
import { BasicGroup } from "./BasicGroup.js";
import { WebGLBuffer } from "../WebGLBuffer.js";
import { PointCloudTree } from "../pointcloud/PointCloudTree.js";
