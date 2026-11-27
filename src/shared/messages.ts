// Messages between the plugin sandbox (src/code.ts) and the UI (src/ui/main.ts).
//
// The sandbox sends the selected layers' names right away; the PNG bytes are only
// exported when the UI asks for them, a few layers at a time.

import type { Settings } from './settings';

export interface LayerInfo {
  id: string;
  /** Layer name. */
  name: string;
  /** Size column label: "1x", "2x". */
  label: string;
  /** File name suffix, e.g. "@2x". */
  suffix: string;
}

export type ToUi =
  | { type: 'init'; settings: Settings }
  | { type: 'selection'; layers: LayerInfo[] }
  | { type: 'exported'; exportId: number; id: string; bytes: Uint8Array }
  | { type: 'export-failed'; exportId: number; id: string; message: string }
  | { type: 'export-finished'; exportId: number };

export type ToCode =
  | { type: 'reload' }
  | { type: 'save-settings'; settings: Settings }
  | { type: 'export'; exportId: number; ids: string[] }
  | { type: 'cancel-export' };
