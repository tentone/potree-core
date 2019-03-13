"use strict";

class Points
{
	constructor()
	{
		this.boundingBox = new THREE.Box3();
		this.numPoints = 0;
		this.data = {};
	}

	add(points)
	{
		var currentSize = this.numPoints;
		var additionalSize = points.numPoints;
		var newSize = currentSize + additionalSize;

		var thisAttributes = Object.keys(this.data);
		var otherAttributes = Object.keys(points.data);
		var attributes = new Set([...thisAttributes, ...otherAttributes]);

		for(var attribute of attributes)
		{
			if(thisAttributes.includes(attribute) && otherAttributes.includes(attribute))
			{
				//attribute in both, merge
				var Type = this.data[attribute].constructor;
				var merged = new Type(this.data[attribute].length + points.data[attribute].length);
				merged.set(this.data[attribute], 0);
				merged.set(points.data[attribute], this.data[attribute].length);
				this.data[attribute] = merged;
			}
			else if(thisAttributes.includes(attribute) && !otherAttributes.includes(attribute))
			{
				//attribute only in this; take over this and expand to new size
				var elementsPerPoint = this.data[attribute].length / this.numPoints;
				var Type = this.data[attribute].constructor;
				var expanded = new Type(elementsPerPoint * newSize);
				expanded.set(this.data[attribute], 0);
				this.data[attribute] = expanded;
			}
			else if(!thisAttributes.includes(attribute) && otherAttributes.includes(attribute))
			{
				//attribute only in points to be added; take over new points and expand to new size
				var elementsPerPoint = points.data[attribute].length / points.numPoints;
				var Type = points.data[attribute].constructor;
				var expanded = new Type(elementsPerPoint * newSize);
				expanded.set(points.data[attribute], elementsPerPoint * currentSize);
				this.data[attribute] = expanded;
			}
		}

		this.numPoints = newSize;

		this.boundingBox.union(points.boundingBox);
	}
};

export {Points};
