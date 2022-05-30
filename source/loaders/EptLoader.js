import {PointCloudEptGeometry, PointCloudEptGeometryNode} from '../geometry/PointCloudEptGeometry';
import {XHRFactory} from '../XHRFactory';

export class EPTLoader
{
	static async load(file, callback)
	{
		const response = await XHRFactory.fetch(file);
		const json = await response.json();
		const url = file.substr(0, file.lastIndexOf('ept.json'));

		const geometry = new PointCloudEptGeometry(url, json);
		geometry.root = new PointCloudEptGeometryNode(geometry);
		geometry.root.load();

		callback(geometry);
	}
}
