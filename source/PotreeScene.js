"use strict";

class PotreeScene
{
	constructor()
	{
		this.scene = new THREE.Object3D();
		
		this.scenePointCloud = new THREE.Object3D();
		this.scenePointCloud.rotation.set(-Math.PI / 2, 0, 0);
		this.scenePointCloud.updateMatrixWorld(true);
		
		this.referenceFrame = new THREE.Object3D();
		this.scenePointCloud.add(this.referenceFrame);

		this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000000);
		this.camera.position.set(1000, 1000, 1000);

		this.pointclouds = [];
		this.volumes = [];
		this.polygonClipVolumes = [];
	}
	
	estimateHeightAt(position)
	{
		let height = null;
		let fromSpacing = Infinity;

		for(let pointcloud of this.pointclouds)
		{
			if(pointcloud.root.geometryNode === undefined)
			{
				continue;
			}

			let pHeight = null;
			let pFromSpacing = Infinity;

			let lpos = position.clone().sub(pointcloud.position);
			lpos.z = 0;
			let ray = new THREE.Ray(lpos, new THREE.Vector3(0, 0, 1));

			let stack = [pointcloud.root];
			while(stack.length > 0)
			{
				let node = stack.pop();
				let box = node.getBoundingBox();
				let inside = ray.intersectBox(box);

				if(!inside)
				{
					continue;
				}

				let h = node.geometryNode.mean.z + pointcloud.position.z + node.geometryNode.boundingBox.min.z;

				if(node.geometryNode.spacing <= pFromSpacing)
				{
					pHeight = h;
					pFromSpacing = node.geometryNode.spacing;
				}

				for(let index of Object.keys(node.children))
				{
					let child = node.children[index];
					if(child.geometryNode)
					{
						stack.push(node.children[index]);
					}
				}
			}

			if(height === null || pFromSpacing < fromSpacing)
			{
				height = pHeight;
				fromSpacing = pFromSpacing;
			}
		}

		return height;
	}
	
	getBoundingBox(pointclouds = this.pointclouds)
	{
		let box = new THREE.Box3();

		this.scenePointCloud.updateMatrixWorld(true);
		this.referenceFrame.updateMatrixWorld(true);

		for(let pointcloud of pointclouds)
		{
			pointcloud.updateMatrixWorld(true);

			let pointcloudBox = pointcloud.pcoGeometry.tightBoundingBox ? pointcloud.pcoGeometry.tightBoundingBox : pointcloud.boundingBox;
			let boxWorld = Potree.utils.computeTransformedBoundingBox(pointcloudBox, pointcloud.matrixWorld);
			box.union(boxWorld);
		}

		return box;
	}

	addPointCloud(pointcloud)
	{
		this.pointclouds.push(pointcloud);
		this.scenePointCloud.add(pointcloud);
	};

	addVolume(volume)
	{
		this.volumes.push(volume);
	};

	removeVolume(volume)
	{
		let index = this.volumes.indexOf(volume);
		if(index > -1)
		{
			this.volumes.splice(index, 1);
		}
	};

	addPolygonClipVolume(volume)
	{
		this.polygonClipVolumes.push(volume);
	};
	
	removePolygonClipVolume(volume)
	{
		let index = this.polygonClipVolumes.indexOf(volume);
		if(index > -1)
		{
			this.polygonClipVolumes.splice(index, 1);
		}
	};

	removeAllMeasurements()
	{
		while(this.volumes.length > 0)
		{
			this.removeVolume(this.volumes[0]);
		}
	}

	removeAllClipVolumes()
	{
		let clipVolumes = this.volumes.filter(volume => volume.clip === true);
		for(let clipVolume of clipVolumes)
		{
			this.removeVolume(clipVolume);
		}

		while(this.polygonClipVolumes.length > 0)
		{
			this.removePolygonClipVolume(this.polygonClipVolumes[0]);
		}
	}

	getActiveCamera()
	{
		return this.camera;
	}
};
