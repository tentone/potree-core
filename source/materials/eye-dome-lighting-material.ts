import { GLSL3, Matrix4, RawShaderMaterial, Texture } from 'three';
import { IUniform } from './types';

const VertShader = require('./shaders/edl.vs').default;
const FragShader = require('./shaders/edl.fs').default;

export interface IEyeDomeLightingMaterialUniforms {
	[name: string]: IUniform<any>;

	screenWidth: IUniform<number>;
	screenHeight: IUniform<number>;
	edlStrength: IUniform<number>;
	radius: IUniform<number>;
	opacity: IUniform<number>;

	neighbours: IUniform<Float32Array>;

	uProj: IUniform<Float32Array>;
	colorMap: IUniform<Texture | null>;
	far: IUniform<number>;
	useLogDepth: IUniform<boolean>;
	useOrthographicCamera: IUniform<boolean>;
}

export class EyeDomeLightingMaterial extends RawShaderMaterial {
	public uniforms: IEyeDomeLightingMaterialUniforms;

	private _neighbourCount: number = 8;
	private neighboursArray: Float32Array = new Float32Array(16);

	public constructor() {
		super();

		this.uniforms = {
			screenWidth: { type: 'f', value: 1 },
			screenHeight: { type: 'f', value: 1 },
			edlStrength: { type: 'f', value: 1.0 },
			radius: { type: 'f', value: 1.4 },
			opacity: { type: 'f', value: 1.0 },

			neighbours: { type: '2fv', value: this.neighboursArray },
			uProj: { type: 'Matrix4fv', value: new Float32Array(16) },
			colorMap: { type: 't', value: null },
			far: { type: 'f', value: 1000.0 },
			useLogDepth: { type: 'b', value: false },
			useOrthographicCamera: { type: 'b', value: false },
		};

		this.glslVersion = GLSL3;
		this.depthTest = true;
		this.depthWrite = true;
		this.transparent = true;

		// Initialize neighbour offsets even when the default count matches.
		this.initializeNeighboursArray(this._neighbourCount);

		this.updateShaderSource();
	}

	public get neighbourCount(): number {
		return this._neighbourCount;
	}

	public set neighbourCount(value: number) {
		const next = Math.max(1, Math.floor(value));
		if (this._neighbourCount !== next) {
			this._neighbourCount = next;
			this.initializeNeighboursArray(this._neighbourCount);
			this.updateShaderSource();
		}
	}

	private initializeNeighboursArray(neighbourCount: number): void {
		this.neighboursArray = new Float32Array(neighbourCount * 2);
		for (let c = 0; c < neighbourCount; c++) {
			this.neighboursArray[2 * c + 0] = Math.cos((2 * c * Math.PI) / neighbourCount);
			this.neighboursArray[2 * c + 1] = Math.sin((2 * c * Math.PI) / neighbourCount);
		}
		this.uniforms.neighbours.value = this.neighboursArray;
	}

	private getDefines(): string {
		return `#define NEIGHBOUR_COUNT ${this._neighbourCount}\n`;
	}

	public updateShaderSource(): void {
		const defines = this.getDefines();
		this.vertexShader = defines + VertShader;
		this.fragmentShader = defines + FragShader;
		this.needsUpdate = true;
	}

	public setProjectionMatrix(projectionMatrix: Matrix4): void {
		const out = new Float32Array(16);
		out.set(projectionMatrix.elements);
		this.uniforms.uProj.value = out;
	}
}
