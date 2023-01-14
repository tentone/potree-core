import { handleMessage } from './binary-decoder-worker-internal.ts';

onmessage = handleMessage;
