export function BinaryHeap(scoreFunction: any): void;
export class BinaryHeap {
    constructor(scoreFunction: any);
    content: any[];
    scoreFunction: any;
    push: (element: any) => void;
    pop: () => any;
    remove: (node: any) => void;
    size: () => number;
    bubbleUp: (n: any) => void;
    sinkDown: (n: any) => void;
}
