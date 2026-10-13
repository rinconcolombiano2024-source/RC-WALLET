import test from "node:test";
import assert from "node:assert/strict";
import { createLatestScanRunner, mapSettledWithConcurrency } from "../src/scan-coordinator.js";

test("stale address result cannot overwrite latest address", async () => {
  const latest = createLatestScanRunner();
  let doneA, doneB;
  const messages = [];
  const a = latest.run({
    execute: () => new Promise((resolve) => { doneA = resolve; }),
    onSuccess: (value) => messages.push(value),
  });
  const b = latest.run({
    execute: () => new Promise((resolve) => { doneB = resolve; }),
    onSuccess: (value) => messages.push(value),
  });
  doneA("old-address");
  doneB("new-address");
  await Promise.all([a, b]);
  assert.deepEqual(messages, ["new-address"]);
});

test("cancelling scan suppresses all results and callbacks", async () => {
  const runner = createLatestScanRunner();
  let done;
  const events = [];
  const task = runner.run({
    execute: () => new Promise((resolve) => { done = resolve; }),
    onSuccess: () => events.push("success"),
    onError: () => events.push("error"),
    onFinish: () => events.push("finish"),
  });
  runner.cancel();
  done("ignore");
  await task;
  assert.deepEqual(events, []);
});

test("token concurrency is bounded and failure is not converted to zero", async () => {
  let active = 0, maximum = 0;
  const output = await mapSettledWithConcurrency(
    [1,2,3,4,5,6,7],
    async (x) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      if (x === 5) throw new Error("RPC unavailable");
      return x * 3;
    },
    { limit: 2 },
  );
  assert.ok(maximum <= 2);
  assert.equal(output[4].status, "rejected");
  assert.equal(output[0].value, 3);
  assert.equal(output[6].value, 21);
});

test("aborted queued work never starts", async () => {
  const controller = new AbortController();
  let called = 0;
  const job = mapSettledWithConcurrency([1,2,3], async () => {
    called += 1;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }, { limit: 1, signal: controller.signal });
  controller.abort();
  await assert.rejects(job, /Scan cancelled/);
  assert.ok(called <= 1);
});
