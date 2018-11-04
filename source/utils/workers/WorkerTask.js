"use strict";

class WorkerTask
{
	constructor(weight, data, onMessage)
	{
		this.weight = weight;
		this.data = data;
		this.onMessage = onMessage;
	}
};