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

/**
 * Represents a custom shader material for applying a blur effect.
 * 
 * Extends the base ShaderMaterial class and sets up the required shaders and uniforms.
 *
 * This material uses custom vertex and fragment shaders for blurring.
 */
export class BlurMaterial extends ShaderMaterial 
{
	/**
	 * The GLSL source code for the vertex shader.
	 */
	public vertexShader = require('./shaders/blur.vs');

	/**
	 * The GLSL source code for the fragment shader.
	 */
	public fragmentShader = require('./shaders/blur.fs');

	/**
	 * The set of uniforms used by the blur shader.
	 *
	 * @property screenWidth - The width of the screen, used for blur calculations.
	 * @property screenHeight - The height of the screen, used for blur calculations.
	 * @property map - The texture to which the blur effect will be applied.
	 */
	public uniforms: IBlurMaterialUniforms = {
		screenWidth: {type: 'f', value: 0},
		screenHeight: {type: 'f', value: 0},
		map: {type: 't', value: null}
	};
}
