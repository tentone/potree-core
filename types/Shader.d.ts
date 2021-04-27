export class Shader {
    constructor(gl: WebGLRenderingContext, name: any, vsSource: any, fsSource: any);
    gl: WebGLRenderingContext;
    name: any;
    vsSource: any;
    fsSource: any;
    cache: Map<any, any>;
    vs: any;
    fs: any;
    program: any;
    uniformLocations: {};
    attributeLocations: {};
    update(vsSource: any, fsSource: any): void;
    compileShader(shader: any, source: any): void;
    linkProgram(): void;
    setUniformMatrix4(name: any, value: any): void;
    setUniform1f(name: any, value: any): void;
    setUniformBoolean(name: any, value: any): void;
    setUniformTexture(name: any, value: any): void;
    setUniform2f(name: any, value: any): void;
    setUniform3f(name: any, value: any): void;
    setUniform(name: any, value: any): void;
    setUniform1i(name: any, value: any): void;
}
