/** ~1 request per second per host, so a 200-link syllabus never hammers one college server. */
export class HostLimiter {
  private next = new Map<string, number>();
  constructor(private delayMs: number) {}

  async wait(host: string) {
    const now = Date.now();
    const at = Math.max(now, this.next.get(host) ?? 0);
    this.next.set(host, at + this.delayMs);
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  }
}

export async function pool<T, R>(items: T[], size: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(size, items.length)) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}
