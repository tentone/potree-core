"use strict";

class WorkerPool
{
	constructor()
	{
		this.workers = [];
		this.tasks = [];
	}

	addTask(url, onMessage, message, data)
	{
		var worker = new Worker(url);
		worker.onmessage = onMessage;
		worker.postMessage(message, data);
	}
};