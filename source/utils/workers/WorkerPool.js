"use strict";

class WorkerPool
{
	constructor()
	{
		this.workers = [];
		this.tasks = [];
	}

	addTask(url, weight, onMessage, message, data)
	{
		//this.tasks.push(new WorkerTask(weight, data, onMessage));

		var worker = new Worker(url);
		worker.onmessage = onMessage;
		worker.postMessage(message, data);
	}
};