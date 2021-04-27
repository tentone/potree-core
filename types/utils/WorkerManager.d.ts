/**
 * The worker manager is responsible for creating and managing worker instances.
 */
export class WorkerManager {
    workers: any[][];
    /**
     * Get a worker from the pool, if none available one will be created.
     */
    getWorker(type: any): any;
    /**
     * Return (reinsert) the worker into the pool.
     */
    returnWorker(type: any, worker: any): void;
    /**
     * Run a task immediatly.
     */
    runTask(type: any, onMessage: any, message: any, transfer: any): void;
}
export namespace WorkerManager {
    const BINARY_DECODER: number;
    const LAS_LAZ: number;
    const LAS_DECODER: number;
    const GREYHOUND: number;
    const DEM: number;
    const EPT_LAS_ZIP_DECODER: number;
    const EPT_BINARY_DECODER: number;
}
