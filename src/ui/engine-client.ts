// Runs compression jobs off the UI thread.
//
// Starts a small pool of Web Workers from the bundled engine source. If workers
// can't be created in this environment (or never answer), it falls back to running
// the engine on the page, one job at a time, yielding between jobs so the window
// can still repaint.

import type { CompressOptions, CompressResult } from '../engine/compress';
import type { EngineReply, EngineRequest } from '../engine/worker';

export class CancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CancelledError';
  }
}

interface Job {
  id: number;
  bytes: Uint8Array;
  options: CompressOptions;
  resolve: (r: CompressResult) => void;
  reject: (e: Error) => void;
}

interface Slot {
  worker: Worker;
  state: 'booting' | 'ready' | 'dead';
  job?: Job;
}

interface InlineEngine {
  handle(msg: EngineRequest): Promise<EngineReply>;
}

const READY_TIMEOUT_MS = 8000;

export class EngineClient {
  private slots: Slot[] = [];
  private queue: Job[] = [];
  private nextId = 1;
  private mode: 'unknown' | 'workers' | 'inline' = 'unknown';
  private modeReady?: Promise<void>;
  private inline?: InlineEngine;
  private inlineBusy = false;
  private workerUrl?: string;

  constructor(
    private readonly source: string,
    private readonly poolSize: number,
  ) {}

  /** Where jobs run, for diagnostics. */
  get runsIn(): 'unknown' | 'workers' | 'inline' {
    return this.mode;
  }

  compress(bytes: Uint8Array, options: CompressOptions): Promise<CompressResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ id: this.nextId++, bytes, options, resolve, reject });
      void this.pump();
    });
  }

  /** Drops every queued job and stops running ones. Their promises reject with CancelledError. */
  cancelAll() {
    const queued = this.queue.splice(0);
    for (const job of queued) job.reject(new CancelledError());
    for (const slot of this.slots) {
      if (slot.job) {
        const job = slot.job;
        slot.job = undefined;
        // A running WebAssembly call can't be interrupted, so replace the worker.
        this.replace(slot);
        job.reject(new CancelledError());
      }
    }
    // Inline jobs can't be stopped mid-way; their results are ignored by the caller.
  }

  // ---------- internals ----------

  private ensureMode(): Promise<void> {
    if (!this.modeReady) this.modeReady = this.detectMode();
    return this.modeReady;
  }

  private async detectMode() {
    try {
      const first = this.newSlot();
      if (await this.whenBooted(first)) {
        this.slots.push(first);
        for (let i = 1; i < this.poolSize; i++) this.slots.push(this.newSlot());
        this.mode = 'workers';
        return;
      }
      first.worker.terminate();
    } catch (err) {
      console.warn('Web Workers unavailable, compressing on the page instead:', err);
    }
    this.loadInline();
    this.mode = 'inline';
  }

  private newSlot(): Slot {
    const slot = { state: 'booting' } as Slot;
    this.boot(slot);
    return slot;
  }

  private boot(slot: Slot) {
    if (!this.workerUrl) this.workerUrl = URL.createObjectURL(new Blob([this.source], { type: 'text/javascript' }));
    const worker = new Worker(this.workerUrl);
    slot.worker = worker;
    slot.state = 'booting';
    slot.job = undefined;
    const timer = setTimeout(() => {
      if (slot.worker === worker && slot.state === 'booting') this.markDead(slot);
    }, READY_TIMEOUT_MS);
    worker.onmessage = (e: MessageEvent<EngineReply>) => {
      if (slot.worker !== worker) return;
      if (e.data.type === 'pong') {
        clearTimeout(timer);
        slot.state = 'ready';
        void this.pump();
      } else {
        this.onReply(slot, e.data);
      }
    };
    worker.onerror = (e) => {
      if (slot.worker !== worker) return;
      clearTimeout(timer);
      e.preventDefault();
      this.onCrash(slot, e.message || 'worker error');
    };
    worker.postMessage({ type: 'ping' } satisfies EngineRequest);
  }

  /** Resolves true once the slot's worker answers, false if it fails or times out. */
  private whenBooted(slot: Slot): Promise<boolean> {
    return new Promise((resolve) => {
      const check = () => {
        if (slot.state === 'ready') resolve(true);
        else if (slot.state === 'dead') resolve(false);
        else setTimeout(check, 25);
      };
      check();
    });
  }

  private replace(slot: Slot) {
    slot.worker.terminate();
    this.boot(slot);
  }

  private markDead(slot: Slot) {
    slot.state = 'dead';
    slot.worker.terminate();
    // If every worker is gone, run the rest on the page rather than leaving jobs stuck.
    if (this.mode === 'workers' && this.slots.length && this.slots.every((s) => s.state === 'dead')) {
      console.warn('All compression workers failed; compressing on the page instead.');
      try {
        this.loadInline();
        this.mode = 'inline';
      } catch (err) {
        for (const job of this.queue.splice(0)) job.reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
    }
    void this.pump();
  }

  private onReply(slot: Slot, reply: EngineReply) {
    const job = slot.job;
    if (!job || reply.type === 'pong' || reply.jobId !== job.id) return;
    slot.job = undefined;
    if (reply.type === 'done') job.resolve({ bytes: reply.bytes, ext: reply.ext, mime: reply.mime, hasAlpha: reply.hasAlpha });
    else job.reject(new Error(reply.message));
    void this.pump();
  }

  private onCrash(slot: Slot, message: string) {
    const job = slot.job;
    slot.job = undefined;
    if (job) job.reject(new Error(`Compression crashed (${message}). The image may be too large.`));
    // A worker that crashes mid-job gets a fresh replacement; one that never started is given up on.
    if (slot.state === 'ready') this.replace(slot);
    else this.markDead(slot);
  }

  private loadInline() {
    if (this.inline) return;
    const script = document.createElement('script');
    script.textContent = this.source;
    document.head.appendChild(script);
    this.inline = (globalThis as any).__ficEngine as InlineEngine | undefined;
    if (!this.inline) throw new Error('Compression engine failed to load');
  }

  private async pump() {
    if (this.queue.length === 0) return;
    await this.ensureMode();

    if (this.mode === 'workers') {
      for (const slot of this.slots) {
        if (this.queue.length === 0) break;
        if (slot.state !== 'ready' || slot.job) continue;
        const job = this.queue.shift()!;
        slot.job = job;
        const copy = job.bytes.slice(); // keep the original for later recompression
        slot.worker.postMessage(
          { type: 'compress', jobId: job.id, bytes: copy, options: job.options } satisfies EngineRequest,
          [copy.buffer],
        );
      }
      return;
    }

    if (this.inlineBusy || !this.inline) return;
    this.inlineBusy = true;
    try {
      while (this.queue.length) {
        const job = this.queue.shift()!;
        await new Promise((r) => setTimeout(r, 0)); // let the window repaint between images
        const reply = await this.inline.handle({ type: 'compress', jobId: job.id, bytes: job.bytes, options: job.options });
        if (reply.type === 'done') job.resolve({ bytes: reply.bytes, ext: reply.ext, mime: reply.mime, hasAlpha: reply.hasAlpha });
        else if (reply.type === 'error') job.reject(new Error(reply.message));
      }
    } finally {
      this.inlineBusy = false;
    }
  }
}
