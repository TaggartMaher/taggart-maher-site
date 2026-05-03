import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadingTracker } from "./LoadingTracker";
import { loadAsset } from "./loadAsset";

beforeEach(() => {
  loadingTracker.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeStreamingResponse(
  chunks: Uint8Array[],
  total: number,
  status: number = 200,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  const headers = new Headers();
  if (total > 0) headers.set("Content-Length", String(total));
  return new Response(stream, {
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    headers,
  });
}

describe("loadAsset", () => {
  it("streams chunks and reports progress in order, then done", async () => {
    const chunks = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5]), new Uint8Array([6])];
    const total = 6;
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(makeStreamingResponse(chunks, total));

    const buffer = await loadAsset("six.bin", "/six.bin");
    expect(new Uint8Array(buffer)).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));

    const snapshot = loadingTracker.getSnapshot();
    expect(snapshot.assets).toHaveLength(1);
    expect(snapshot.assets[0].done).toBe(true);
    expect(snapshot.assets[0].loaded).toBe(6);
    expect(snapshot.assets[0].total).toBe(6);
  });

  it("handles responses without Content-Length", async () => {
    const chunks = [new Uint8Array([10, 20, 30])];
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(makeStreamingResponse(chunks, 0));

    const buffer = await loadAsset("nolen.bin", "/nolen.bin");
    expect(buffer.byteLength).toBe(3);
    const snapshot = loadingTracker.getSnapshot();
    expect(snapshot.assets[0].total).toBe(3);
    expect(snapshot.assets[0].done).toBe(true);
  });

  it("reports an error and rethrows on non-OK status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(makeStreamingResponse([], 0, 404));
    await expect(loadAsset("missing.bin", "/missing.bin")).rejects.toThrow(/404/);
    const snapshot = loadingTracker.getSnapshot();
    expect(snapshot.assets[0].error).toMatch(/404/);
    expect(snapshot.assets[0].done).toBe(true);
  });

  it("reports an error and rethrows when fetch itself rejects", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network down"));
    await expect(loadAsset("net.bin", "/net.bin")).rejects.toThrow(/network down/);
    const snapshot = loadingTracker.getSnapshot();
    expect(snapshot.assets[0].error).toContain("network down");
    expect(snapshot.assets[0].done).toBe(true);
  });
});
