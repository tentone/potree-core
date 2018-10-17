"use strict";

class WorkerPool
{
	constructor()
	{
		this.workers = {};
	}

	/**
	 * Get a worker from the pool, if none available one will be created.
	 */
	getWorker(url)
	{
		if(!this.workers[url])
		{
			this.workers[url] = [];
		}

		if(this.workers[url].length === 0)
		{
			return new Worker(url);
		}
		else
		{
			return this.workers[url].pop();
		}
	}

	/**
	 * Return (reinsert) the worker into the pool.
	 */
	returnWorker(url, worker)
	{
		this.workers[url].push(worker);
	}
};