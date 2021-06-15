"use strict";

// Force workers to be included
import BinaryDecoderWorker from "../workers/BinaryDecoderWorker";
//import LASLAZWorker from "../workers/LASLAZWorker";
import LASDecoderWorker from "../workers/LASDecoderWorker";
//import GreyhoundBinaryDecoderWorker from "../workers/GreyhoundBinaryDecoderWorker";
import DEMWorker from "../workers/DEMWorker";
import EptLaszipDecoderWorker from "../workers/EptLaszipDecoderWorker";
import EptBinaryDecoderWorker from "../workers/EptBinaryDecoderWorker";

/**
 * The worker manager is responsible for creating and managing worker instances.
 */
class WorkerManager
{
	constructor()
	{
		this.workers = [];

		for(var i = 0; i < 7; i++)
		{
			this.workers.push([]);
		}
	}

	/**
	 * Get a worker from the pool, if none available one will be created.
	 */
	getWorker(type)
	{
		if(this.workers[type].length > 0)
		{
			return this.workers[type].pop();
    }

    switch (type) {
      case 0:
        return new BinaryDecoderWorker();
      case 1:
        throw "LASLAZWorker not implemented";
      case 2:
        return new LASDecoderWorker();
      case 3:
        throw "GreyhoundBinaryDecoderWorker not implemented";
      case 4:
        return new DEMWorker();
      case 5:
        return new EptLaszipDecoderWorker();
      case 6:
        return new EptBinaryDecoderWorker();
      defautl:
        throw "Unknown worker requested";
    };
	}

	/**
	 * Return (reinsert) the worker into the pool.
	 */
	returnWorker(type, worker)
	{
		this.workers[type].push(worker);
	}

	/**
	 * Run a task immediatly.
	 */
	runTask(type, onMessage, message, transfer)
	{
		var self = this;

		var worker = this.getWorker(type);
		worker.onmessage = function(event)
		{
			onMessage(event);
			self.returnWorker(type, worker);
		};

		if(transfer !== undefined)
		{
			worker.postMessage(message, transfer);
		}
		else
		{
			worker.postMessage(message);
		}
	}
};

WorkerManager.BINARY_DECODER = 0;
WorkerManager.LAS_LAZ = 1;
WorkerManager.LAS_DECODER = 2;
WorkerManager.GREYHOUND = 3;
WorkerManager.DEM = 4;
WorkerManager.EPT_LAS_ZIP_DECODER = 5;
WorkerManager.EPT_BINARY_DECODER = 6;

export {WorkerManager};
