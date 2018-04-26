"use strict";

class PotreeScene extends THREE.Object3D
{
	constructor()
	{
		super();

		this.rotation.set(-Math.PI / 2, 0, 0);
		this.updateMatrixWorld(true);

		this.pointclouds = [];
		this.minNodeSize = 30;
	}

	update(camera, renderer)
	{
		Potree.pointLoadLimit = Potree.pointBudget * 2;

		for(var pointcloud of this.pointclouds)
		{
			pointcloud.showBoundingBox = false;
			pointcloud.generateDEM = false;
			pointcloud.minimumNodePixelSize = this.minNodeSize;
		}

		Potree.updatePointClouds(this.pointclouds, camera, renderer);
	}

	raycast(raycaster, intersects) 
	{
		//TODO <ADD CODE HERE>
	}

	onBeforeRender(renderer, scene, camera, geometry, material, group)
	{
		//TODO <ADD CODE HERE>
	}

	addPointCloud(object)
	{
		if(object instanceof Potree.PointCloudTree)
		{
			this.pointclouds.push(object);
		}

		this.add(object);
	}

	getBoundingBox()
	{
		let box = new THREE.Box3();

		this.updateMatrixWorld(true);

		for(let pointcloud of this.pointclouds)
		{
			pointcloud.updateMatrixWorld(true);

			let pointcloudBox = pointcloud.pcoGeometry.tightBoundingBox ? pointcloud.pcoGeometry.tightBoundingBox : pointcloud.boundingBox;
			let boxWorld = Potree.utils.computeTransformedBoundingBox(pointcloudBox, pointcloud.matrixWorld);
			box.union(boxWorld);
		}

		return box;
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
};
