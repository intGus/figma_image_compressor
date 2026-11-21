// Entry point of the compression engine bundle (built separately by scripts/build.mjs).
//
// Normally this runs inside a Web Worker so big batches don't freeze the plugin
// window. If the plugin's environment refuses workers, the UI runs this same code
// on the page instead and calls globalThis.__ficEngine.handle() directly.

import { compressImage, type CompressOptions } from './compress';

export type EngineRequest =
  | { type: 'ping' }
  | { type: 'compress'; jobId: number; bytes: Uint8Array; options: CompressOptions };

export type EngineReply =
  | { type: 'pong' }
  | { type: 'done'; jobId: number; bytes: Uint8Array; ext: string; mime: string; hasAlpha: boolean }
  | { type: 'error'; jobId: number; message: string };

async function handle(msg: EngineRequest): Promise<EngineReply> {
  if (msg.type === 'ping') return { type: 'pong' };
  try {
    const r = await compressImage(msg.bytes, msg.options);
    return { type: 'done', jobId: msg.jobId, ...r };
  } catch (err) {
    return { type: 'error', jobId: msg.jobId, message: err instanceof Error ? err.message : String(err) };
  }
}

declare const WorkerGlobalScope: any;
const g = globalThis as any;

if (typeof WorkerGlobalScope !== 'undefined' && g instanceof WorkerGlobalScope) {
  g.onmessage = async (e: MessageEvent<EngineRequest>) => {
    const reply = await handle(e.data);
    g.postMessage(reply, reply.type === 'done' ? [reply.bytes.buffer] : []);
  };
} else {
  g.__ficEngine = { handle };
}
