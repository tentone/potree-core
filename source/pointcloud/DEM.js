import {Vector3} from 'three';
import {WorkerManager} from '../utils/WorkerManager';
import {Global} from '../Global';
import {DEMNode} from './DEMNode';

export class DEM
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

	// expands the tree to all nodes that intersect <box> at <level> returns the intersecting nodes at <level>
	expandAndFindByBox(box, level)
	{
		if (level === 0)
		{
			return [this.root];
		}

		const result = [];
		const stack = [this.root];

		while (stack.length > 0)
		{
			const node = stack.pop();
			const nodeBoxSize = node.box.getSize(new Vector3());

			// check which children intersect by transforming min/max to quadrants
			const min = {
				x: (box.min.x - node.box.min.x) / nodeBoxSize.x,
				y: (box.min.y - node.box.min.y) / nodeBoxSize.y
			};
			const max = {
				x: (box.max.x - node.box.max.x) / nodeBoxSize.x,
				y: (box.max.y - node.box.max.y) / nodeBoxSize.y
			};

			min.x = min.x < 0.5 ? 0 : 1;
			min.y = min.y < 0.5 ? 0 : 1;
			max.x = max.x < 0.5 ? 0 : 1;
			max.y = max.y < 0.5 ? 0 : 1;

			let childIndices;
			if (min.x === 0 && min.y === 0 && max.x === 1 && max.y === 1)
			{
				childIndices = [0, 1, 2, 3];
			}
			else if (min.x === max.x && min.y === max.y)
			{
				childIndices = [min.x << 1 | min.y];
			}
			else
			{
				childIndices = [min.x << 1 | min.y, max.x << 1 | max.y];
			}

			for (const index of childIndices)
			{
				if (node.children[index] === undefined)
				{
					const childBox = node.box.clone();

					if ((index & 2) > 0)
					{
						childBox.min.x += nodeBoxSize.x / 2.0;
					}
					else
					{
						childBox.max.x -= nodeBoxSize.x / 2.0;
					}

					if ((index & 1) > 0)
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

				if (child.level < level)
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
		const [x, y] = uv.map((n) =>
		{
			return n < 0.5 ? 0 : 1;
		});

		const index = x << 1 | y;

		return index;
	}

	height(position)
	{
		if (!this.root)
		{
			return 0;
		}

		let height = null;
		const list = [this.root];
		while (true)
		{
			const node = list[list.length - 1];

			const currentHeight = node.height(position);

			if (currentHeight !== null)
			{
				height = currentHeight;
			}

			const uv = node.uv(position);
			const childIndex = this.childIndex(uv);

			if (node.children[childIndex])
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
		// check if point cloud transformation changed
		if (this.matrix === null || !this.matrix.equals(this.pointcloud.matrixWorld))
		{
			this.matrix = this.pointcloud.matrixWorld.clone();
			this.boundingBox = this.pointcloud.boundingBox.clone().applyMatrix4(this.matrix);
			this.root = new DEMNode('r', this.boundingBox, this.tileSize);
			this.version++;
		}

		// find node to update
		let node = null;
		for (const vn of visibleNodes)
		{
			if (vn.demVersion === undefined || vn.demVersion < this.version)
			{
				node = vn;
				break;
			}
		}
		if (node === null)
		{
			return;
		}

		// update node
		const projectedBox = node.getBoundingBox().clone().applyMatrix4(this.matrix);
		const projectedBoxSize = projectedBox.getSize(new Vector3());

		const targetNodes = this.expandAndFindByBox(projectedBox, node.getLevel());
		node.demVersion = this.version;

		const position = node.geometryNode.geometry.attributes.position.array;
		const message =
			{
				boundingBox:
					{
						min: node.getBoundingBox().min.toArray(),
						max: node.getBoundingBox().max.toArray()
					},
				position: new Float32Array(position).buffer
			};
		const transferables = [message.position];

		const self = this;

		Global.workerPool.runTask(WorkerManager.DEM, function(e)
		{
			const data = new Float32Array(e.data.dem.data);

			for (const demNode of targetNodes)
			{
				const boxSize = demNode.box.getSize(new Vector3());

				for (let i = 0; i < self.tileSize; i++)
				{
					for (let j = 0; j < self.tileSize; j++)
					{
						const u = i / (self.tileSize - 1);
						const v = j / (self.tileSize - 1);

						const x = demNode.box.min.x + u * boxSize.x;
						const y = demNode.box.min.y + v * boxSize.y;

						let ix = self.tileSize * (x - projectedBox.min.x) / projectedBoxSize.x;
						let iy = self.tileSize * (y - projectedBox.min.y) / projectedBoxSize.y;

						if (ix < 0 || ix > self.tileSize)
						{
							continue;
						}

						if (iy < 0 || iy > self.tileSize)
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
}
