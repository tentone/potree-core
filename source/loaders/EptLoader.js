"use strict";

import {PointCloudEptGeometry, PointCloudEptGeometryNode} from "../pointcloud/geometries/PointCloudEptGeometry.js";

/**
 * @author Connor Manning
 */
class EptLoader
{
	static async load(file, callback)
	{
		var response = await fetch(file);
		var json = await response.json();
		var url = file.substr(0, file.lastIndexOf("ept.json"));

		var geometry = new PointCloudEptGeometry(url, json);
		var root = new PointCloudEptGeometryNode(geometry);
		geometry.root = root;
		geometry.root.load();

		callback(geometry);
	}
};

export {EptLoader};
