onmessage = function(event) 
{
	const boundingBox = event.data.boundingBox;
	const position = new Float32Array(event.data.position);
	const width = 64;
	const height = 64;
	const numPoints = position.length / 3;

	const boxSize = {
		x: boundingBox.max[0] - boundingBox.min[0],
		y: boundingBox.max[1] - boundingBox.min[1],
		z: boundingBox.max[2] - boundingBox.min[2]
	};

	const dem = new Float32Array(width * height);
	dem.fill(-Infinity);
	for (let i = 0; i < numPoints; i++) 
	{
		const x = position[3 * i];
		const y = position[3 * i + 1];
		const z = position[3 * i + 2];

		const dx = x / boxSize.x;
		const dy = y / boxSize.y;

		const ix = parseInt(Math.min(width * dx, width - 1));
		const iy = parseInt(Math.min(height * dy, height - 1));

		const index = ix + width * iy;
		dem[index] = z;
	}

	const message = {
		dem: {
			width: width,
			height: height,
			data: dem.buffer
		}
	};

	postMessage(message, [message.dem.data]);
};
