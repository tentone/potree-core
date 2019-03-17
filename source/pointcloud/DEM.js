"use strict";

import {WorkerManager} from "../utils/WorkerManager.js";
import {Global} from "../Global.js";
import {DEMNode} from "./DEMNode.js";

class DEM
{
	constructor(pointcloud)
	{
		this.pointcloud = pointcloud;
		this.matrix = null;
		this.boundingBox = null;
		this.tileSize = 64;
		this.root = null;
		this.version = 0;
	}

	//expands the tree to all nodes that intersect <box> at <level> returns the intersecting nodes at <level>
	expandAndFindByBox(box, level)
	{
		if(level === 0)
		{
			return [this.root];
		}

		var result = [];
		var stack = [this.root];

		while(stack.length > 0)
		{
			var node = stack.pop();
			var nodeBoxSize = node.box.getSize(new THREE.Vector3());

			//check which children intersect by transforming min/max to quadrants
			var min = {
				x: (box.min.x - node.box.min.x) / nodeBoxSize.x,
				y: (box.min.y - node.box.min.y) / nodeBoxSize.y
			};
			var max = {
				x: (box.max.x - node.box.max.x) / nodeBoxSize.x,
				y: (box.max.y - node.box.max.y) / nodeBoxSize.y
			};

			min.x = min.x < 0.5 ? 0 : 1;
			min.y = min.y < 0.5 ? 0 : 1;
			max.x = max.x < 0.5 ? 0 : 1;
			max.y = max.y < 0.5 ? 0 : 1;

			var childIndices;
			if(min.x === 0 && min.y === 0 && max.x === 1 && max.y === 1)
			{
				childIndices = [0, 1, 2, 3];
			}
			else if(min.x === max.x && min.y === max.y)
			{
				childIndices = [(min.x << 1) | min.y];
			}
			else
			{
				childIndices = [(min.x << 1) | min.y, (max.x << 1) | max.y];
			}

			for(var index of childIndices)
			{
				if(node.children[index] === undefined)
				{
					var childBox = node.box.clone();

					if((index & 2) > 0)
					{
						childBox.min.x += nodeBoxSize.x / 2.0;
					}
					else
					{
						childBox.max.x -= nodeBoxSize.x / 2.0;
					}

					if((index & 1) > 0)
					{
						childBox.min.y += nodeBoxSize.y / 2.0;
					}
					else
					{
						childBox.max.y -= nodeBoxSize.y / 2.0;
					}

					var child = new DEMNode(node.name + index, childBox, this.tileSize);
					node.children[index] = child;
				}

				var child = node.children[index];

				if(child.level < level)
				{
					stack.push(child);
				}
				else
				{
					result.push(child);
				}
			}
		}

		return result;
	}

	childIndex(uv)
	{
		var [x, y] = uv.map(n => n < 0.5 ? 0 : 1);

		var index = (x << 1) | y;

		return index;
	}

	height(position)
	{
		if(!this.root)
		{
			return 0;
		}

		var height = null;
		var list = [this.root];
		while(true)
		{
			var node = list[list.length - 1];

			var currentHeight = node.height(position);

			if(currentHeight !== null)
			{
				height = currentHeight;
			}

			var uv = node.uv(position);
			var childIndex = this.childIndex(uv);

			if(node.children[childIndex])
			{
				list.push(node.children[childIndex]);
			}
			else
			{
				break;
			}
		}

		return height + this.pointcloud.position.z;
	}

	update(visibleNodes)
	{
		//check if point cloud transformation changed
		if(this.matrix === null || !this.matrix.equals(this.pointcloud.matrixWorld))
		{
			this.matrix = this.pointcloud.matrixWorld.clone();
			this.boundingBox = this.pointcloud.boundingBox.clone().applyMatrix4(this.matrix);
			this.root = new DEMNode("r", this.boundingBox, this.tileSize);
			this.version++;
		}

		//find node to update
		var node = null;
		for(var vn of visibleNodes)
		{
			if(vn.demVersion === undefined || vn.demVersion < this.version)
			{
				node = vn;
				break;
			}
		}
		if(node === null)
		{
			return;
		}

		//update node
		var projectedBox = node.getBoundingBox().clone().applyMatrix4(this.matrix);
		var projectedBoxSize = projectedBox.getSize(new THREE.Vector3());

		var targetNodes = this.expandAndFindByBox(projectedBox, node.getLevel());
		node.demVersion = this.version;

		var position = node.geometryNode.geometry.attributes.position.array;
		var message =
		{
			boundingBox:
			{
				min: node.getBoundingBox().min.toArray(),
				max: node.getBoundingBox().max.toArray()
			},
			position: new Float32Array(position).buffer
		};
		var transferables = [message.position];

		var self = this;

		Global.workerPool.runTask(WorkerManager.DEM, function(e)
		{
			var data = new Float32Array(e.data.dem.data);

			for(var demNode of targetNodes)
			{
				var boxSize = demNode.box.getSize(new THREE.Vector3());

				for(var i = 0; i < self.tileSize; i++)
				{
					for(var j = 0; j < self.tileSize; j++)
					{
						var u = (i / (self.tileSize - 1));
						var v = (j / (self.tileSize - 1));

						var x = demNode.box.min.x + u * boxSize.x;
						var y = demNode.box.min.y + v * boxSize.y;

						var ix = self.tileSize * (x - projectedBox.min.x) / projectedBoxSize.x;
						var iy = self.tileSize * (y - projectedBox.min.y) / projectedBoxSize.y;

						if(ix < 0 || ix > self.tileSize)
						{
							continue;
						}

						if(iy < 0 || iy > self.tileSize)
						{
							continue;
						}

						ix = Math.min(Math.floor(ix), self.tileSize - 1);
						iy = Math.min(Math.floor(iy), self.tileSize - 1);

						demNode.data[i + self.tileSize * j] = data[ix + self.tileSize * iy];
					}
				}

				demNode.createMipMap();
				demNode.mipMapNeedsUpdate = true;
			}
		}, message, transferables);
	}
};

export {DEM};