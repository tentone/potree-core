export namespace Global {
    const debug: {};
    const workerPath: string;
    const maxNodesLoadGPUFrame: number;
    const maxDEMLevel: number;
    const maxNodesLoading: number;
    const pointLoadLimit: number;
    const numNodesLoading: number;
    const measureTimings: boolean;
    const workerPool: WorkerManager;
    const lru: LRU;
    const pointcloudTransformVersion: any;
}
import { WorkerManager } from "./utils/WorkerManager.js";
import { LRU } from "./utils/LRU.js";
