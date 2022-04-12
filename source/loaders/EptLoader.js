
import {PointCloudEptGeometry, PointCloudEptGeometryNode} from "../pointcloud/geometries/PointCloudEptGeometry.js";
import { XHRFactory } from "../XHRFactory.js";

export class EPTLoader
{
	static async load(file, callback)
	{
		const response = await XHRFactory.fetch(file);
		const json = await response.json();
		const url = file.substr(0, file.lastIndexOf("ept.json"));

		const geometry = new PointCloudEptGeometry(url, json);
		const root = new PointCloudEptGeometryNode(geometry);
		geometry.root = root;
		geometry.root.load();

		callback(geometry);
	}
}
