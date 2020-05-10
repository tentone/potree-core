"use strict";

import {LRU} from "./utils/LRU.js";
import {WorkerManager} from "./utils/WorkerManager.js";

function getCurrentScript() {
	var currentScript = (document && document.currentScript) ? document.currentScript : (function() {
		var scripts = document.getElementsByTagName('script');
		return scripts[scripts.length - 1].getAttribute('src');
	})();
	return currentScript;	
}

function getBasePath()
{
	var currentScript = getCurrentScript();
	if(currentScript && currentScript.src)
	{
		var scriptPath = new URL(currentScript.src + "/..").href;

		if(scriptPath.slice(-1) === "/")
		{
			scriptPath = scriptPath.slice(0, -1);
		}

		return scriptPath;
	}
	else
	{
		console.error("Potree: Was unable to find its script path using document.currentScript.");
	}

	return "";
}

var Global = 
{
	debug: {},
	workerPath: getBasePath(),
	maxNodesLoadGPUFrame: 20,
	maxDEMLevel: 0,
	maxNodesLoading: navigator.hardwareConcurrency !== undefined ? navigator.hardwareConcurrency : 4,
	pointLoadLimit: 1e10,
	numNodesLoading: 0,
	measureTimings: false,
	workerPool: new WorkerManager(),
	lru: new LRU(),
	pointcloudTransformVersion: undefined
};

export {Global};