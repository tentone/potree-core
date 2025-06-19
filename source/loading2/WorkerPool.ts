const BrotliDecoderWorker = require('./brotli-decoder.worker.js').default;
const DecoderWorker = require('./decoder.worker.js').default;


/**
 * Enumerates the types of workers available in the worker pool.
 */
export enum WorkerType {
	/**
	 * Worker for decoding Brotli-compressed data.
	 */
	DECODER_WORKER_BROTLI = 'DECODER_WORKER_BROTLI',

	/**
	 * Worker for general decoding tasks.
	 */
	DECODER_WORKER = 'DECODER_WORKER',
}

/**
 * Creates a new worker instance based on the specified worker type.
 *
 * @param type - The type of worker to create.
 * @returns A new instance of a Worker that corresponds to the specified worker type.
 * @throws {Error} If an unknown worker type is provided.
 */
function createWorker(type: WorkerType): Worker 
{
	switch (type) 
	{
		case WorkerType.DECODER_WORKER_BROTLI: {
			return new BrotliDecoderWorker();
		}
		case WorkerType.DECODER_WORKER: {
			return new DecoderWorker();
		}
		default:
			throw new Error('Unknown worker type');
	}
}

/**
 * WorkerPool manages a collection of worker instances, allowing for efficient retrieval and return of workers based on their type.
 */
export class WorkerPool
{
	/**
	 * Workers will be an object that has a key for each worker type and the value is an array of Workers that can be empty.
	 */
	public workers: { [key in WorkerType]: Worker[] } = {DECODER_WORKER: [], DECODER_WORKER_BROTLI: []};

	/**
	 * Retrieves a Worker instance from the pool associated with the specified worker type.
	 * 
	 * If no worker instances are available, a new worker is created and added to the pool before retrieving one. 
	 * 
	 * @param workerType - The type of the worker to retrieve.
	 * @returns A Worker instance corresponding to the specified worker type.
	 * @throws Error if the worker type is not recognized or if no workers are available in the pool.
	 */
	public getWorker(workerType: WorkerType): Worker
	{
		// Throw error if workerType is not recognized
		if (this.workers[workerType] === undefined) 
		{
			throw new Error('Unknown worker type');
		}
		// Given a worker URL, if URL does not exist in the worker object, create a new array with the URL as a key
		if (this.workers[workerType].length === 0)
		{
			let worker = createWorker(workerType);
			this.workers[workerType].push(worker);
		}
		let worker = this.workers[workerType].pop();
		if (worker === undefined) 
		{ // Typescript needs this
			throw new Error('No workers available');
		}
		// Return the last worker in the array and remove it from the array
		return worker;
	}

	/**
	 * Returns a worker instance to the pool for the specified worker type.
	 *
	 * @param workerType - The type of the worker, which determines the corresponding pool.
	 * @param worker - The worker instance to be returned to the pool.
	 */
	public returnWorker(workerType: WorkerType, worker: Worker)
	{
		this.workers[workerType].push(worker);
	}
}
