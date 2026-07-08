// Per-asset progress record. Bytes are reported as the fetch streams
// chunks through `loadAsset`. `total` is 0 when the response did not
// include a Content-Length header — callers should display "loading…"
// for those rather than a percentage.
export interface AssetProgress {
  name: string;
  url: string;
  loaded: number;
  total: number;
  done: boolean;
  error?: string;
}

export interface TrackerState {
  assets: AssetProgress[];
  totalBytes: number;
  loadedBytes: number;
  allAssetsDone: boolean;
  firstFrameRendered: boolean;
  ready: boolean;
}

interface MutableTrackerState {
  assets: AssetProgress[];
  firstFrameRendered: boolean;
}

const internalState: MutableTrackerState = {
  assets: [],
  firstFrameRendered: false,
};

const listeners = new Set<() => void>();

let cachedSnapshot: TrackerState = computeSnapshot();

function computeSnapshot(): TrackerState {
  const assets = internalState.assets;
  let totalBytes = 0;
  let loadedBytes = 0;
  let allAssetsDone = assets.length > 0;
  for (const asset of assets) {
    if (asset.total > 0) {
      totalBytes += asset.total;
      loadedBytes += Math.min(asset.loaded, asset.total);
    }
    if (!asset.done) {
      allAssetsDone = false;
    }
  }
  const firstFrameRendered = internalState.firstFrameRendered;
  return {
    assets: assets.slice(),
    totalBytes,
    loadedBytes,
    allAssetsDone,
    firstFrameRendered,
    ready: allAssetsDone && firstFrameRendered,
  };
}

function publish(): void {
  cachedSnapshot = computeSnapshot();
  for (const listener of listeners) listener();
}

function findAssetIndex(url: string): number {
  return internalState.assets.findIndex((asset) => asset.url === url);
}

export const loadingTracker = {
  registerAsset(name: string, url: string, total: number = 0): void {
    const existingIndex = findAssetIndex(url);
    if (existingIndex >= 0) {
      // Re-registering an asset (e.g. on Retry) resets its progress.
      internalState.assets[existingIndex] = {
        name,
        url,
        loaded: 0,
        total,
        done: false,
      };
    } else {
      internalState.assets.push({
        name,
        url,
        loaded: 0,
        total,
        done: false,
      });
    }
    publish();
  },

  reportProgress(url: string, loaded: number, total: number): void {
    const index = findAssetIndex(url);
    if (index < 0) return;
    const asset = internalState.assets[index];
    internalState.assets[index] = {
      ...asset,
      loaded,
      total: total > 0 ? total : asset.total,
    };
    publish();
  },

  reportDone(url: string): void {
    const index = findAssetIndex(url);
    if (index < 0) return;
    const asset = internalState.assets[index];
    const finalTotal = asset.total > 0 ? asset.total : asset.loaded;
    internalState.assets[index] = {
      ...asset,
      total: finalTotal,
      loaded: finalTotal,
      done: true,
    };
    publish();
  },

  reportError(url: string, error: string): void {
    const index = findAssetIndex(url);
    if (index < 0) return;
    const asset = internalState.assets[index];
    internalState.assets[index] = {
      ...asset,
      done: true,
      error,
    };
    publish();
  },

  markFirstFrame(): void {
    if (internalState.firstFrameRendered) return;
    internalState.firstFrameRendered = true;
    publish();
  },

  // Test-only: wipe state so suites do not bleed into one another.
  // Safe to call from production code too — it just resets the boot
  // tracker.
  reset(): void {
    internalState.assets = [];
    internalState.firstFrameRendered = false;
    publish();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot(): TrackerState {
    return cachedSnapshot;
  },
};
