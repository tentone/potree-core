import {OctreeLoader} from './OctreeLoader';
import {type RequestManager} from './RequestManager';

export async function loadOctree(
	url: string,
	requestManager: RequestManager
) 
{
	const loader = new OctreeLoader();
	const {geometry} = await loader.load(url, requestManager);
	return geometry;
}
