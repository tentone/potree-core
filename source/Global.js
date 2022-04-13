
import {LRU} from "./utils/LRU.js";
import {WorkerManager} from "./utils/WorkerManager.js";

function getCurrentScript() 
{
	if (document && document.currentScript) 
	{
		return document.currentScript;
	}
	const scripts = document.getElementsByTagName('script');
	if (scripts && scripts.length) 
	{
		return scripts[scripts.length - 1].getAttribute('src');
	}
	return null;
}

function getBasePath()
{
	const currentScript = getCurrentScript();
	if (currentScript && currentScript.src)
	{
		let scriptPath = new URL(currentScript.src + "/..").href;

		if (scriptPath.slice(-1) === "/")
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

export const Global = {
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

