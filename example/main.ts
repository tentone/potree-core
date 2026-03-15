import { AmbientLight, BoxGeometry, Euler, Mesh, MeshBasicMaterial, OrthographicCamera, PerspectiveCamera, Raycaster, Scene, SphereGeometry, Vector2, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { ClipMode, PointCloudOctree, Potree, PotreeRenderer, createClipBox } from '../source';

document.body.onload = function () {
	const potree = new Potree();
	let pointClouds: PointCloudOctree[] = [];
	let pumpPco: PointCloudOctree | null = null;

	const clipModes: ClipMode[] = [ClipMode.DISABLED, ClipMode.HIGHLIGHT_INSIDE, ClipMode.CLIP_OUTSIDE, ClipMode.CLIP_INSIDE];
	const clipModeLabels = ['Disabled', 'Highlight Inside', 'Clip Outside', 'Clip Inside'];
	let clipModeIndex = 1;

	// EDL settings
	let edlEnabled = false;
	const potreeRenderer = new PotreeRenderer({
		edl: {
			enabled: edlEnabled,
			pointCloudLayer: 1,
			strength: 0.4,
			radius: 1.4,
			opacity: 1.0,
		},
	});
	// if you want to enable EDL at start up, uncomment the following line.
	// potreeRenderer.setEDL({ enabled: true });

	// three.js
	const scene = new Scene();
	// Camera setup
	let useOrthographicCamera = false;
	const perspectiveCamera = new PerspectiveCamera(60, 1, 0.1, 1000)
	perspectiveCamera.position.set(0, 0, 10);

	const orthographicFrustrumSize = 20;
	const orthographicCamera = new OrthographicCamera(
		-orthographicFrustrumSize / 2, orthographicFrustrumSize / 2, orthographicFrustrumSize / 2, orthographicFrustrumSize / 2, 0.1, 1000
	)
	orthographicCamera.position.set(0, 0, 10);
	let camera = useOrthographicCamera ? orthographicCamera : perspectiveCamera;

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
			logarithmicDepthBuffer: true,
			precision: 'highp',
			premultipliedAlpha: true,
			antialias: true,
			preserveDrawingBuffer: false,
			powerPreference: 'high-performance'
		});

	const geometry = new BoxGeometry(25, 1, 25);
	const material = new MeshBasicMaterial({ color: 0x44AA44 });
	const cube = new Mesh(geometry, material);
	cube.position.y = -2;
	scene.add(cube);

	scene.add(new AmbientLight(0xffffff));

	let controls = new OrbitControls(camera, canvas);

	const raycaster = new Raycaster();
	// @ts-ignore
	raycaster.params.Points.threshold = 1e-2;
	const normalized = new Vector2();

	canvas.onmousemove = function (event) {
		normalized.set(event.clientX / canvas.width * 2 - 1, -(event.clientY / canvas.height) * 2 + 1);
		raycaster.setFromCamera(normalized, camera);

		let ray = raycaster.ray;
		const start1 = performance.now();
		const I = Potree.pick(pointClouds, renderer, camera, ray)
		console.log('Potree.pick :>> ', I?.position, performance.now() - start1);

		const start2 = performance.now();
		const intesects = raycaster.intersectObject(scene, true);
		if (intesects.length > 0) {
			console.log('iraycaster.intersectObject :>> ', intesects[0].point, performance.now() - start2);
		}
	};

	canvas.ondblclick = function () {
		const intesects = raycaster.intersectObject(scene, true);


		if (intesects.length > 0) {
			const geometry = new SphereGeometry(0.2, 32, 32);
			const material = new MeshBasicMaterial({ color: Math.random() * 0xAA4444 });
			const sphere = new Mesh(geometry, material);
			sphere.position.copy(intesects[0].point);
			scene.add(sphere);
		}
	};

	loadPointCloud('/data/lion_takanawa/', 'cloud.js', new Vector3(-4, -2, 5), new Euler(-Math.PI / 2, 0, 0));
	loadPointCloud('/data/pump/', 'metadata.json', new Vector3(0, -1.5, 3), new Euler(-Math.PI / 2, 0, 0), new Vector3(2, 2, 2), true);

	function loadPointCloud(baseUrl: string, url: string, position?: Vector3, rotation?: Euler, scale?: Vector3, applyClipBox = false) {
		potree.loadPointCloud(url, baseUrl).then(function (pco: PointCloudOctree) {
			pco.material.size = 1.0;
			pco.material.shape = 2;
			pco.material.inputColorEncoding = 1;
			pco.material.outputColorEncoding = 1;

			if (position) { pco.position.copy(position); }
			if (rotation) { pco.rotation.copy(rotation); }
			if (scale) { pco.scale.copy(scale); }

			console.log('Pointcloud file loaded', pco);
			pco.showBoundingBox = false;

			const box = pco.pcoGeometry.boundingBox;
			const size = box.getSize(new Vector3());

			const geometry = new BoxGeometry(size.x, size.y, size.z);
			const material = new MeshBasicMaterial({ color: 0xFF0000, wireframe: true });
			const mesh = new Mesh(geometry, material);
			mesh.position.copy(pco.position);
			mesh.scale.copy(pco.scale);
			mesh.rotation.copy(pco.rotation);
			mesh.raycast = () => false;

			size.multiplyScalar(0.5);
			mesh.position.add(new Vector3(size.x, size.y, -size.z));

			scene.add(mesh);

			if (applyClipBox) {
				pumpPco = pco;
				const clipBox = createClipBox(new Vector3(1.5, 1.5, 1.5), pco.position.clone());
				pco.material.clipMode = clipModes[clipModeIndex];
				pco.material.setClipBoxes([clipBox]);
			}

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

	// switch camera
	function switchCamera(toOrthographic: boolean) {
		if (toOrthographic === useOrthographicCamera) {
			return;
		}
		useOrthographicCamera = toOrthographic;
		// Copy position & rotation from current camera to the target one.
		const current = toOrthographic ? perspectiveCamera : orthographicCamera;
		const target = toOrthographic ? orthographicCamera : perspectiveCamera;
		target.position.copy(current.position);
		target.quaternion.copy(current.quaternion);
		camera = target;

		// Rebuild OrbitControls for the new camera
		controls.dispose();
		controls = new OrbitControls(camera, canvas);

		updateSize();
		cameraLabel.textContent = toOrthographic ? 'Orthographic' : 'Perspective';
	}

	// UI Panel
	const panel = document.createElement('div');
	panel.style.cssText = 'position: absolute; top: 10px; left: 10px; background-color: rgba(255,255,255,0.8); padding: 5px; font-family: sans-serif;';
	document.body.appendChild(panel);

	// Camera switch button
	const cameraRow = document.createElement('div');
	cameraRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';
	const cameraButton = document.createElement('button');
	cameraButton.textContent = 'Switch Camera';
	cameraButton.style.cssText = 'cursor: pointer; padding: 4px 10px; border: none; border-radius: 4px; background-color: #007BFF; color: white; font-size: 13px;';
	const cameraLabel = document.createElement('span');
	cameraLabel.textContent = 'Perspective';
	cameraButton.onclick = () => switchCamera(!useOrthographicCamera);
	cameraRow.appendChild(cameraButton);
	cameraRow.appendChild(cameraLabel);
	panel.appendChild(cameraRow);

	// EDL toggle button
	const edlRow = document.createElement('div');
	edlRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';
	const edlButton = document.createElement('button');
	edlButton.textContent = 'Toggle EDL';
	edlButton.style.cssText = 'cursor: pointer; padding: 4px 10px; border: none; border-radius: 4px; background-color: #28A745; color: white; font-size: 13px;';
	const edlLabel = document.createElement('span');
	edlLabel.textContent = 'EDL: Off';
	edlButton.onclick = () => {
		edlEnabled = !edlEnabled;
		potreeRenderer.setEDL({ enabled: edlEnabled });
		edlLabel.textContent = `EDL: ${edlEnabled ? 'On' : 'Off'}`;
	};
	edlRow.appendChild(edlButton);
	edlRow.appendChild(edlLabel);
	panel.appendChild(edlRow);

	// EDL settings sliders
	const strengthRow = document.createElement('div');
	strengthRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';
	const strengthLabel = document.createElement('label');
	strengthLabel.textContent = 'EDL Strength';
	strengthLabel.style.cssText = 'min-width: 90px;';
	const strengthInput = document.createElement('input');
	strengthInput.type = 'range';
	strengthInput.min = '0';
	strengthInput.max = '5';
	strengthInput.step = '0.1';
	strengthInput.value = '0.4';
	const strengthValue = document.createElement('span');
	strengthValue.textContent = strengthInput.value;
	strengthValue.style.cssText = 'min-width: 40px; text-align: right;';
	strengthInput.oninput = () => {
		const strength = parseFloat(strengthInput.value);
		strengthValue.textContent = strength.toFixed(1);
		potreeRenderer.setEDL({ enabled: edlEnabled, strength });
	}
	strengthRow.appendChild(strengthLabel);
	strengthRow.appendChild(strengthInput);
	strengthRow.appendChild(strengthValue);
	panel.appendChild(strengthRow);

	// EDL radius slider
	const radiusRow = document.createElement('div');
	radiusRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';
	const radiusLabel = document.createElement('label');
	radiusLabel.textContent = 'EDL Radius';
	radiusLabel.style.cssText = 'min-width: 90px;';
	const radiusInput = document.createElement('input');
	radiusInput.type = 'range';
	radiusInput.min = '0';
	radiusInput.max = '5';
	radiusInput.step = '0.1';
	radiusInput.value = '1.4';
	const radiusValue = document.createElement('span');
	radiusValue.textContent = radiusInput.value;
	radiusValue.style.cssText = 'min-width: 40px; text-align: right;';
	radiusInput.oninput = () => {
		const radius = parseFloat(radiusInput.value);
		radiusValue.textContent = radius.toFixed(1);
		potreeRenderer.setEDL({ enabled: edlEnabled, radius });
	}
	radiusRow.appendChild(radiusLabel);
	radiusRow.appendChild(radiusInput);
	radiusRow.appendChild(radiusValue);
	panel.appendChild(radiusRow);

	// Clip box mode cycle button (applies to the pump point cloud)
	const clipRow = document.createElement('div');
	clipRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';
	const clipButton = document.createElement('button');
	clipButton.textContent = 'Clip Mode';
	clipButton.style.cssText = 'cursor: pointer; padding: 4px 10px; border: none; border-radius: 4px; background-color: #6F42C1; color: white; font-size: 13px;';
	const clipLabel = document.createElement('span');
	clipLabel.textContent = `Clip: ${clipModeLabels[clipModeIndex]}`;
	clipButton.onclick = () => {
		clipModeIndex = (clipModeIndex + 1) % clipModes.length;
		if (pumpPco) {
			pumpPco.material.clipMode = clipModes[clipModeIndex];
		}
		clipLabel.textContent = `Clip: ${clipModeLabels[clipModeIndex]}`;
	};
	clipRow.appendChild(clipButton);
	clipRow.appendChild(clipLabel);
	panel.appendChild(clipRow);

	function loop() {
		cube.rotation.y += 0.01;

		potree.updatePointClouds(pointClouds, camera, renderer);

		controls.update();

		potreeRenderer.render({ renderer, scene, camera, pointClouds });

		// If you are not using EDL, you can render the scene directly with the standard three.js renderer:
		// renderer.render(scene, camera);

		requestAnimationFrame(loop);
	}

	loop();

	function updateSize() {
		const width = window.innerWidth;
		const height = window.innerHeight;
		renderer.setSize(width, height);

		if (useOrthographicCamera) {
			const aspect = width / height;
			orthographicCamera.left = -orthographicFrustrumSize * aspect / 2;
			orthographicCamera.right = orthographicFrustrumSize * aspect / 2;
			orthographicCamera.top = orthographicFrustrumSize / 2;
			orthographicCamera.bottom = -orthographicFrustrumSize / 2;
			orthographicCamera.updateProjectionMatrix();
		} else {
			perspectiveCamera.aspect = width / height;
			perspectiveCamera.updateProjectionMatrix();
		}
	}

	document.body.onresize = function () {
		updateSize();
	};

	// @ts-ignore
	document.body.onresize();
};
