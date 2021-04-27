import * as THREE from 'three';

export class PointCloudMaterial {
    static generateGradientTexture(gradient: any): any;
    static generateClassificationTexture(classification: any): any;
    constructor(parameters?: {});
    visibleNodesTexture: any;
    _pointSizeType: number;
    _shape: number;
    _pointColorType: number;
    _useClipBox: boolean;
    _weighted: boolean;
    _gradient: any[][];
    _treeType: any;
    _useEDL: boolean;
    _snapEnabled: boolean;
    _numSnapshots: number;
    _defaultIntensityRangeChanged: boolean;
    _defaultElevationRangeChanged: boolean;
    clipBoxes: any[];
    clipPolygons: any[];
    gradientTexture: any;
    lights: boolean;
    fog: boolean;
    defines: Map<any, any>;
    attributes: {
        position: {
            type: string;
            value: any[];
        };
        color: {
            type: string;
            value: any[];
        };
        normal: {
            type: string;
            value: any[];
        };
        intensity: {
            type: string;
            value: any[];
        };
        classification: {
            type: string;
            value: any[];
        };
        returnNumber: {
            type: string;
            value: any[];
        };
        numberOfReturns: {
            type: string;
            value: any[];
        };
        pointSourceID: {
            type: string;
            value: any[];
        };
        indices: {
            type: string;
            value: any[];
        };
    };
    uniforms: {
        level: {
            type: string;
            value: number;
        };
        vnStart: {
            type: string;
            value: number;
        };
        spacing: {
            type: string;
            value: number;
        };
        blendHardness: {
            type: string;
            value: number;
        };
        blendDepthSupplement: {
            type: string;
            value: number;
        };
        fov: {
            type: string;
            value: number;
        };
        screenWidth: {
            type: string;
            value: number;
        };
        screenHeight: {
            type: string;
            value: number;
        };
        near: {
            type: string;
            value: number;
        };
        far: {
            type: string;
            value: number;
        };
        uColor: {
            type: string;
            value: any;
        };
        uOpacity: {
            type: string;
            value: number;
        };
        size: {
            type: string;
            value: any;
        };
        minSize: {
            type: string;
            value: any;
        };
        maxSize: {
            type: string;
            value: any;
        };
        octreeSize: {
            type: string;
            value: number;
        };
        bbSize: {
            type: string;
            value: number[];
        };
        elevationRange: {
            type: string;
            value: number[];
        };
        clipBoxCount: {
            type: string;
            value: number;
        };
        clipPolygonCount: {
            type: string;
            value: number;
        };
        clipBoxes: {
            type: string;
            value: any[];
        };
        clipPolygons: {
            type: string;
            value: any[];
        };
        clipPolygonVCount: {
            type: string;
            value: any[];
        };
        clipPolygonVP: {
            type: string;
            value: any[];
        };
        visibleNodes: {
            type: string;
            value: any;
        };
        pcIndex: {
            type: string;
            value: number;
        };
        gradient: {
            type: string;
            value: any;
        };
        classificationLUT: {
            type: string;
            value: any;
        };
        uHQDepthMap: {
            type: string;
            value: any;
        };
        toModel: {
            type: string;
            value: any[];
        };
        diffuse: {
            type: string;
            value: number[];
        };
        transition: {
            type: string;
            value: number;
        };
        intensityRange: {
            type: string;
            value: number[];
        };
        intensityGamma: {
            type: string;
            value: number;
        };
        intensityContrast: {
            type: string;
            value: number;
        };
        intensityBrightness: {
            type: string;
            value: number;
        };
        rgbGamma: {
            type: string;
            value: number;
        };
        rgbContrast: {
            type: string;
            value: number;
        };
        rgbBrightness: {
            type: string;
            value: number;
        };
        wRGB: {
            type: string;
            value: number;
        };
        wIntensity: {
            type: string;
            value: number;
        };
        wElevation: {
            type: string;
            value: number;
        };
        wClassification: {
            type: string;
            value: number;
        };
        wReturnNumber: {
            type: string;
            value: number;
        };
        wSourceID: {
            type: string;
            value: number;
        };
        useOrthographicCamera: {
            type: string;
            value: boolean;
        };
        clipTask: {
            type: string;
            value: number;
        };
        clipMethod: {
            type: string;
            value: number;
        };
        uSnapshot: {
            type: string;
            value: any[];
        };
        uSnapshotDepth: {
            type: string;
            value: any[];
        };
        uSnapView: {
            type: string;
            value: any[];
        };
        uSnapProj: {
            type: string;
            value: any[];
        };
        uSnapProjInv: {
            type: string;
            value: any[];
        };
        uSnapViewInv: {
            type: string;
            value: any[];
        };
        uShadowColor: {
            type: string;
            value: number[];
        };
        uFilterReturnNumberRange: {
            type: string;
            value: number[];
        };
        uFilterNumberOfReturnsRange: {
            type: string;
            value: number[];
        };
        uFilterGPSTimeClipRange: {
            type: string;
            value: number[];
        };
        hiddenClassifications: {
            type: string;
            value: number[];
        };
        hiddenPointSourceIDs: {
            type: string;
            value: number[];
        };
        selectedPointSourceID: {
            type: string;
            value: number;
        };
        selectedPointSourceIDColor: {
            type: string;
            value: THREE.Color;
        };
    };
    set classification(arg: {});
    get classification(): {};
    vertexShader: string;
    fragmentShader: string;
    vertexColors: any;
    setDefine(key: any, value: any): void;
    removeDefine(key: any): void;
    updateShaderSource(): void;
    blending: any;
    transparent: boolean;
    depthTest: boolean;
    depthWrite: boolean;
    depthFunc: any;
    needsUpdate: boolean;
    onBeforeCompile(shader: any, renderer: any): void;
    getDefines(): string;
    setClipBoxes(clipBoxes: any): void;
    setClipPolygons(clipPolygons: any, maxPolygonVertices: any): void;
    set gradient(arg: any[][]);
    get gradient(): any[][];
    set useOrthographicCamera(arg: boolean);
    get useOrthographicCamera(): boolean;
    _classification: {};
    recomputeClassification(): void;
    classificationTexture: any;
    set numSnapshots(arg: number);
    get numSnapshots(): number;
    set snapEnabled(arg: boolean);
    get snapEnabled(): boolean;
    set spacing(arg: number);
    get spacing(): number;
    set useClipBox(arg: boolean);
    get useClipBox(): boolean;
    set clipTask(arg: number);
    get clipTask(): number;
    set clipMethod(arg: number);
    get clipMethod(): number;
    set weighted(arg: boolean);
    get weighted(): boolean;
    set fov(arg: number);
    get fov(): number;
    set screenWidth(arg: number);
    get screenWidth(): number;
    set screenHeight(arg: number);
    get screenHeight(): number;
    set near(arg: number);
    get near(): number;
    set far(arg: number);
    get far(): number;
    set opacity(arg: number);
    get opacity(): number;
    set pointColorType(arg: number);
    get pointColorType(): number;
    set pointSizeType(arg: number);
    get pointSizeType(): number;
    set useEDL(arg: boolean);
    get useEDL(): boolean;
    set color(arg: any);
    get color(): any;
    set shape(arg: number);
    get shape(): number;
    set treeType(arg: any);
    get treeType(): any;
    set bbSize(arg: number[]);
    get bbSize(): number[];
    set size(arg: any);
    get size(): any;
    set elevationRange(arg: number[]);
    get elevationRange(): number[];
    set heightMin(arg: number);
    get heightMin(): number;
    set heightMax(arg: number);
    get heightMax(): number;
    set transition(arg: number);
    get transition(): number;
    set intensityRange(arg: number[]);
    get intensityRange(): number[];
    set intensityGamma(arg: number);
    get intensityGamma(): number;
    set intensityContrast(arg: number);
    get intensityContrast(): number;
    set intensityBrightness(arg: number);
    get intensityBrightness(): number;
    set rgbGamma(arg: number);
    get rgbGamma(): number;
    set rgbContrast(arg: number);
    get rgbContrast(): number;
    set rgbBrightness(arg: number);
    get rgbBrightness(): number;
    set weightRGB(arg: number);
    get weightRGB(): number;
    set weightIntensity(arg: number);
    get weightIntensity(): number;
    set weightElevation(arg: number);
    get weightElevation(): number;
    set weightClassification(arg: number);
    get weightClassification(): number;
    set weightReturnNumber(arg: number);
    get weightReturnNumber(): number;
    set weightSourceID(arg: number);
    get weightSourceID(): number;
    get hiddenClassifications(): number[];
    set hiddenClassifications(values: number[]);
    get hiddenPointSourceIDs(): number[];
    set hiddenPointSourceIDs(values: number[]);
    get selectedPointSourceID(): number;
    set selectedPointSourceID(value: number);
    get selectedPointSourceIDColor(): THREE.Color;
    set selectedPointSourceIDColor(values: THREE.Color);
    disableEvents(): void;
    _hiddenListeners: any;
    _listeners: any;
    enableEvents(): void;
    copyFrom(from: any): void;
}
