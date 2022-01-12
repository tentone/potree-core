"use strict";

function VersionUtils(version)
{
	this.version = version;
	var vmLength = (version.indexOf(".") === -1) ? version.length : version.indexOf(".");
	this.versionMajor = parseInt(version.substr(0, vmLength));
	this.versionMinor = parseInt(version.substr(vmLength + 1));
	
	if(this.versionMinor.length === 0)
	{
		this.versionMinor = 0;
	}
};

VersionUtils.prototype.newerThan = function(version)
{
	var v = new VersionUtils(version);

	if((this.versionMajor > v.versionMajor) || (this.versionMajor === v.versionMajor && this.versionMinor > v.versionMinor))
	{
		return true;
	}
	
	return false;
};

VersionUtils.prototype.equalOrHigher = function(version)
{
	var v = new VersionUtils(version);

	if((this.versionMajor > v.versionMajor) || (this.versionMajor === v.versionMajor && this.versionMinor >= v.versionMinor))
	{
		return true;
	}

	return false;
};

VersionUtils.prototype.upTo = function(version)
{
	return !this.newerThan(version);
};

export {VersionUtils};
