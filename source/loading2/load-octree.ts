import {OctreeLoader} from './OctreeLoader';
import {type RequestManager} from './RequestManager';


/**
 * Loads an octree geometry from a specified URL using the provided request manager.
 *
 * @param url - The URL of the octree geometry to load.
 * @param requestManager - The request manager to handle network requests.
 * @returns A promise that resolves to the loaded octree geometry.
 */
export async function loadOctree(
	url: string,
	requestManager: RequestManager
) 
{
	const loader = new OctreeLoader();
	const {geometry} = await loader.load(url, requestManager);
	
	return geometry;
}
