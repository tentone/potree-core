import { AmbientLight, BoxGeometry,  Euler,  Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Scene, SphereGeometry, Vector2, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { PointCloudOctree, Potree } from '../source';

document.body.onload = function()
{
	const potree = new Potree();
	let pointClouds: PointCloudOctree[] = [];

	// three.js
	const scene = new Scene();
	const camera = new PerspectiveCamera(60, 1, 0.1, 1000);

	const canvas = document.createElement('canvas');
	canvas.style.position = 'absolute';
	canvas.style.top = '0px';
	canvas.style.left = '0px';
	canvas.style.width = '100%';
	canvas.style.height = '100%';
	document.body.appendChild(canvas);

	const renderer = new WebGLRenderer(
		{
			canvas: canvas,
			alpha: true,
			logarithmicDepthBuffer: false,
			precision: 'highp',
			premultipliedAlpha: true,
			antialias: true,
			preserveDrawingBuffer: false,
			powerPreference: 'high-performance'
		});

	const geometry = new BoxGeometry(25, 1, 25);
	const material = new MeshBasicMaterial({color: 0x44AA44});
	const cube = new Mesh(geometry, material);
	cube.position.y = -2;
	scene.add(cube);

	scene.add(new AmbientLight(0xffffff));

	const controls = new OrbitControls(camera, canvas);
	camera.position.z = 10;

	const raycaster = new Raycaster();
	// @ts-ignore
	raycaster.params.Points.threshold = 1e-2;
	const normalized = new Vector2();

	canvas.onmousemove = function(event)
	{
		normalized.set(event.clientX / canvas.width * 2 - 1, -(event.clientY / canvas.height) * 2 + 1);
		raycaster.setFromCamera(normalized, camera);
	};

	canvas.ondblclick = function()
	{
		const intesects = raycaster.intersectObject(scene, true);


		if (intesects.length > 0)
		{
			const geometry = new SphereGeometry(0.2, 32, 32);
			const material = new MeshBasicMaterial({color: Math.random() * 0xAA4444});
			const sphere = new Mesh(geometry, material);
			sphere.position.copy(intesects[0].point);
			scene.add(sphere);
		}
	};
	
	loadPointCloud('/data/lion_takanawa/', 'cloud.js', new Vector3(-4, -2, 5), new Euler(-Math.PI / 2, 0, 0));
	loadPointCloud('/data/pump/', 'metadata.json', new Vector3(0, -1.5, 3), new Euler(-Math.PI / 2, 0, 0), new Vector3(2, 2, 2));
	
	function loadPointCloud(baseUrl: string, url: string, position?: Vector3, rotation?: Euler, scale?: Vector3)
	{
			potree.loadPointCloud(url, url => `${baseUrl}${url}`,).then(function(pco: PointCloudOctree)
			{
				pco.material.size = 1.0;
				pco.material.shape = 2;
				pco.material.inputColorEncoding = 1;
				pco.material.outputColorEncoding = 1;

				if (position){pco.position.copy(position);}
				if (rotation){pco.rotation.copy(rotation);}		
				if (scale){pco.scale.copy(scale);}
				
				console.log('Pointcloud file loaded', pco);
				pco.showBoundingBox = false;
				
				const box = pco.pcoGeometry.boundingBox;
				const size = box.getSize(new Vector3());

				const geometry = new BoxGeometry(size.x, size.y, size.z);
				const material = new MeshBasicMaterial({color:0xFF0000, wireframe: true});
				const mesh = new Mesh(geometry, material);
				mesh.position.copy(pco.position);
				mesh.scale.copy(pco.scale);
				mesh.rotation.copy(pco.rotation);
				mesh.raycast = () => false;

				size.multiplyScalar(0.5);
				mesh.position.add(new Vector3(size.x, size.y, -size.z));

				scene.add(mesh);

				add(pco);
			});
	}

	function add(pco: PointCloudOctree): void {
		scene.add(pco);
		pointClouds.push(pco);
	}

	function unload(): void {
		pointClouds.forEach(pco => {
			scene.remove(pco);
			pco.dispose();
		});

		pointClouds = [];
	}

	function loop()
	{
		cube.rotation.y += 0.01;

		potree.updatePointClouds(pointClouds, camera, renderer);

		controls.update();
		renderer.render(scene, camera);

		requestAnimationFrame(loop);
	}

	loop();

	document.body.onresize = function()
	{
		const width = window.innerWidth;
		const height = window.innerHeight;

		renderer.setSize(width, height);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
	};
	
	// @ts-ignore
	document.body.onresize();
};
