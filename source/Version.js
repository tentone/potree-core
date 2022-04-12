
export class Version
{

	constructor(version)
	{
		this.version = version;
		let vmLength = version.indexOf('.') === -1 ? version.length : version.indexOf('.');
		this.versionMajor = parseInt(version.substr(0, vmLength));
		this.versionMinor = parseInt(version.substr(vmLength + 1));
		if (this.versionMinor.length === 0) 
		{
			this.versionMinor = 0;
		}
	}

	newerThan(version)
	{
		let v = new Version(version);

		if (this.versionMajor > v.versionMajor) 
		{
			return true;
		}
		else
		{
			return this.versionMajor === v.versionMajor && this.versionMinor > v.versionMinor;
		}
	}

	equalOrHigher(version)
	{
		let v = new Version(version);

		if (this.versionMajor > v.versionMajor) 
		{
			return true;
		}
		else
		{
			return this.versionMajor === v.versionMajor && this.versionMinor >= v.versionMinor;
		}
	}

	upTo(version)
	{
		return !this.newerThan(version);
	}
}

