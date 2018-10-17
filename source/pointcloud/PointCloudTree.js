"use strict";

class PointCloudTreeNode
{
	constructor()
	{
		this.needsTransformUpdate = true;
	}

	getChildren(){}

	getBoundingBox(){}

	isLoaded(){}

	isGeometryNode(){}

	isTreeNode(){}

	getLevel(){}

	getBoundingSphere(){}
};

class PointCloudTree extends THREE.Object3D
{
	constructor()
	{
		super();

		this.dem = new PotreeDEM(this);
	}

	initialized()
	{
		return this.root !== null;
	}
};