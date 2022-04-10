/**
 * The worker manager is responsible for creating and managing worker instances.
 */
class WorkerManager {
	constructor() {
		this.workers = [];

		for (var i = 0; i < 7; i++) {
			this.workers.push([]);
		}
	}

	/**
	 * Get a worker from the pool, if none available one will be created.
	 */
	getWorker(type) {
		if (this.workers[type].length > 0) {
			return this.workers[type].pop();
		}

		switch (type) {
			case WorkerManager.BINARY_DECODER:
				return new Worker(new URL("../workers/BinaryDecoder.worker.js", import.meta.url));
			case WorkerManager.LAS_LAZ:
				return new Worker(new URL("../workers/LASLAZ.worker.js", import.meta.url));
			case WorkerManager.LAS_DECODER:
				return new Worker(new URL("../workers/LASDecoder.worker.js", import.meta.url));
			case WorkerManager.GREYHOUND:
				throw new Worker(new URL("../workers/GreyhoundBinaryDecoder.worker.js", import.meta.url));
			case WorkerManager.DEM:
				return new Worker(new URL("../workers/DEM.worker.js", import.meta.url));
			case WorkerManager.EPT_LAS_ZIP_DECODER:
				return new Worker(new URL("../workers/EptLaszipDecoder.worker.js", import.meta.url));
			case WorkerManager.EPT_BINARY_DECODER:
				return new Worker(new URL("../workers/EptBinaryDecoder.worker.js", import.meta.url));
			default:
				throw new Error("Unknown worker type.");
		}
	}

	/**
	 * Return (reinsert) the worker into the pool.
	 */
	returnWorker(type, worker) {
		this.workers[type].push(worker);
	}

	/**
	 * Run a task immediatly.
	 */
	runTask(type, onMessage, message, transfer) {
		var self = this;

		var worker = this.getWorker(type);
		worker.onmessage = function (event) {
			onMessage(event);
			self.returnWorker(type, worker);
		};

		if (transfer !== undefined) {
			worker.postMessage(message, transfer);
		} else {
			worker.postMessage(message);
		}
	}
}

WorkerManager.BINARY_DECODER = 0;
WorkerManager.LAS_LAZ = 1;
WorkerManager.LAS_DECODER = 2;
WorkerManager.GREYHOUND = 3;
WorkerManager.DEM = 4;
WorkerManager.EPT_LAS_ZIP_DECODER = 5;
WorkerManager.EPT_BINARY_DECODER = 6;

export { WorkerManager };
