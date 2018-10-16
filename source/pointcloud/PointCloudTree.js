"use strict";

Potree.PointCloudTreeNode = class
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

Potree.PointCloudTree = class PointCloudTree extends THREE.Object3D
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