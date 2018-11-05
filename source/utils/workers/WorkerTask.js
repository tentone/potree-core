"use strict";

/**
 * A task scheduled to be executed by a worker.
 */
class WorkerTask
{
	constructor(weight, onMessage, message, transfer)
	{
		this.weight = weight;

		this.onMessage = onMessage;
		this.message = message;
		this.transfer = transfer;
	}
};