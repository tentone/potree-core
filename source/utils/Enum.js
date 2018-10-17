"use strict";

class EnumItem
{
	constructor(object)
	{
		for(var key of Object.keys(object))
		{
			this[key] = object[key];
		}
	}

	inspect()
	{
		return `Enum(${this.name}: ${this.value})`;
	}
};

class Enum
{
	constructor(object)
	{
		this.object = object;

		for(var key of Object.keys(object))
		{
			var value = object[key];

			if(typeof value === "object")
			{
				value.name = key;
			}
			else
			{
				value = {
					name: key,
					value: value
				};
			}

			this[key] = new EnumItem(value);
		}
	}

	fromValue(value)
	{
		for(var key of Object.keys(this.object))
		{
			if(this[key].value === value)
			{
				return this[key];
			}
		}

		throw new Error(`No enum for value: ${value}`);
	}

};
