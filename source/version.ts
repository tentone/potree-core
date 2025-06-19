export class Version 
{
	public version: string;

	public versionMajor: number;

	public versionMinor: number = 0;

	public constructor(version: string) 
	{
		this.version = version;

		const vmLength = version.indexOf('.') === -1 ? version.length : version.indexOf('.');
		this.versionMajor = parseInt(version.substr(0, vmLength), 10);
		this.versionMinor = parseInt(version.substr(vmLength + 1), 10);
		if (isNaN(this.versionMinor)) 
		{
			this.versionMinor = 0;
		}
	}

	/**
	 * Checks if this version is newer than the given version.
	 * 
	 * @param version - The version to compare against.
	 * @returns True if this version is newer than the given version, false otherwise.
	 */
	public newerThan(version: string): boolean 
	{
		const v = new Version(version);

		if (this.versionMajor > v.versionMajor) 
		{
			return true;
		}
		else if (this.versionMajor === v.versionMajor && this.versionMinor > v.versionMinor) 
		{
			return true;
		}
		else 
		{
			return false;
		}
	}

	/**
	 * Checks if this version is equal or higher than the given version.
	 * 
	 * @param version - The version to compare against.
	 * @returns True if this version is equal or higher than the given version, false otherwise.
	 */
	public equalOrHigher(version: string): boolean 
	{
		const v = new Version(version);

		if (this.versionMajor > v.versionMajor) 
		{
			return true;
		}
		else if (this.versionMajor === v.versionMajor && this.versionMinor >= v.versionMinor) 
		{
			return true;
		}
		else 
		{
			return false;
		}
	}

	/**
	 * Checks if this version is equal or lower than the given version.
	 * 
	 * @param version - The version to compare against.
	 * @returns True if this version is equal or lower than the given version, false otherwise.
	 */
	public upTo(version: string): boolean 
	{
		return !this.newerThan(version);
	}
}
