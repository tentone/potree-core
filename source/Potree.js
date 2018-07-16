"use strict";

function Potree()
{}

Potree.version = {
	major: 1,
	minor: 6,
	suffix: "-nogui"
};

Potree.pointBudget = 1e6;
Potree.framenumber = 0;
Potree.numNodesLoading = 0;
Potree.maxNodesLoading = 4;

Potree.webgl = {
	shaders:
	{},
	vaos:
	{},
	vbos:
	{}
};

Potree.debug = {};

Potree.scriptPath = null;
if(document.currentScript.src)
{
	Potree.scriptPath = new URL(document.currentScript.src + "/..").href;
	if(Potree.scriptPath.slice(-1) === "/")
	{
		Potree.scriptPath = Potree.scriptPath.slice(0, -1);
	}
}
else
{
	console.error("Potree was unable to find its script path using document.currentScript. Is Potree included with a script tag? Does your browser support this function?");
}

Potree.resourcePath = Potree.scriptPath + "/resources";
