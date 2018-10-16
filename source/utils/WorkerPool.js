"use strict";

class WorkerPool
{
	constructor()
	{
		this.workers = {};
	}

	getWorker(url)
	{
		if(!this.workers[url])
		{
			this.workers[url] = [];
		}

		if(this.workers[url].length === 0)
		{
			var worker = new Worker(url);
			this.workers[url].push(worker);
		}

		var worker = this.workers[url].pop();

		return worker;
	}

	returnWorker(url, worker)
	{
		this.workers[url].push(worker);
	}
};