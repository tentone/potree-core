
export class Version
{
	constructor(version)
	{
		this.version = version;

		const vmLength = version.indexOf('.') === -1 ? version.length : version.indexOf('.');

		this.versionMajor = parseInt(version.substr(0, vmLength));
		this.versionMinor = parseInt(version.substr(vmLength + 1));

		if (this.versionMinor.length === 0) 
		{
			this.versionMinor = 0;
		}
	}

	/**
	 * Check if the version is newer than the given version.
	 * 
	 * @param {*} version Version to compare to.
	 * @returns True if the version is newer than the given version.
	 */
	newerThan(version)
	{
		const v = new Version(version);

		return this.versionMajor > v.versionMajor || (this.versionMajor === v.versionMajor && this.versionMinor > v.versionMinor);
	}

	/**
	 * Check if the version is equal or higher than the given version.
	 * 
	 * @param {*} version Version to compare to.
	 * @returns True if the version is equal or higher than the given version.
	 */
	equalOrHigher(version)
	{
		const v = new Version(version);

		return this.versionMajor > v.versionMajor || (this.versionMajor === v.versionMajor && this.versionMinor >= v.versionMinor);
	}

	/**
	 * Check if the version is equal or lower than the given version.
	 * 
	 * @param {*} version Version to compare to.
	 * @returns True if the version is equal or lower than the given version.
	 */
	upTo(version)
	{
		return !this.newerThan(version);
	}
}

