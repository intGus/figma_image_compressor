// Plugin UI: settings, the file table, compression and download.

import JSZip from 'jszip';
import engineSource from 'virtual:engine-source';
import type { CompressResult } from '../engine/compress';
import { CancelledError, EngineClient } from './engine-client';
import { uniqueFileNames, zipFileName } from '../shared/filenames';
import { formatBytes, naturalCompare, shortenString } from '../shared/format';
import type { ToCode, ToUi } from '../shared/messages';
import { DEFAULT_SETTINGS, extensionFor, sanitizeSettings, type Settings } from '../shared/settings';

// ---------- Elements ----------

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fmtEl = $<HTMLSelectElement>('format');
const losslessEl = $<HTMLInputElement>('lossless');
const chromaEl = $<HTMLSelectElement>('chroma');
const quantColorsEl = $<HTMLInputElement>('quantColors');
const oxipngEl = $<HTMLInputElement>('oxipng');
const jpegBgEl = $<HTMLInputElement>('jpegBg');
const alphaNoteEl = $<HTMLElement>('alphaNote');
const maxWidthEl = $<HTMLInputElement>('maxWidth');
const qInput = $<HTMLInputElement>('quality');
const rInput = $<HTMLInputElement>('qualityRange');
const zipNameEl = $<HTMLInputElement>('zipName');
const reloadBtn = $<HTMLButtonElement>('reload');
const exportBtn = $<HTMLButtonElement>('export');
const compressBtn = $<HTMLButtonElement>('compress');
const cancelBtn = $<HTMLButtonElement>('cancel');
const messageEl = $<HTMLElement>('message');
const busyText = $<HTMLElement>('busyText');
const busyBarWrap = $<HTMLElement>('busyBarWrap');
const busyBar = $<HTMLElement>('busyBar');
const tableContainer = $<HTMLElement>('table-container');

function postToCode(msg: ToCode) {
  parent.postMessage({ pluginMessage: msg }, '*');
}

// ---------- State ----------

interface Item {
  id: string;
  name: string;
  label: string;
  suffix: string;
  /** PNG exported by Figma, once it has arrived. Kept so setting changes don't need a new export. */
  original?: Uint8Array;
  result?: CompressResult & { blob: Blob };
  error?: string;
}

/** Selections up to this size are exported and compressed straight away; bigger ones wait for "Compress". */
const AUTO_COMPRESS_LIMIT = 12;

let items: Item[] = [];
/** True while the current selection should be exported and compressed. */
let active = false;
/** Bumped whenever results in flight become stale (new selection, new settings, cancel). */
let runId = 0;
let exportId = 0;
let exportingIds = new Set<string>();

const engine = new EngineClient(engineSource, Math.max(1, Math.min(2, (navigator.hardwareConcurrency || 2) - 1)));

// ---------- Settings ----------

function readSettings(): Settings {
  return sanitizeSettings({
    format: fmtEl.value,
    quality: Number(qInput.value),
    lossless: losslessEl.checked,
    chroma: chromaEl.value,
    quantColors: Number(quantColorsEl.value || 0),
    oxipng: oxipngEl.checked,
    jpegBackground: jpegBgEl.value,
    maxWidth: Number(maxWidthEl.value || 0),
    zipName: zipNameEl.value,
  });
}

function applySettings(s: Settings) {
  fmtEl.value = s.format;
  qInput.value = rInput.value = String(s.quality);
  losslessEl.checked = s.lossless;
  chromaEl.value = s.chroma;
  quantColorsEl.value = String(s.quantColors);
  oxipngEl.checked = s.oxipng;
  jpegBgEl.value = s.jpegBackground;
  maxWidthEl.value = s.maxWidth ? String(s.maxWidth) : '';
  zipNameEl.value = s.zipName;
  updateControls();
}

let saveTimer: number | undefined;
function saveSettingsSoon() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => postToCode({ type: 'save-settings', settings: readSettings() }), 300);
}

function setEnabled(ctrl: HTMLInputElement | HTMLSelectElement, enabled: boolean) {
  ctrl.disabled = !enabled;
  const label = ctrl.previousElementSibling?.tagName === 'LABEL' ? ctrl.previousElementSibling : null;
  ctrl.classList.toggle('disabled-ctrl', !enabled);
  label?.classList.toggle('disabled-ctrl', !enabled);
}

function updateControls() {
  const fmt = fmtEl.value;
  const isJpeg = fmt === 'JPEG';
  const isWebp = fmt === 'WEBP';
  const isAvif = fmt === 'AVIF';
  const isPng = fmt === 'PNG';
  const isPngOpt = fmt === 'PNG-lossless-oxipng';
  const qualityRelevant = isJpeg || ((isWebp || isAvif) && !losslessEl.checked);

  setEnabled(qInput, qualityRelevant);
  setEnabled(rInput, qualityRelevant);
  setEnabled(chromaEl, isJpeg);
  setEnabled(jpegBgEl, isJpeg);
  setEnabled(losslessEl, isWebp || isAvif);
  setEnabled(quantColorsEl, isPng);
  setEnabled(oxipngEl, isPng || isPngOpt);

  alphaNoteEl.hidden = !(isJpeg && items.some((it) => it.result?.hasAlpha));
}

// Any setting change: remember it, then recompress after a short pause.
function onSettingChanged() {
  updateControls();
  saveSettingsSoon();
  scheduleCompress();
}
rInput.addEventListener('input', () => { qInput.value = rInput.value; onSettingChanged(); });
qInput.addEventListener('input', () => { rInput.value = qInput.value; onSettingChanged(); });
for (const el of [fmtEl, losslessEl, chromaEl, oxipngEl]) el.addEventListener('change', onSettingChanged);
for (const el of [quantColorsEl, jpegBgEl, maxWidthEl]) el.addEventListener('input', onSettingChanged);
zipNameEl.addEventListener('input', saveSettingsSoon);

// ---------- Compression ----------

let compressTimer: number | undefined;
function scheduleCompress() {
  clearTimeout(compressTimer);
  compressTimer = window.setTimeout(restartCompression, 600);
}

/** Settings changed: throw away results and compress again from the PNGs we already have. */
function restartCompression() {
  clearTimeout(compressTimer);
  runId++;
  engine.cancelAll();
  for (const it of items) {
    it.result = undefined;
    if (it.original) it.error = undefined;
  }
  if (active) start();
  else refresh();
}

/** Exports whatever is missing and compresses everything that has no result yet. */
function start() {
  active = true;
  const myRun = runId;
  const settings = readSettings();

  const needExport = items.filter((it) => !it.original && !it.error && !exportingIds.has(it.id)).map((it) => it.id);
  if (needExport.length) {
    exportId++;
    for (const id of needExport) exportingIds.add(id);
    postToCode({ type: 'export', exportId, ids: needExport });
  }
  for (const it of items) {
    if (it.original && !it.result && !it.error) compressItem(it, myRun, settings);
  }
  refresh();
}

function compressItem(it: Item, myRun: number, settings: Settings) {
  engine.compress(it.original!, settings).then(
    (r) => {
      if (myRun !== runId) return;
      it.result = { ...r, blob: new Blob([r.bytes as BlobPart], { type: r.mime }) };
      refresh();
    },
    (err) => {
      if (myRun !== runId || err instanceof CancelledError) return;
      console.error('Compression failed for', it.name, err);
      it.error = err instanceof Error ? err.message : String(err);
      refresh();
    },
  );
}

function cancel() {
  active = false;
  runId++;
  engine.cancelAll();
  exportingIds = new Set();
  postToCode({ type: 'cancel-export' });
  refresh();
}

// ---------- Status ----------

function progress() {
  const done = items.filter((it) => it.result || it.error).length;
  return { done, total: items.length, busy: active && done < items.length };
}

let refreshQueued = false;
/** Re-renders the table, progress and buttons on the next frame (batched). */
function refresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    const { done, total, busy } = progress();
    busyText.style.display = busyBarWrap.style.display = busy ? 'block' : 'none';
    busyBar.style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
    const exporting = items.filter((it) => exportingIds.has(it.id)).length;
    busyText.textContent = exporting ? `Exporting from Figma… ${total - exporting}/${total}` : `Compressing… ${done}/${total}`;

    cancelBtn.hidden = !busy;
    compressBtn.hidden = busy || total === 0 || done === total;
    compressBtn.textContent = items.some((it) => it.original || it.result) ? 'Resume' : `Compress ${total} layers`;
    exportBtn.textContent = items.filter((it) => it.result).length === 1 ? 'Download' : 'Export';
    // Export once nothing is pending; layers that failed are skipped.
    exportBtn.disabled = busy || !items.some((it) => it.result) || items.some((it) => !it.result && !it.error);

    const errors = items.filter((it) => it.error).length;
    if (!active && total > done && !items.some((it) => it.original || it.result)) {
      messageEl.textContent = `${total} layers selected. Press Compress to export and compress them.`;
    } else if (errors) {
      messageEl.textContent = `${errors} of ${total} couldn't be processed (hover "Error" for details) and will be left out of the export.`;
    } else {
      messageEl.textContent = '';
    }
    renderTable();
    updateControls();
  });
}

// ---------- Table ----------

/** File names in selection order, the same names the ZIP will use. */
function fileNames(): string[] {
  const ext = extensionFor(fmtEl.value as Settings['format']);
  return uniqueFileNames(items.map((it) => ({ base: it.name + it.suffix, ext: it.result?.ext ?? ext })));
}

function cell(text: string, className?: string, title?: string): HTMLTableCellElement {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  if (title) td.title = title;
  return td;
}

function savedText(original: number, compressed: number): { text: string; cls: string } {
  if (!original) return { text: '', cls: '' };
  const pct = Math.round((1 - compressed / original) * 100);
  if (pct >= 0) return { text: `${pct}%`, cls: 'saved-good' };
  return { text: `+${-pct}% larger`, cls: 'saved-bad' };
}

function renderTable() {
  const names = fileNames();
  const rows = items.map((it, i) => ({ it, file: names[i] })).sort((a, b) => naturalCompare(a.file, b.file));

  const table = document.createElement('table');
  const header = document.createElement('tr');
  for (const [t, num] of [['File Name', false], ['Size', false], ['Original', true], ['Compressed', true], ['Saved', true]] as const) {
    const th = document.createElement('th');
    th.textContent = t;
    if (num) th.className = 'num';
    header.appendChild(th);
  }
  table.appendChild(header);

  let totalOriginal = 0;
  let totalCompressed = 0;
  for (const { it, file } of rows) {
    const tr = document.createElement('tr');
    tr.appendChild(cell(shortenString(file, 34), undefined, `${file}\nLayer: ${it.name}`));
    const dims = it.result ? `${it.result.width}×${it.result.height}` : '';
    tr.appendChild(cell(it.label, undefined, dims ? `Output: ${dims} px` : undefined));
    tr.appendChild(
      it.original
        ? cell(formatBytes(it.original.length), 'num', 'PNG as exported by Figma')
        : cell(exportingIds.has(it.id) ? 'Exporting…' : '—', 'num muted'),
    );
    if (it.error) {
      tr.append(cell('Error', 'num status-error', it.error), cell(''));
    } else if (it.result && it.original) {
      const saved = savedText(it.original.length, it.result.bytes.length);
      tr.append(cell(formatBytes(it.result.bytes.length), 'num'), cell(saved.text, `num ${saved.cls}`));
      totalOriginal += it.original.length;
      totalCompressed += it.result.bytes.length;
    } else {
      tr.append(cell(it.original && active ? 'Compressing…' : '—', 'num muted'), cell(''));
    }
    table.appendChild(tr);
  }
  const totalRow = document.createElement('tr');
  totalRow.className = 'total';
  const saved = savedText(totalOriginal, totalCompressed);
  totalRow.append(
    cell('Total'),
    cell(''),
    cell(totalOriginal ? formatBytes(totalOriginal) : '', 'num'),
    cell(totalCompressed ? formatBytes(totalCompressed) : '', 'num'),
    cell(saved.text, `num ${saved.cls}`),
  );
  table.appendChild(totalRow);

  tableContainer.replaceChildren(items.length ? table : document.createTextNode(''));
}

// ---------- Export ----------

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportFiles() {
  const names = fileNames();
  const ready = items.map((it, i) => ({ it, name: names[i] })).filter((x) => x.it.result);
  if (ready.length === 0) return;
  if (ready.length === 1) {
    // One image: download it directly, no ZIP.
    download(ready[0].it.result!.blob, ready[0].name);
    return;
  }
  const zip = new JSZip();
  for (const { it, name } of ready) zip.file(name, it.result!.blob, { binary: true });
  const content = await zip.generateAsync({ type: 'blob' });
  download(content, zipFileName(zipNameEl.value));
}

exportBtn.addEventListener('click', () => void exportFiles());
compressBtn.addEventListener('click', () => start());
cancelBtn.addEventListener('click', () => cancel());
reloadBtn.addEventListener('click', () => postToCode({ type: 'reload' }));

// ---------- Messages from the plugin sandbox ----------

window.onmessage = (event: MessageEvent) => {
  const msg = event.data?.pluginMessage as ToUi | undefined;
  if (!msg) return;
  switch (msg.type) {
    case 'init':
      applySettings(msg.settings);
      break;
    case 'selection':
      // New selection: drop everything in flight for the old one.
      runId++;
      engine.cancelAll();
      exportingIds = new Set();
      items = msg.layers.map((l) => ({ id: l.id, name: l.name, label: l.label, suffix: l.suffix }));
      active = false;
      if (items.length > 0 && items.length <= AUTO_COMPRESS_LIMIT) start();
      else refresh();
      break;
    case 'exported': {
      if (msg.exportId !== exportId) break;
      exportingIds.delete(msg.id);
      const it = items.find((x) => x.id === msg.id);
      if (!it) break;
      it.original = msg.bytes;
      if (active) compressItem(it, runId, readSettings());
      refresh();
      break;
    }
    case 'export-failed': {
      if (msg.exportId !== exportId) break;
      exportingIds.delete(msg.id);
      const it = items.find((x) => x.id === msg.id);
      if (it) it.error = `Figma couldn't export this layer: ${msg.message}`;
      refresh();
      break;
    }
    case 'export-finished':
      break;
  }
};

applySettings(DEFAULT_SETTINGS);
