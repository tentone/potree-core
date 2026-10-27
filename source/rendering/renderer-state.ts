import { Color, Vector4, WebGLRenderer, WebGLRenderTarget } from 'three';

/** Reusable snapshot of the renderer state changed by offscreen point passes. */
export class RendererState
{
	public target: WebGLRenderTarget | null = null;
	public viewport = new Vector4();
	private globalViewport = new Vector4();
	private globalScissor = new Vector4();
	private scissor = new Vector4();
	private logicalRectangle = new Vector4();
	private clearColor = new Color();
	private clearAlpha = 0;
	private autoClear = true;
	private globalScissorTest = false;
	private scissorTest = false;
	private cubeFace = 0;
	private mipLevel = 0;

	public capture(renderer: WebGLRenderer): void
	{
		this.target = renderer.getRenderTarget();
		this.cubeFace = renderer.getActiveCubeFace();
		this.mipLevel = renderer.getActiveMipmapLevel();
		this.autoClear = renderer.autoClear;
		this.clearAlpha = renderer.getClearAlpha();
		this.globalScissorTest = renderer.getScissorTest();
		renderer.getClearColor(this.clearColor);
		renderer.getViewport(this.globalViewport);
		renderer.getCurrentViewport(this.viewport);
		renderer.getScissor(this.globalScissor);
		// The public scissor getters describe the default framebuffer. A bound
		// target may have its own scissor, or a later explicit renderer override.
		const gl = renderer.getContext();
		this.scissorTest = gl.isEnabled(gl.SCISSOR_TEST);
		this.scissor.fromArray(gl.getParameter(gl.SCISSOR_BOX) as Int32Array);
	}

	/** Rebind the output for compositing, keeping autoClear disabled. */
	public bindTarget(renderer: WebGLRenderer): void
	{
		renderer.setRenderTarget(this.target, this.cubeFace, this.mipLevel);
		renderer.setViewport(this.logicalRectangle.copy(this.viewport).divideScalar(renderer.getPixelRatio()));
		renderer.setScissor(this.logicalRectangle.copy(this.scissor).divideScalar(renderer.getPixelRatio()));
		renderer.setScissorTest(this.scissorTest);
	}

	public restore(renderer: WebGLRenderer): void
	{
		renderer.setClearColor(this.clearColor, this.clearAlpha);
		renderer.setViewport(this.globalViewport);
		renderer.setScissor(this.globalScissor);
		renderer.setScissorTest(this.globalScissorTest);
		renderer.setRenderTarget(this.target, this.cubeFace, this.mipLevel);
		// Restore explicit overrides made after binding a target, as well as its
		// default rectangles. Otherwise the next user render can move or be clipped.
		if (this.target && !this.target.viewport.equals(this.viewport))
		{
			renderer.setViewport(this.logicalRectangle.copy(this.viewport).divideScalar(renderer.getPixelRatio()));
		}
		if (this.target && !this.target.scissor.equals(this.scissor))
		{
			renderer.setScissor(this.logicalRectangle.copy(this.scissor).divideScalar(renderer.getPixelRatio()));
		}
		if (this.target && this.target.scissorTest !== this.scissorTest) renderer.setScissorTest(this.scissorTest);
		renderer.autoClear = this.autoClear;
	}
}
