/**
 * @class Loads mno files and returns a PointcloudOctree
 * for a description of the mno binary file format, read mnoFileFormat.txt
 *
 * @author Markus Schuetz
 */
Potree.POCLoader = function(){};

/**
 * @return a point cloud octree with the root node data loaded.
 * loading of descendants happens asynchronously when they"re needed
 *
 * @param url
 * @param loadingFinishedListener executed after loading the binary has been finished
 */
Potree.POCLoader.load = function(url, callback)
{
	try
	{
		var pco = new PointCloudOctreeGeometry();
		pco.url = url;
		
		var xhr = new XMLHttpRequest();
		xhr.overrideMimeType("text/plain");
		xhr.open("GET", url, true);
		xhr.onreadystatechange = function()
		{
			if(xhr.readyState === 4 && (xhr.status === 200 || xhr.status === 0))
			{
				var fMno = JSON.parse(xhr.responseText);

				var version = new VersionUtils(fMno.version);

				//Assume dir as absolute if it starts with http
				if(fMno.octreeDir.indexOf("http") === 0)
				{
					pco.octreeDir = fMno.octreeDir;
				}
				else
				{
					pco.octreeDir = url + "/../" + fMno.octreeDir;
				}

				pco.spacing = fMno.spacing;
				pco.hierarchyStepSize = fMno.hierarchyStepSize;

				pco.pointAttributes = fMno.pointAttributes;

				var min = new THREE.Vector3(fMno.boundingBox.lx, fMno.boundingBox.ly, fMno.boundingBox.lz);
				var max = new THREE.Vector3(fMno.boundingBox.ux, fMno.boundingBox.uy, fMno.boundingBox.uz);
				var boundingBox = new THREE.Box3(min, max);
				var tightBoundingBox = boundingBox.clone();

				if(fMno.tightBoundingBox)
				{
					tightBoundingBox.min.copy(new THREE.Vector3(fMno.tightBoundingBox.lx, fMno.tightBoundingBox.ly, fMno.tightBoundingBox.lz));
					tightBoundingBox.max.copy(new THREE.Vector3(fMno.tightBoundingBox.ux, fMno.tightBoundingBox.uy, fMno.tightBoundingBox.uz));
				}

				var offset = min.clone();

				boundingBox.min.sub(offset);
				boundingBox.max.sub(offset);

				tightBoundingBox.min.sub(offset);
				tightBoundingBox.max.sub(offset);

				pco.projection = fMno.projection;
				pco.boundingBox = boundingBox;
				pco.tightBoundingBox = tightBoundingBox;
				pco.boundingSphere = boundingBox.getBoundingSphere(new THREE.Sphere());
				pco.tightBoundingSphere = tightBoundingBox.getBoundingSphere(new THREE.Sphere());
				pco.offset = offset;

				//Select the appropiate loader
				if(fMno.pointAttributes === "LAS")
				{
					pco.loader = new Potree.LASLAZLoader(fMno.version);
				}
				else if(fMno.pointAttributes === "LAZ")
				{
					pco.loader = new Potree.LASLAZLoader(fMno.version);
				}
				else
				{
					pco.loader = new Potree.BinaryLoader(fMno.version, boundingBox, fMno.scale);
					pco.pointAttributes = new Potree.PointAttributes(pco.pointAttributes);
				}

				var nodes = {};

				//load root
				var name = "r";

				var root = new PointCloudOctreeGeometryNode(name, pco, boundingBox);
				root.level = 0;
				root.hasChildren = true;
				root.spacing = pco.spacing;
				if(version.upTo("1.5"))
				{
					root.numPoints = fMno.hierarchy[0][1];
				}
				else
				{
					root.numPoints = 0;
				}
				pco.root = root;
				pco.root.load();
				nodes[name] = root;

				//load remaining hierarchy
				if(version.upTo("1.4"))
				{
					for(var i = 1; i < fMno.hierarchy.length; i++)
					{
						var name = fMno.hierarchy[i][0];
						var numPoints = fMno.hierarchy[i][1];
						var index = parseInt(name.charAt(name.length - 1));
						var parentName = name.substring(0, name.length - 1);
						var parentNode = nodes[parentName];
						var level = name.length - 1;
						var boundingBox = Potree.POCLoader.createChildAABB(parentNode.boundingBox, index);

						var node = new PointCloudOctreeGeometryNode(name, pco, boundingBox);
						node.level = level;
						node.numPoints = numPoints;
						node.spacing = pco.spacing / Math.pow(2, level);
						parentNode.addChild(node);
						nodes[name] = node;
					}
				}

				pco.nodes = nodes;

				callback(pco);
			}
		};

		xhr.send(null);
	}
	catch(e)
	{
		console.log("loading failed: \"" + url + "\"");
		console.log(e);

		callback();
	}
};

Potree.POCLoader.loadPointAttributes = function(mno)
{
	var fpa = mno.pointAttributes;
	var pa = new Potree.PointAttributes();

	for(var i = 0; i < fpa.length; i++)
	{
		var pointAttribute = Potree.PointAttribute[fpa[i]];
		pa.add(pointAttribute);
	}

	return pa;
};

Potree.POCLoader.createChildAABB = function(aabb, index)
{
	var min = aabb.min.clone();
	var max = aabb.max.clone();
	var size = new THREE.Vector3().subVectors(max, min);

	if((index & 0b0001) > 0)
	{
		min.z += size.z / 2;
	}
	else
	{
		max.z -= size.z / 2;
	}

	if((index & 0b0010) > 0)
	{
		min.y += size.y / 2;
	}
	else
	{
		max.y -= size.y / 2;
	}

	if((index & 0b0100) > 0)
	{
		min.x += size.x / 2;
	}
	else
	{
		max.x -= size.x / 2;
	}

	return new THREE.Box3(min, max);
};
