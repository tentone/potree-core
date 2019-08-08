"use strict";

import {BinaryLoader} from "./BinaryLoader.js";
import {LASLAZLoader} from "./LASLAZLoader.js";
import {PointAttributes, PointAttribute} from "../PointAttributes.js";
import {PointCloudOctreeGeometry, PointCloudOctreeGeometryNode} from "../pointcloud/geometries/PointCloudOctreeGeometry.js";
import {VersionUtils} from "../utils/VersionUtils.js";
import {Global} from "../Global.js";

/**
 * @class Loads mno files and returns a PointcloudOctree
 * for a description of the mno binary file format, read mnoFileFormat.txt
 *
 * @author Markus Schuetz
 */
class POCLoader
{
	/**
	 * @return a point cloud octree with the root node data loaded.
	 * loading of descendants happens asynchronously when they"re needed
	 *
	 * @param url
	 * @param loadingFinishedListener executed after loading the binary has been finished
	 */
	static load(url, callback)
	{
		var pco = new PointCloudOctreeGeometry();
		pco.url = url;
		
		var xhr = new XMLHttpRequest();
		xhr.overrideMimeType("text/plain");
		xhr.open("GET", url, true);
		xhr.onload = function()
		{
			var data = JSON.parse(xhr.responseText);
			var version = new VersionUtils(data.version);

			//Assume dir as absolute if it starts with http
			if(data.octreeDir.indexOf("http") === 0)
			{
				pco.octreeDir = data.octreeDir;
			}
			else
			{
				pco.octreeDir = url + "/../" + data.octreeDir;
			}

			pco.spacing = data.spacing;
			pco.hierarchyStepSize = data.hierarchyStepSize;
			pco.pointAttributes = data.pointAttributes;

			var min = new THREE.Vector3(data.boundingBox.lx, data.boundingBox.ly, data.boundingBox.lz);
			var max = new THREE.Vector3(data.boundingBox.ux, data.boundingBox.uy, data.boundingBox.uz);
			var boundingBox = new THREE.Box3(min, max);
			var tightBoundingBox = boundingBox.clone();

			if(data.tightBoundingBox)
			{
				tightBoundingBox.min.copy(new THREE.Vector3(data.tightBoundingBox.lx, data.tightBoundingBox.ly, data.tightBoundingBox.lz));
				tightBoundingBox.max.copy(new THREE.Vector3(data.tightBoundingBox.ux, data.tightBoundingBox.uy, data.tightBoundingBox.uz));
			}

			var offset = min.clone();

			boundingBox.min.sub(offset);
			boundingBox.max.sub(offset);

			tightBoundingBox.min.sub(offset);
			tightBoundingBox.max.sub(offset);

			pco.projection = data.projection;
			pco.boundingBox = boundingBox;
			pco.tightBoundingBox = tightBoundingBox;
			pco.boundingSphere = boundingBox.getBoundingSphere(new THREE.Sphere());
			pco.tightBoundingSphere = tightBoundingBox.getBoundingSphere(new THREE.Sphere());
			pco.offset = offset;

			//Select the appropiate loader
			if(data.pointAttributes === "LAS" || data.pointAttributes === "LAZ")
			{
				pco.loader = new LASLAZLoader(data.version);
			}
			else
			{
				pco.loader = new BinaryLoader(data.version, boundingBox, data.scale);
				pco.pointAttributes = new PointAttributes(pco.pointAttributes);
			}

			var nodes = {};
			var name = "r";

			var root = new PointCloudOctreeGeometryNode(name, pco, boundingBox);
			root.level = 0;
			root.hasChildren = true;
			root.spacing = pco.spacing;
			root.numPoints = version.upTo("1.5") ? data.hierarchy[0][1] : 0;

			pco.root = root;
			pco.root.load();
			nodes[name] = root;

			//Load remaining hierarchy
			if(version.upTo("1.4"))
			{
				for(var i = 1; i < data.hierarchy.length; i++)
				{
					var name = data.hierarchy[i][0];
					var numPoints = data.hierarchy[i][1];
					var index = parseInt(name.charAt(name.length - 1));
					var parentName = name.substring(0, name.length - 1);
					var parentNode = nodes[parentName];
					var level = name.length - 1;
					var boundingBox = POCLoader.createChildAABB(parentNode.boundingBox, index);

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
		};

		xhr.onerror = function(event)
		{
			Global.numNodesLoading--;
			console.log("Potree: loading file failed.", url, event);
			callback();
		};

		xhr.send(null);
	}

	static loadPointAttributes(mno)
	{
		var fpa = mno.pointAttributes;
		var pa = new PointAttributes();

		for(var i = 0; i < fpa.length; i++)
		{
			pa.add(PointAttribute[fpa[i]]);
		}

		return pa;
	}

	static createChildAABB(aabb, index)
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
	}
}

export {POCLoader};