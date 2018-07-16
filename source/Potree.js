"use strict";

Potree.version =
{
	major: 1,
	minor: 6,
	suffix: "-nogui"
};

Potree.loadPointCloud = function(path, name, callback)
{
	var loaded = function(pointcloud)
	{
		if(name !== undefined)
		{
			pointcloud.name = name;
		}
		
		callback(
		{
			type: "pointcloud_loaded",
			pointcloud: pointcloud
		});
	};

	//Greyhound pointcloud server URL.
	if(path.indexOf("greyhound://") === 0)
	{
		Potree.GreyhoundLoader.load(path, function(geometry)
		{
			if(!geometry)
			{
				console.error(new Error("Failed to load point cloud from URL " + path));
			}
			else
			{
				loaded(new Potree.PointCloudOctree(geometry));
			}
		});
	}
	//Potree point cloud
	else if(path.indexOf("cloud.js") > 0)
	{
		Potree.POCLoader.load(path, function(geometry)
		{
			if(!geometry)
			{
				console.error(new Error("Failed to load point cloud from URL " + path));
			}
			else
			{
				loaded(new Potree.PointCloudOctree(geometry));
			}
		});
	}
	//Arena 4D point cloud
	else if(path.indexOf(".vpc") > 0)
	{
		Potree.PointCloudArena4DGeometry.load(path, function(geometry)
		{
			if(!geometry)
			{
				console.error(new Error("Failed to load point cloud from URL " + path));
			}
			else
			{
				loaded(new Potree.PointCloudArena4D(geometry));
			}
		});
	}
	else
	{
		console.error(new Error("Failed to load point cloud from URL " + path));
	}
};

