import {ShaderMaterial, Texture} from 'three';
import {IUniform} from './types';

/**
 * Uniforms interface for blur material shader.
 * 
 * Defines the uniform variables that control blur rendering parameters.
 * 
 * Check http://john-chapman-graphics.blogspot.co.at/2013/01/ssao-tutorial.html
 */
export interface IBlurMaterialUniforms {
	/**
	 * Generic uniform property accessor.
	 * @param name - The name of the uniform property
	 */
	[name: string]: IUniform<any>;
	
	/**
	 * Screen width in pixels.
	 * Used to calculate blur kernel size and sampling coordinates.
	 */
	screenWidth: IUniform<number>;
	
	/**
	 * Screen height in pixels.
	 * Used to calculate blur kernel size and sampling coordinates.
	 */
	screenHeight: IUniform<number>;
	
	/**
	 * Input texture to be blurred.
	 * Can be null if no texture is currently bound.
	 */
	map: IUniform<Texture | null>;
}

export class BlurMaterial extends ShaderMaterial 
{
	// vertexShader = require('./shaders/blur.vert');
	// fragmentShader = require('./shaders/blur.frag');

	uniforms: IBlurMaterialUniforms = {
		screenWidth: {type: 'f', value: 0},
		screenHeight: {type: 'f', value: 0},
		map: {type: 't', value: null}
	};
}
