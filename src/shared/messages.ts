// Messages between the plugin sandbox (src/code.ts) and the UI (src/ui/main.ts).

import type { Settings } from './settings';

export interface ExportedItem {
  id: string;
  /** Layer name. */
  name: string;
  /** Size column label: "1x", "2x". */
  label: string;
  /** File name suffix, e.g. "@2x". */
  suffix: string;
  /** PNG bytes exported by Figma. */
  bytes: Uint8Array;
}

export type ToUi =
  | { type: 'init'; settings: Settings }
  | { type: 'selection'; items: ExportedItem[] };

export type ToCode = { type: 'reload' } | { type: 'save-settings'; settings: Settings };
