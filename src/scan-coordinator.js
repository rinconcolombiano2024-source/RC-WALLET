// Runs balance scans without allowing results from an old address to overwrite
// the current screen. Aborting prevents further work when the caller honors the
// signal; ethers RPC requests already in flight may still finish independently.
export function createLatestScanRunner() {
  let active = null;

  return {
    async run({ execute, onStart, onSuccess, onError, onFinish }) {
      active?.abort();
      const controller = new AbortController();
      active = controller;
      const current = () => active === controller && !controller.signal.aborted;

      try {
        onStart?.();
        const result = await execute(controller.signal);
        if (current()) onSuccess?.(result);
      } catch (error) {
        if (current()) onError?.(error);
      } finally {
        if (current()) {
          active = null;
          onFinish?.();
        }
      }
    },
    cancel() {
      active?.abort();
      active = null;
    },
  };
}

// Limits concurrency without converting individual token failures into zeros.
// Promise.allSettled semantics are preserved in the original input order.
export async function mapSettledWithConcurrency(items, mapper, { limit = 4, signal } = {}) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("Concurrency limit must be a positive integer");
  }
  if (signal?.aborted) throw new DOMException("Scan cancelled", "AbortError");
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (!signal?.aborted) {
      const index = next++;
      if (index >= items.length) return;
      try {
        results[index] = { status: "fulfilled", value: await mapper(items[index], index) };
      } catch (error) {
        results[index] = { status: "rejected", reason: error };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(items.length, limit) }, worker));
  if (signal?.aborted) throw new DOMException("Scan cancelled", "AbortError");
  return results;
}
