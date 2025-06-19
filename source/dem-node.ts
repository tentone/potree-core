import {Box3, Vector2, Vector3} from 'three';

/**
 * Digital Elevation Model (DEM) Node class.
 * 
 * This class represents a node in a hierarchical structure for storing elevation data.
 */
export class DEMNode 
{
	/**
	 * The level of the node in the hierarchy.
	 */
	public level: number;

	/**
	 * The elevation data for the node, stored as a Float32Array.
	 * 
	 * Each element corresponds to a height value at a specific position in the tile.
	 */
	public data: Float32Array;

	/**
	 * The children of this node, which are also DEMNode instances.
	 * 
	 * This allows for a hierarchical structure where each node can have multiple child nodes.
	 */
	public children: DEMNode[];

	/**
	 * The mipmap data for the node, which is an array of Float32Arrays.
	 * 
	 * Each element in the mipMap corresponds to a different level of detail for the elevation data.
	 */
	public mipMap: Float32Array[];

	/**
	 * Indicates whether the mipmap needs to be updated.
	 * 
	 * This is set to true when the node is created or when the elevation data changes, and should be set to false after the mipmap has been created.
	 */
	public mipMapNeedsUpdate: boolean = true;

	constructor(public name: string, public box: Box3, public tileSize: number) 
	{
		this.level = this.name.length - 1;
		this.data = new Float32Array(tileSize * tileSize);
		this.data.fill(-Infinity);
		this.children = [];

		this.mipMap = [this.data];
	}

	/**
	 * Creates the mipmap for this node.
	 */
	public createMipMap() 
	{
		this.mipMap = [this.data];

		let sourceSize = this.tileSize;
		let mipSize = sourceSize / 2;
		let mipSource = this.data;
		while (mipSize > 1) 
		{
			const mipData = new Float32Array(mipSize * mipSize);

			for (let i = 0; i < mipSize; i++) 
			{
				for (let j = 0; j < mipSize; j++) 
				{
					const h00 = mipSource[2 * i + 0 + 2 * j * sourceSize];
					const h01 = mipSource[2 * i + 0 + 2 * j * sourceSize + sourceSize];
					const h10 = mipSource[2 * i + 1 + 2 * j * sourceSize];
					const h11 = mipSource[2 * i + 1 + 2 * j * sourceSize + sourceSize];

					let [height, weight] = [0, 0];

					if (isFinite(h00)) 
					{
						height += h00;
						weight += 1;
					}
					if (isFinite(h01)) 
					{
						height += h01;
						weight += 1;
					}
					if (isFinite(h10)) 
					{
						height += h10;
						weight += 1;
					}
					if (isFinite(h11)) 
					{
						height += h11;
						weight += 1;
					}

					height = height / weight;

					// let hs = [h00, h01, h10, h11].filter(h => isFinite(h));
					// let height = hs.reduce( (a, v, i) => a + v, 0) / hs.length;

					mipData[i + j * mipSize] = height;
				}
			}

			this.mipMap.push(mipData);

			mipSource = mipData;
			sourceSize = mipSize;
			mipSize = Math.floor(mipSize / 2);
		}

		this.mipMapNeedsUpdate = false;
	}

	/**
	 * Gets the UV coordinates for a given position within the bounding box of this node.
	 * 
	 * @param position - The position in 2D space for which to calculate the UV coordinates.
	 * @returns UV coordinates as a tuple [u, v].
	 */
	public uv(position: Vector2): [number, number] 
	{
		const boxSize = new Vector3();
		this.box.getSize(boxSize);

		const u = (position.x - this.box.min.x) / boxSize.x;
		const v = (position.y - this.box.min.y) / boxSize.y;

		return [u, v];
	}

	/**
	 * Heights at a specific mipmap level for a given position.
	 * 
	 * @param position - The position in 2D space for which to calculate the height.
	 * @param mipMapLevel - The mipmap level to use for height calculation.
	 * @returns Height at the specified position and mipmap level, or null if no valid height is found.
	 */
	public heightAtMipMapLevel(position: Vector2, mipMapLevel: number) 
	{
		const uv = this.uv(position);

		const tileSize = Math.floor(this.tileSize / Math.floor(2 ** mipMapLevel));
		const data = this.mipMap[mipMapLevel];

		const i = Math.min(uv[0] * tileSize, tileSize - 1);
		const j = Math.min(uv[1] * tileSize, tileSize - 1);

		const a = i % 1;
		const b = j % 1;

		const [i0, i1] = [Math.floor(i), Math.ceil(i)];
		const [j0, j1] = [Math.floor(j), Math.ceil(j)];

		const h00 = data[i0 + tileSize * j0];
		const h01 = data[i0 + tileSize * j1];
		const h10 = data[i1 + tileSize * j0];
		const h11 = data[i1 + tileSize * j1];

		let wh00 = isFinite(h00) ? (1 - a) * (1 - b) : 0;
		let wh01 = isFinite(h01) ? (1 - a) * b : 0;
		let wh10 = isFinite(h10) ? a * (1 - b) : 0;
		let wh11 = isFinite(h11) ? a * b : 0;

		const wsum = wh00 + wh01 + wh10 + wh11;
		wh00 = wh00 / wsum;
		wh01 = wh01 / wsum;
		wh10 = wh10 / wsum;
		wh11 = wh11 / wsum;

		if (wsum === 0) 
		{
			return null;
		}

		let h = 0;

		if (isFinite(h00)) 
		{
			h += h00 * wh00;
		}
		if (isFinite(h01)) 
		{
			h += h01 * wh01;
		}
		if (isFinite(h10)) 
		{
			h += h10 * wh10;
		}
		if (isFinite(h11)) 
		{
			h += h11 * wh11;
		}

		return h;
	}

	/**
	 * Gets the height at a specific position by checking all mipmap levels.
	 * 
	 * @param position - The position in 2D space for which to calculate the height.
	 * @returns Returns the height at the specified position, or null if no valid height is found.
	 */
	public height(position: Vector2) 
	{
		let h = null;

		for (let i = 0; i < this.mipMap.length; i++) 
		{
			h = this.heightAtMipMapLevel(position, i);

			if (h !== null) 
			{
				return h;
			}
		}

		return h;
	}

	/**
	 * Travels through the hierarchy of DEM nodes, applying a handler function to each node.
	 * 
	 * @param handler - A function that takes a DEMNode and a level as arguments, allowing custom processing of each node.
	 * @param level - The current level in the hierarchy, starting from 0 for the root node.
	 */
	public traverse(handler: (node: DEMNode, level: number)=> void, level = 0) 
	{
		handler(this, level);

		this.children.filter((c) => {return c !== undefined;}).forEach((child) => {return child.traverse(handler, level + 1);});
	}
}
