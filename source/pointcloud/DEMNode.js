"use strict";

//index is in order xyzxyzxyz
class DEMNode
{
	constructor(name, box, tileSize)
	{
		this.name = name;
		this.box = box;
		this.tileSize = tileSize;
		this.level = this.name.length - 1;
		this.data = new Float32Array(tileSize * tileSize);
		this.data.fill(-Infinity);
		this.children = [];

		this.mipMap = [this.data];
		this.mipMapNeedsUpdate = true;
	}

	createMipMap()
	{
		this.mipMap = [this.data];

		var sourceSize = this.tileSize;
		var mipSize = parseInt(sourceSize / 2);
		var mipSource = this.data;
		while(mipSize > 1)
		{
			var mipData = new Float32Array(mipSize * mipSize);

			for(var i = 0; i < mipSize; i++)
			{
				for(var j = 0; j < mipSize; j++)
				{
					var h00 = mipSource[2 * i + 0 + 2 * j * sourceSize];
					var h01 = mipSource[2 * i + 0 + 2 * j * sourceSize + sourceSize];
					var h10 = mipSource[2 * i + 1 + 2 * j * sourceSize];
					var h11 = mipSource[2 * i + 1 + 2 * j * sourceSize + sourceSize];

					var [height, weight] = [0, 0];

					if(isFinite(h00))
					{
						height += h00;
						weight += 1;
					};
					if(isFinite(h01))
					{
						height += h01;
						weight += 1;
					};
					if(isFinite(h10))
					{
						height += h10;
						weight += 1;
					};
					if(isFinite(h11))
					{
						height += h11;
						weight += 1;
					};

					height = height / weight;

					//var hs = [h00, h01, h10, h11].filter(h => isFinite(h));
					//var height = hs.reduce((a, v, i) => a + v, 0) / hs.length;

					mipData[i + j * mipSize] = height;
				}
			}

			this.mipMap.push(mipData);

			mipSource = mipData;
			sourceSize = mipSize;
			mipSize = parseInt(mipSize / 2);
		}

		this.mipMapNeedsUpdate = false;
	}

	uv(position)
	{
		var boxSize = this.box.getSize(new THREE.Vector3());

		var u = (position.x - this.box.min.x) / boxSize.x;
		var v = (position.y - this.box.min.y) / boxSize.y;

		return [u, v];
	}

	heightAtMipMapLevel(position, mipMapLevel)
	{
		var uv = this.uv(position);

		var tileSize = parseInt(this.tileSize / parseInt(2 ** mipMapLevel));
		var data = this.mipMap[mipMapLevel];

		var i = Math.min(uv[0] * tileSize, tileSize - 1);
		var j = Math.min(uv[1] * tileSize, tileSize - 1);

		var a = i % 1;
		var b = j % 1;

		var [i0, i1] = [Math.floor(i), Math.ceil(i)];
		var [j0, j1] = [Math.floor(j), Math.ceil(j)];

		var h00 = data[i0 + tileSize * j0];
		var h01 = data[i0 + tileSize * j1];
		var h10 = data[i1 + tileSize * j0];
		var h11 = data[i1 + tileSize * j1];

		var wh00 = isFinite(h00) ? (1 - a) * (1 - b) : 0;
		var wh01 = isFinite(h01) ? (1 - a) * b : 0;
		var wh10 = isFinite(h10) ? a * (1 - b) : 0;
		var wh11 = isFinite(h11) ? a * b : 0;

		var wsum = wh00 + wh01 + wh10 + wh11;
		wh00 = wh00 / wsum;
		wh01 = wh01 / wsum;
		wh10 = wh10 / wsum;
		wh11 = wh11 / wsum;

		if(wsum === 0)
		{
			return null;
		}

		var h = 0;

		if(isFinite(h00)) h += h00 * wh00;
		if(isFinite(h01)) h += h01 * wh01;
		if(isFinite(h10)) h += h10 * wh10;
		if(isFinite(h11)) h += h11 * wh11;

		return h;
	}

	height(position)
	{
		var h = null;

		for(var i = 0; i < this.mipMap.length; i++)
		{
			h = this.heightAtMipMapLevel(position, i);

			if(h !== null)
			{
				return h;
			}
		}

		return h;
	}

	traverse(handler, level = 0)
	{
		handler(this, level);

		for(var child of this.children.filter(c => c !== undefined))
		{
			child.traverse(handler, level + 1);
		}
	}
};

export {DEMNode}