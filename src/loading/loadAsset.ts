import { loadingTracker } from "./LoadingTracker";

// Streaming `fetch` wrapper that reports progress to the loading
// tracker. Returns the asset's body as an ArrayBuffer. Errors are
// reported via `reportError` and re-thrown so callers can decide how to
// recover.
export async function loadAsset(name: string, url: string): Promise<ArrayBuffer> {
  loadingTracker.registerAsset(name, url);

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    loadingTracker.reportError(url, message);
    throw error;
  }

  if (!response.ok) {
    const message = `${response.status} ${response.statusText}`;
    loadingTracker.reportError(url, message);
    throw new Error(`[loadAsset] ${url} failed: ${message}`);
  }

  const totalHeader = response.headers.get("Content-Length");
  const total = totalHeader ? parseInt(totalHeader, 10) : 0;
  if (total > 0) {
    loadingTracker.reportProgress(url, 0, total);
  }

  if (!response.body) {
    const buffer = await response.arrayBuffer();
    loadingTracker.reportProgress(url, buffer.byteLength, buffer.byteLength);
    loadingTracker.reportDone(url);
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loaded += value.byteLength;
        loadingTracker.reportProgress(url, loaded, total);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    loadingTracker.reportError(url, message);
    throw error;
  }

  loadingTracker.reportDone(url);

  const merged = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

// Companion helper for assets that are easier to consume as
// HTMLImageElements (e.g. PNGs uploaded via texImage2D from an Image
// rather than from raw bytes). Uses the browser's native image loader
// so the bytes go straight into the decoder — same path the original
// compositor used before Plan B. Progress is reported as
// queued → done rather than per-byte; the spec allows "loading…" for
// assets without a known total.
export function loadAssetAsImage(name: string, url: string): Promise<HTMLImageElement> {
  loadingTracker.registerAsset(name, url);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.addEventListener(
      "load",
      () => {
        loadingTracker.reportDone(url);
        resolve(image);
      },
      { once: true },
    );
    image.addEventListener(
      "error",
      () => {
        loadingTracker.reportError(url, "image load failed");
        reject(new Error(`[loadAssetAsImage] ${url} failed to load`));
      },
      { once: true },
    );
    image.src = url;
  });
}
