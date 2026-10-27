import {
	BufferAttribute,
	BufferGeometry,
	Mesh,
	OrthographicCamera,
	RawShaderMaterial,
	Scene,
	WebGLRenderer,
	WebGLMultipleRenderTargets,
	WebGLRenderTarget,
} from 'three';

export class ScreenPass {
	private scene: Scene;
	private camera: OrthographicCamera;
	private quad: Mesh;
	private geometry: BufferGeometry;
	private placeholderMaterial: RawShaderMaterial;

	public constructor() {
		this.scene = new Scene();
		this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

		this.geometry = new BufferGeometry();
		// Fullscreen triangle would be slightly faster, but a quad is fine and simple.
		const positions = new Float32Array([
			-1, -1, 0,
			1, -1, 0,
			1, 1, 0,
			-1, 1, 0,
		]);
		const uvs = new Float32Array([
			0, 0,
			1, 0,
			1, 1,
			0, 1,
		]);
		const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
		this.geometry.setIndex(new BufferAttribute(indices, 1));
		this.geometry.setAttribute('position', new BufferAttribute(positions, 3));
		this.geometry.setAttribute('uv', new BufferAttribute(uvs, 2));

		// Placeholder material: we do not own/assume ownership of materials passed to render().
		this.placeholderMaterial = new RawShaderMaterial();
		this.quad = new Mesh(this.geometry, this.placeholderMaterial);
		this.scene.add(this.quad);
	}

	public dispose(): void {
		// Only dispose resources owned by this pass.
		this.geometry.dispose();
		this.placeholderMaterial.dispose();
	}

	public render(
		renderer: WebGLRenderer,
		material: RawShaderMaterial,
		target: WebGLRenderTarget | WebGLMultipleRenderTargets | null = null,
	): void {
		const oldTarget = renderer.getRenderTarget();
		const oldCubeFace = renderer.getActiveCubeFace();
		const oldMipLevel = renderer.getActiveMipmapLevel();

		this.quad.material = material;

		try
		{
			if (target !== oldTarget) renderer.setRenderTarget(target);
			renderer.render(this.scene, this.camera);
		}
		finally
		{
			if (target !== oldTarget) renderer.setRenderTarget(oldTarget, oldCubeFace, oldMipLevel);
			this.quad.material = this.placeholderMaterial;
		}
	}
}
