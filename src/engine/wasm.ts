// Loads the bundled WebAssembly codecs.
//
// The build (scripts/build.mjs) inlines every .wasm file as gzip + base64 so the
// whole plugin is one HTML file with nothing fetched from the network. A codec is
// only unpacked and compiled the first time it's used, then cached.

const compiled = new Map<string, Promise<WebAssembly.Module>>();

async function gunzipBase64(b64: string): Promise<Uint8Array> {
  const bin = atob(b64);
  const gz = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) gz[i] = bin.charCodeAt(i);
  // (cast: @types/node, pulled in by dependencies' typings, shadows the DOM stream type)
  const source = new Blob([gz]).stream() as unknown as {
    pipeThrough(t: DecompressionStream): ReadableStream<Uint8Array>;
  };
  const stream = source.pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function compileWasm(key: string, gzBase64: string): Promise<WebAssembly.Module> {
  let p = compiled.get(key);
  if (!p) {
    p = gunzipBase64(gzBase64).then((bytes) => WebAssembly.compile(bytes as BufferSource));
    compiled.set(key, p);
    p.catch(() => compiled.delete(key));
  }
  return p;
}
