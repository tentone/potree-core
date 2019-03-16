"use strict";

import {DEM} from "./DEM.js";

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

		this.dem = new DEM(this);
	}

	initialized()
	{
		return this.root !== null;
	}
};

export {PointCloudTree, PointCloudTreeNode};
