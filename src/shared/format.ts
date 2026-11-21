// Display helpers. Pure, unit tested in test/format.test.ts.

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function shortenString(str: string, max = 50): string {
  if (str.length <= max) return str;
  const head = Math.ceil((max - 3) / 2);
  const tail = max - 3 - head;
  return `${str.slice(0, head)}...${str.slice(-tail)}`;
}

export function naturalCompare(a: string, b: string): number {
  return new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare(a, b);
}
