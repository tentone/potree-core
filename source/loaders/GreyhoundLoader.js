"use strict";

Potree.GreyhoundLoader = function() {};
Potree.GreyhoundLoader.loadInfoJSON = function load(url, callback)
{};

/**
 * @return a point cloud octree with the root node data loaded.
 * loading of descendants happens asynchronously when they"re needed
 *
 * @param url
 * @param loadingFinishedListener executed after loading the binary has been
 * finished
 */
Potree.GreyhoundLoader.load = function load(url, callback)
{
	let HIERARCHY_STEP_SIZE = 5;

	try
	{
		// We assume everything ater the string "greyhound://" is the server url
		let serverURL = url.split("greyhound://")[1];
		if(serverURL.split("http://").length === 1 && serverURL.split("https://").length === 1)
		{
			serverURL = "http://" + serverURL;
		}

		GreyhoundUtils.fetch(serverURL + "info", function(err, data)
		{
			if(err) throw new Error(err);

			/* We parse the result of the info query, which should be a JSON
			 * datastructure somewhat like:
			{
			  "bounds": [635577, 848882, -1000, 639004, 853538, 2000],
			  "numPoints": 10653336,
			  "schema": [
			      { "name": "X", "size": 8, "type": "floating" },
			      { "name": "Y", "size": 8, "type": "floating" },
			      { "name": "Z", "size": 8, "type": "floating" },
			      { "name": "Intensity", "size": 2, "type": "unsigned" },
			      { "name": "OriginId", "size": 4, "type": "unsigned" },
			      { "name": "Red", "size": 2, "type": "unsigned" },
			      { "name": "Green", "size": 2, "type": "unsigned" },
			      { "name": "Blue", "size": 2, "type": "unsigned" }
			  ],
			  "srs": "<omitted for brevity>",
			  "type": "octree"
			}
			*/
			let greyhoundInfo = JSON.parse(data);
			let version = new Potree.Version("1.4");

			let bounds = greyhoundInfo.bounds;
			// TODO Unused: let boundsConforming = greyhoundInfo.boundsConforming;

			// TODO Unused: let width = bounds[3] - bounds[0];
			// TODO Unused: let depth = bounds[4] - bounds[1];
			// TODO Unused: let height = bounds[5] - bounds[2];
			// TODO Unused: let radius = width / 2;
			let scale = greyhoundInfo.scale || 0.01;
			if(Array.isArray(scale))
			{
				scale = Math.min(scale[0], scale[1], scale[2]);
			}

			if(GreyhoundUtils.getQueryParam("scale"))
			{
				scale = parseFloat(GreyhoundUtils.getQueryParam("scale"));
			}

			let baseDepth = Math.max(8, greyhoundInfo.baseDepth);

			// Ideally we want to change this bit completely, since
			// greyhound"s options are wider than the default options for
			// visualizing pointclouds. If someone ever has time to build a
			// custom ui element for greyhound, the schema options from
			// this info request should be given to the UI, so the user can
			// choose between them. The selected option can then be
			// directly requested from the server in the
			// PointCloudGreyhoundGeometryNode without asking for
			// attributes that we are not currently visualizing.  We assume
			// XYZ are always available.
			let attributes = ["POSITION_CARTESIAN"];

			// To be careful, we only add COLOR_PACKED as an option if all
			// colors are actually found.
			let red = false;
			let green = false;
			let blue = false;

			greyhoundInfo.schema.forEach(function(entry)
			{
				// Intensity and Classification are optional.
				if(entry.name === "Intensity")
				{
					attributes.push("INTENSITY");
				}
				if(entry.name === "Classification")
				{
					attributes.push("CLASSIFICATION");
				}

				if(entry.name === "Red") red = true;
				else if(entry.name === "Green") green = true;
				else if(entry.name === "Blue") blue = true;
			});

			if(red && green && blue) attributes.push("COLOR_PACKED");

			// Fill in geometry fields.
			let pgg = new Potree.PointCloudGreyhoundGeometry();
			pgg.serverURL = serverURL;
			pgg.spacing = (bounds[3] - bounds[0]) / Math.pow(2, baseDepth);
			pgg.baseDepth = baseDepth;
			pgg.hierarchyStepSize = HIERARCHY_STEP_SIZE;

			pgg.schema = GreyhoundUtils.createSchema(attributes);
			let pointSize = GreyhoundUtils.pointSizeFrom(pgg.schema);

			pgg.pointAttributes = new Potree.PointAttributes(attributes);
			pgg.pointAttributes.byteSize = pointSize;

			let boundingBox = new THREE.Box3(
				new THREE.Vector3().fromArray(bounds, 0),
				new THREE.Vector3().fromArray(bounds, 3)
			);

			let offset = boundingBox.min.clone();

			boundingBox.max.sub(boundingBox.min);
			boundingBox.min.set(0, 0, 0);

			pgg.projection = greyhoundInfo.srs;
			pgg.boundingBox = boundingBox;
			pgg.boundingSphere = boundingBox.getBoundingSphere(new THREE.Sphere());

			pgg.scale = scale;
			pgg.offset = offset;

			console.log("Scale:", scale);
			console.log("Offset:", offset);
			console.log("Bounds:", boundingBox);

			pgg.loader = new Potree.GreyhoundBinaryLoader(version, boundingBox, pgg.scale);

			let nodes = {};

			{ // load root
				let name = "r";

				let root = new Potree.PointCloudGreyhoundGeometryNode(
					name, pgg, boundingBox,
					scale, offset
				);

				root.level = 0;
				root.hasChildren = true;
				root.numPoints = greyhoundInfo.numPoints;
				root.spacing = pgg.spacing;
				pgg.root = root;
				pgg.root.load();
				nodes[name] = root;
			}

			pgg.nodes = nodes;

			GreyhoundUtils.getNormalization(serverURL, greyhoundInfo.baseDepth,
				function(_, normalize)
				{
					if(normalize.color) pgg.normalize.color = true;
					if(normalize.intensity) pgg.normalize.intensity = true;

					callback(pgg);
				}
			);
		});
	}
	catch(e)
	{
		console.log("loading failed: \"" + url + "\"");
		console.log(e);
		callback();
	}
};

Potree.GreyhoundLoader.loadPointAttributes = function(mno)
{
	let fpa = mno.pointAttributes;
	let pa = new Potree.PointAttributes();

	for(let i = 0; i < fpa.length; i++)
	{
		let pointAttribute = Potree.PointAttribute[fpa[i]];
		pa.add(pointAttribute);
	}

	return pa;
};

Potree.GreyhoundLoader.createChildAABB = function(aabb, childIndex)
{
	let min = aabb.min;
	let max = aabb.max;
	let dHalfLength = new THREE.Vector3().copy(max).sub(min).multiplyScalar(0.5);
	let xHalfLength = new THREE.Vector3(dHalfLength.x, 0, 0);
	let yHalfLength = new THREE.Vector3(0, dHalfLength.y, 0);
	let zHalfLength = new THREE.Vector3(0, 0, dHalfLength.z);

	let cmin = min;
	let cmax = new THREE.Vector3().add(min).add(dHalfLength);

	if(childIndex === 1)
	{
		min = new THREE.Vector3().copy(cmin).add(zHalfLength);
		max = new THREE.Vector3().copy(cmax).add(zHalfLength);
	}
	else if(childIndex === 3)
	{
		min = new THREE.Vector3().copy(cmin).add(zHalfLength).add(yHalfLength);
		max = new THREE.Vector3().copy(cmax).add(zHalfLength).add(yHalfLength);
	}
	else if(childIndex === 0)
	{
		min = cmin;
		max = cmax;
	}
	else if(childIndex === 2)
	{
		min = new THREE.Vector3().copy(cmin).add(yHalfLength);
		max = new THREE.Vector3().copy(cmax).add(yHalfLength);
	}
	else if(childIndex === 5)
	{
		min = new THREE.Vector3().copy(cmin).add(zHalfLength).add(xHalfLength);
		max = new THREE.Vector3().copy(cmax).add(zHalfLength).add(xHalfLength);
	}
	else if(childIndex === 7)
	{
		min = new THREE.Vector3().copy(cmin).add(dHalfLength);
		max = new THREE.Vector3().copy(cmax).add(dHalfLength);
	}
	else if(childIndex === 4)
	{
		min = new THREE.Vector3().copy(cmin).add(xHalfLength);
		max = new THREE.Vector3().copy(cmax).add(xHalfLength);
	}
	else if(childIndex === 6)
	{
		min = new THREE.Vector3().copy(cmin).add(xHalfLength).add(yHalfLength);
		max = new THREE.Vector3().copy(cmax).add(xHalfLength).add(yHalfLength);
	}

	return new THREE.Box3(min, max);
};
