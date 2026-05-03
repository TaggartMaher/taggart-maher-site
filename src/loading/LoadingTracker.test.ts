import { beforeEach, describe, expect, it } from "vitest";
import { loadingTracker } from "./LoadingTracker";

beforeEach(() => {
  loadingTracker.reset();
});

describe("LoadingTracker", () => {
  it("starts empty and not ready", () => {
    const snapshot = loadingTracker.getSnapshot();
    expect(snapshot.assets).toHaveLength(0);
    expect(snapshot.allAssetsDone).toBe(false);
    expect(snapshot.firstFrameRendered).toBe(false);
    expect(snapshot.ready).toBe(false);
  });

  it("aggregates progress across registered assets", () => {
    loadingTracker.registerAsset("first", "/a", 100);
    loadingTracker.registerAsset("second", "/b", 200);
    loadingTracker.reportProgress("/a", 50, 100);
    loadingTracker.reportProgress("/b", 100, 200);
    const snapshot = loadingTracker.getSnapshot();
    expect(snapshot.totalBytes).toBe(300);
    expect(snapshot.loadedBytes).toBe(150);
    expect(snapshot.allAssetsDone).toBe(false);
  });

  it("excludes assets with unknown total from totalBytes", () => {
    loadingTracker.registerAsset("known", "/a", 100);
    loadingTracker.registerAsset("unknown", "/b", 0);
    loadingTracker.reportProgress("/a", 25, 100);
    loadingTracker.reportProgress("/b", 999, 0);
    const snapshot = loadingTracker.getSnapshot();
    expect(snapshot.totalBytes).toBe(100);
    expect(snapshot.loadedBytes).toBe(25);
  });

  it("flips allAssetsDone after every asset reports done", () => {
    loadingTracker.registerAsset("first", "/a", 100);
    loadingTracker.registerAsset("second", "/b", 200);
    loadingTracker.reportDone("/a");
    expect(loadingTracker.getSnapshot().allAssetsDone).toBe(false);
    loadingTracker.reportDone("/b");
    expect(loadingTracker.getSnapshot().allAssetsDone).toBe(true);
  });

  it("ready requires both allAssetsDone and firstFrameRendered", () => {
    loadingTracker.registerAsset("solo", "/a", 100);
    loadingTracker.reportDone("/a");
    expect(loadingTracker.getSnapshot().ready).toBe(false);
    loadingTracker.markFirstFrame();
    expect(loadingTracker.getSnapshot().ready).toBe(true);
  });

  it("markFirstFrame is idempotent", () => {
    let notifications = 0;
    const unsubscribe = loadingTracker.subscribe(() => {
      notifications += 1;
    });
    loadingTracker.markFirstFrame();
    loadingTracker.markFirstFrame();
    unsubscribe();
    expect(notifications).toBe(1);
  });

  it("notifies subscribers on registration and progress", () => {
    let notifications = 0;
    const unsubscribe = loadingTracker.subscribe(() => {
      notifications += 1;
    });
    loadingTracker.registerAsset("name", "/url", 10);
    loadingTracker.reportProgress("/url", 5, 10);
    loadingTracker.reportDone("/url");
    unsubscribe();
    expect(notifications).toBe(3);
  });

  it("reportError marks asset done with the message", () => {
    loadingTracker.registerAsset("bad", "/x", 100);
    loadingTracker.reportError("/x", "404 Not Found");
    const snapshot = loadingTracker.getSnapshot();
    expect(snapshot.assets[0].error).toBe("404 Not Found");
    expect(snapshot.assets[0].done).toBe(true);
    expect(snapshot.allAssetsDone).toBe(true);
  });

  it("re-registering an asset resets its progress", () => {
    loadingTracker.registerAsset("retry", "/r", 100);
    loadingTracker.reportDone("/r");
    loadingTracker.registerAsset("retry", "/r", 100);
    const snapshot = loadingTracker.getSnapshot();
    expect(snapshot.assets).toHaveLength(1);
    expect(snapshot.assets[0].done).toBe(false);
    expect(snapshot.assets[0].loaded).toBe(0);
  });
});
