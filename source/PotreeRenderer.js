"use strict";

class PotreeRenderer
{
	constructor()
	{
		//TODO
	}

	render(renderer)
	{
		const viewer = this.viewer;
		let query = Potree.startQuery('render', renderer.getContext());

		viewer.dispatchEvent({type: "render.pass.begin",viewer: viewer});

		for(let pointcloud of this.viewer.scene.pointclouds)
		{
			pointcloud.material.useEDL = false;
		}
		
		//let queryPC = Potree.startQuery("PointCloud", renderer.getContext());
		let activeCam = viewer.scene.getActiveCamera();
		//renderer.render(viewer.scene.scenePointCloud, activeCam);
		
		viewer.pRenderer.render(viewer.scene.scenePointCloud, activeCam, null,
		{
			clipSpheres: viewer.scene.volumes.filter(v => (v instanceof Potree.SphereVolume)),
		});
		
		//Potree.endQuery(queryPC, renderer.getContext());
		
		// render scene
		//renderer.render(viewer.scene.scene, activeCam);

		//viewer.dispatchEvent({type: "render.pass.scene",viewer: viewer});
		
		/*viewer.clippingTool.update();
		renderer.render(viewer.clippingTool.sceneMarker, viewer.scene.cameraScreenSpace); //viewer.scene.cameraScreenSpace);
		renderer.render(viewer.clippingTool.sceneVolume, activeCam);

		renderer.render(viewer.controls.sceneControls, activeCam);
		
		renderer.clearDepth();
		
		viewer.transformationTool.update();*/
		
		//viewer.dispatchEvent({type: "render.pass.perspective_overlay",viewer: viewer});
		
		renderer.render(viewer.transformationTool.scene, activeCam);
		renderer.setViewport(renderer.domElement.clientWidth - viewer.navigationCube.width, renderer.domElement.clientHeight - viewer.navigationCube.width,  viewer.navigationCube.width, viewer.navigationCube.width);
		renderer.render(viewer.navigationCube, viewer.navigationCube.camera);		
		renderer.setViewport(0, 0, renderer.domElement.clientWidth, renderer.domElement.clientHeight);

		//viewer.dispatchEvent({type: "render.pass.end",viewer: viewer});
		
		Potree.endQuery(query, renderer.getContext());
	}
}

