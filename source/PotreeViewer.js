"use strict";

/*
 * Potree object is a wrapper to use Potree alongside other THREE based frameworks.
 * 
 * The object can be used a normal Object3D.
 */
class PotreeViewer
{
	constructor(renderer)
	{
		Potree.pointBudget = 10000000;

		this.renderer = renderer !== undefined ? this.prepareRenderer(renderer) : this.createRenderer();
		this.pointRenderer = new PotreeRenderer(this.renderer);
		
		this.scene = new PotreeScene(this.renderer);
	}

	getBoundingBox()
	{
		return this.scene.getBoundingBox();
	}

	update(camera)
	{
		this.scene.update(camera, this.renderer);
	}
	
	render(camera)
	{
		this.pointRenderer.render(this.scene, camera);
	}

	prepareRenderer(renderer)
	{
		//Enable frag_depth extension for the interpolation shader, if available
		var gl = renderer.context;
		gl.getExtension("EXT_frag_depth");
		gl.getExtension("WEBGL_depth_texture");
		var extVAO = gl.getExtension("OES_vertex_array_object");
		gl.createVertexArray = extVAO.createVertexArrayOES.bind(extVAO);
		gl.bindVertexArray = extVAO.bindVertexArrayOES.bind(extVAO);

		return renderer;
	}

	createRenderer()
	{
		var renderer = new THREE.WebGLRenderer({alpha: true, premultipliedAlpha: false});
		renderer.sortObjects = true;
		renderer.autoClear = false;

		var width = window.innerWidth;
		var height = window.innerHeight;
		renderer.setSize(width, height);
		renderer.domElement.style.position = "absolute";
		renderer.domElement.style.top = "0px";
		renderer.domElement.style.bottom = "0px";
		document.body.appendChild(renderer.domElement);

		return this.prepareRenderer(renderer);
	}
}
