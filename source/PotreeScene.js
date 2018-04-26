"use strict";

/*
 * Potree object is a wrapper to use Potree alongside other THREE based frameworks.
 * 
 * The object can be used a normal Object3D.
 */
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

	setBudget(budget)
	{
		Potree.pointBudget = budget;
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

	add(object)
	{
		if(object instanceof Potree.PointCloudTree)
		{
			this.pointclouds.push(object);
		}

		THREE.Object3D.prototype.add.call(this, object);
	}

	getBoundingBox()
	{
		var box = new THREE.Box3();

		this.updateMatrixWorld(true);

		for(var pointcloud of this.pointclouds)
		{
			pointcloud.updateMatrixWorld(true);

			var pointcloudBox = pointcloud.pcoGeometry.tightBoundingBox ? pointcloud.pcoGeometry.tightBoundingBox : pointcloud.boundingBox;
			var boxWorld = Potree.utils.computeTransformedBoundingBox(pointcloudBox, pointcloud.matrixWorld);
			box.union(boxWorld);
		}

		return box;
	}

	estimateHeightAt(position)
	{
		var height = null;
		var fromSpacing = Infinity;

		for(var pointcloud of this.pointclouds)
		{
			if(pointcloud.root.geometryNode === undefined)
			{
				continue;
			}

			var pHeight = null;
			var pFromSpacing = Infinity;

			var lpos = position.clone().sub(pointcloud.position);
			lpos.z = 0;
			var ray = new THREE.Ray(lpos, new THREE.Vector3(0, 0, 1));

			var stack = [pointcloud.root];
			while(stack.length > 0)
			{
				var node = stack.pop();
				var box = node.getBoundingBox();
				var inside = ray.intersectBox(box);

				if(!inside)
				{
					continue;
				}

				var h = node.geometryNode.mean.z + pointcloud.position.z + node.geometryNode.boundingBox.min.z;

				if(node.geometryNode.spacing <= pFromSpacing)
				{
					pHeight = h;
					pFromSpacing = node.geometryNode.spacing;
				}

				for(var index of Object.keys(node.children))
				{
					var child = node.children[index];
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
