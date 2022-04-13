import {Vector3, Box3, BufferAttribute, BufferGeometry} from 'three';
import {Global} from '../../Global.js';
import {LASFile, LASDecoder} from '../LASLoader.js';
import {WorkerManager} from '../../utils/WorkerManager.js';
import {XHRFactory} from '../../XHRFactory.js';

/**
 * laslaz code taken and adapted from plas.io js-laslaz
 *	http://plas.io/
 *	https://github.com/verma/plasio
 *
 * Thanks to Uday Verma and Howard Butler
 */
export class EptLaszipLoader
{
	load(node)
	{
		if (node.loaded)
		{
			return;
		}

		const url = node.url() + '.laz';

		const xhr = XHRFactory.createXMLHttpRequest();
		xhr.open('GET', url, true);
		xhr.responseType = 'arraybuffer';
		xhr.overrideMimeType('text/plain; charset=x-user-defined');
		xhr.onreadystatechange = () =>
		{
			if (xhr.readyState === 4)
			{
				if (xhr.status === 200)
				{
					const buffer = xhr.response;
					this.parse(node, buffer);
				}
				else
				{
					console.log('Failed ' + url + ': ' + xhr.status);
				}
			}
		};

		xhr.send(null);
	}

	parse(node, buffer)
	{
		const lf = new LASFile(buffer);
		const handler = new EptLazBatcher(node);

		lf.open()
			.then(() =>
			{
				lf.isOpen = true;
				return lf.getHeader();
			})
			.then((header) =>
			{
				const i = 0;
				const np = header.pointsCount;

				const toArray = (v) =>
				{
					return [v.x, v.y, v.z];
				};
				const mins = toArray(node.key.b.min);
				const maxs = toArray(node.key.b.max);

				const read = () =>
				{
					const p = lf.readData(1000000, 0, 1);
					return p.then(function(data)
					{
						const d = new LASDecoder(
							data.buffer,
							header.pointsFormatId,
							header.pointsStructSize,
							data.count,
							header.scale,
							header.offset,
							mins,
							maxs);
						d.extraBytes = header.extraBytes;
						d.pointsFormatId = header.pointsFormatId;
						handler.push(d);

						i += data.count;

						if (data.hasMoreData)
						{
							return read();
						}
						else
						{
							header.totalRead = i;
							header.versionAsString = lf.versionAsString;
							header.isCompressed = lf.isCompressed;
							return null;
						}
					});
				};

				return read();
			})
			.then(() => {return lf.close();})
			.then(() => {return lf.isOpen = false;})
			.catch((err) =>
			{
				console.log('Error reading LAZ:', err);
				if (lf.isOpen)
				{
					lf.close().then(() =>
					{
						lf.isOpen = false;
						throw err;
					});
				}
				else {throw err;}
			});
	}
}

export class EptLazBatcher
{
	constructor(node)
	{
		this.node = node;
	}

	push(las)
	{
		const worker = Global.workerPool.getWorker(WorkerManager.EPT_LAS_ZIP_DECODER);

		worker.onmessage = (e) =>
		{
			const g = new BufferGeometry();
			const numPoints = las.pointsCount;

			const positions = new Float32Array(e.data.position);
			const colors = new Uint8Array(e.data.color);

			const intensities = new Float32Array(e.data.intensity);
			const classifications = new Uint8Array(e.data.classification);
			const returnNumbers = new Uint8Array(e.data.returnNumber);
			const numberOfReturns = new Uint8Array(e.data.numberOfReturns);
			const pointSourceIDs = new Uint16Array(e.data.pointSourceID);
			const indices = new Uint8Array(e.data.indices);

			g.setAttribute('position', new BufferAttribute(positions, 3));
			g.setAttribute('color', new BufferAttribute(colors, 4, true));
			g.setAttribute('intensity', new BufferAttribute(intensities, 1));
			g.setAttribute('classification', new BufferAttribute(classifications, 1));
			g.setAttribute('returnNumber', new BufferAttribute(returnNumbers, 1));
			g.setAttribute('numberOfReturns', new BufferAttribute(numberOfReturns, 1));
			g.setAttribute('pointSourceID', new BufferAttribute(pointSourceIDs, 1));
			g.setAttribute('indices', new BufferAttribute(indices, 4));
			g.attributes.indices.normalized = true;

			const tightBoundingBox = new Box3(
				new Vector3().fromArray(e.data.tightBoundingBox.min),
				new Vector3().fromArray(e.data.tightBoundingBox.max)
			);

			this.node.doneLoading(g, tightBoundingBox, numPoints, new Vector3(...e.data.mean));

			Global.workerPool.returnWorker(WorkerManager.EPT_LAS_ZIP_DECODER, worker);
		};

		const message = {
			buffer: las.arrayb,
			numPoints: las.pointsCount,
			pointSize: las.pointSize,
			pointFormatID: las.pointsFormatId,
			scale: las.scale,
			offset: las.offset,
			mins: las.mins,
			maxs: las.maxs
		};

		worker.postMessage(message, [message.buffer]);
	};
}

