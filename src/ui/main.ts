// Plugin UI: settings, the file table, compression and download.

import JSZip from 'jszip';
import { compressImage, type CompressResult } from '../engine/compress';
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
const qInput = $<HTMLInputElement>('quality');
const rInput = $<HTMLInputElement>('qualityRange');
const zipNameEl = $<HTMLInputElement>('zipName');
const reloadBtn = $<HTMLButtonElement>('reload');
const exportBtn = $<HTMLButtonElement>('export');
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
  original: Uint8Array;
  result?: CompressResult & { blob: Blob };
  error?: string;
}

let items: Item[] = [];
let runId = 0;

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
  const isPng = fmt === 'PNG';
  const isPngOpt = fmt === 'PNG-lossless-oxipng';
  const qualityRelevant = isJpeg || (isWebp && !losslessEl.checked);

  setEnabled(qInput, qualityRelevant);
  setEnabled(rInput, qualityRelevant);
  setEnabled(chromaEl, isJpeg);
  setEnabled(jpegBgEl, isJpeg);
  setEnabled(losslessEl, isWebp);
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
for (const el of [quantColorsEl, jpegBgEl]) el.addEventListener('input', onSettingChanged);
zipNameEl.addEventListener('input', saveSettingsSoon);

// ---------- Compression ----------

let compressTimer: number | undefined;
function scheduleCompress() {
  clearTimeout(compressTimer);
  compressTimer = window.setTimeout(compressAll, 600);
}

function showBusy(show: boolean) {
  busyText.style.display = show ? 'block' : 'none';
  busyBarWrap.style.display = show ? 'block' : 'none';
  if (!show) busyBar.style.width = '0%';
}
function setProgress(done: number, total: number) {
  busyBar.style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
  busyText.textContent = `Compressing… ${done}/${total}`;
}

async function compressAll() {
  clearTimeout(compressTimer);
  if (items.length === 0) return;
  const myRun = ++runId;
  const settings = readSettings();
  const batch = items;
  for (const it of batch) { it.result = undefined; it.error = undefined; }
  renderTable();
  showBusy(true);
  exportBtn.disabled = true;
  setProgress(0, batch.length);

  for (let i = 0; i < batch.length; i++) {
    const it = batch[i];
    try {
      const r = await compressImage(it.original, settings);
      if (myRun !== runId) return;
      it.result = { ...r, blob: new Blob([r.bytes as BlobPart], { type: r.mime }) };
    } catch (err) {
      if (myRun !== runId) return;
      console.error('Compression failed for', it.name, err);
      it.error = err instanceof Error ? err.message : String(err);
    }
    setProgress(i + 1, batch.length);
    renderTable();
  }
  if (myRun !== runId) return;
  showBusy(false);
  exportBtn.disabled = false;
  updateControls();
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

function renderTable() {
  const names = fileNames();
  const rows = items.map((it, i) => ({ it, file: names[i] })).sort((a, b) => naturalCompare(a.file, b.file));

  const table = document.createElement('table');
  const header = document.createElement('tr');
  for (const [t, num] of [['File Name', false], ['Scale', false], ['File Size', true]] as const) {
    const th = document.createElement('th');
    th.textContent = t;
    if (num) th.className = 'num';
    header.appendChild(th);
  }
  table.appendChild(header);

  let total = 0;
  for (const { it, file } of rows) {
    const tr = document.createElement('tr');
    tr.appendChild(cell(shortenString(file), undefined, `${file}\nLayer: ${it.name}`));
    tr.appendChild(cell(it.label));
    if (it.error) tr.appendChild(cell('Error', 'num status-error', it.error));
    else if (it.result) tr.appendChild(cell(formatBytes(it.result.bytes.length), 'num'));
    else tr.appendChild(cell(formatBytes(it.original.length), 'num muted', 'Original PNG size'));
    total += it.result ? it.result.bytes.length : it.original.length;
    table.appendChild(tr);
  }
  const totalRow = document.createElement('tr');
  totalRow.className = 'total';
  totalRow.append(cell('Total'), cell(''), cell(formatBytes(total), 'num'));
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
  const ready = items.filter((it) => it.result);
  if (ready.length !== items.length || items.length === 0) return;
  const names = fileNames();
  const zip = new JSZip();
  items.forEach((it, i) => zip.file(names[i], it.result!.blob, { binary: true }));
  const content = await zip.generateAsync({ type: 'blob' });
  download(content, zipFileName(zipNameEl.value));
}

exportBtn.addEventListener('click', () => void exportFiles());
reloadBtn.addEventListener('click', () => postToCode({ type: 'reload' }));

// ---------- Messages from the plugin sandbox ----------

window.onmessage = (event: MessageEvent) => {
  const msg = event.data?.pluginMessage as ToUi | undefined;
  if (!msg) return;
  if (msg.type === 'init') {
    applySettings(msg.settings);
  } else if (msg.type === 'selection') {
    runId++; // stop any compression of the old selection
    items = msg.items.map((x) => ({ id: x.id, name: x.name, label: x.label, suffix: x.suffix, original: x.bytes }));
    renderTable();
    updateControls();
    if (items.length) void compressAll();
    else showBusy(false);
  }
};

applySettings(DEFAULT_SETTINGS);
