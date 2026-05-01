// Hand-rolled decoder for the exact EXR format the Rust bake binary
// (scripts/bake-textures/) writes:
//
//   - single-part, scanline (not tiled), uncompressed
//   - INCREASING_Y line order
//   - half-float pixels in channels R, G, B (and optional A)
//
// Returns a Uint16Array of half-float bits in RGBA order, suitable for
// direct upload to a WebGL2 RGBA16F texture with type HALF_FLOAT — the
// raw bits are what the GPU reads as IEEE half-floats.
//
// Y is flipped during decode: the EXR's first scanline (top of image)
// lands at the END of the output buffer. After upload as
// ArrayBufferView (which UNPACK_FLIP_Y_WEBGL leaves alone) the top of
// the source ends up at texture v = 1, matching the beauty PNG's
// orientation via FLIP_Y on its HTMLImageElement upload.

const EXR_MAGIC = 0x01312f76;
const FLAG_SINGLE_PART_TILE = 0x0200;
const FLAG_NON_IMAGE = 0x0800;
const FLAG_MULTIPART = 0x1000;

const PIXEL_TYPE_HALF = 1;
const COMPRESSION_NONE = 0;
const LINE_ORDER_INCREASING_Y = 0;

const HALF_FLOAT_ONE_BITS = 0x3c00;

export interface DecodedExr {
  width: number;
  height: number;
  rgbaHalfFloats: Uint16Array;
}

interface ChannelDescriptor {
  name: string;
  pixelType: number;
}

export function decodeExr(buffer: ArrayBuffer): DecodedExr {
  const view = new DataView(buffer);
  let cursor = 0;

  if (view.getUint32(cursor, true) !== EXR_MAGIC) {
    throw new Error("[decodeExr] not an EXR file (bad magic)");
  }
  cursor += 4;

  const versionFlags = view.getUint32(cursor, true);
  cursor += 4;
  if (versionFlags & FLAG_MULTIPART) {
    throw new Error("[decodeExr] multipart EXR not supported");
  }
  if (versionFlags & FLAG_SINGLE_PART_TILE) {
    throw new Error("[decodeExr] tiled EXR not supported");
  }
  if (versionFlags & FLAG_NON_IMAGE) {
    throw new Error("[decodeExr] deep / non-image EXR not supported");
  }

  let dataWindow: { xMin: number; yMin: number; xMax: number; yMax: number } | null = null;
  let compression = -1;
  let lineOrder = -1;
  const channels: ChannelDescriptor[] = [];

  while (true) {
    const attributeName = readNullTerminatedAscii(view, cursor);
    cursor += attributeName.length + 1;
    if (attributeName.length === 0) break;
    // Type string is informational — we route on attribute name. Skip.
    cursor += readNullTerminatedAscii(view, cursor).length + 1;
    const valueSize = view.getInt32(cursor, true);
    cursor += 4;
    const valueStart = cursor;

    if (attributeName === "channels") {
      while (true) {
        const channelName = readNullTerminatedAscii(view, cursor);
        cursor += channelName.length + 1;
        if (channelName.length === 0) break;
        const pixelType = view.getInt32(cursor, true);
        cursor += 4;
        // 1 byte pLinear + 3 reserved + 4 xSampling + 4 ySampling
        cursor += 12;
        channels.push({ name: channelName, pixelType });
      }
    } else if (attributeName === "dataWindow") {
      dataWindow = {
        xMin: view.getInt32(cursor, true),
        yMin: view.getInt32(cursor + 4, true),
        xMax: view.getInt32(cursor + 8, true),
        yMax: view.getInt32(cursor + 12, true),
      };
    } else if (attributeName === "compression") {
      compression = view.getUint8(cursor);
    } else if (attributeName === "lineOrder") {
      lineOrder = view.getUint8(cursor);
    }

    cursor = valueStart + valueSize;
  }

  if (!dataWindow) {
    throw new Error("[decodeExr] missing dataWindow attribute");
  }
  if (compression !== COMPRESSION_NONE) {
    throw new Error(`[decodeExr] only uncompressed EXR supported; got compression=${compression}`);
  }
  if (lineOrder !== LINE_ORDER_INCREASING_Y) {
    throw new Error(`[decodeExr] only INCREASING_Y line order supported; got ${lineOrder}`);
  }

  const width = dataWindow.xMax - dataWindow.xMin + 1;
  const height = dataWindow.yMax - dataWindow.yMin + 1;

  // Channels in the scanline payload are stored alphabetically by
  // name, regardless of header chlist order.
  const sortedChannels = [...channels].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const channel of sortedChannels) {
    if (channel.pixelType !== PIXEL_TYPE_HALF) {
      throw new Error(
        `[decodeExr] expected half-float channels; ${channel.name} is pixelType=${channel.pixelType}`,
      );
    }
  }
  const channelIndex = (name: string): number =>
    sortedChannels.findIndex((channel) => channel.name === name);
  const rIndex = channelIndex("R");
  const gIndex = channelIndex("G");
  const bIndex = channelIndex("B");
  const aIndex = channelIndex("A");
  if (rIndex < 0 || gIndex < 0 || bIndex < 0) {
    throw new Error("[decodeExr] expected channels R, G, B");
  }

  // Scanline offset table sits between the header and the scanline
  // data: one int64 per scanline (uncompressed = 1 scanline per
  // block). We don't need the offsets — uncompressed scanlines are
  // contiguous — but we have to step past the table.
  cursor += height * 8;

  const bytesPerSample = 2;
  const channelStride = width * bytesPerSample;
  const channelCount = sortedChannels.length;
  const output = new Uint16Array(width * height * 4);

  for (let scanlineIndex = 0; scanlineIndex < height; scanlineIndex += 1) {
    cursor += 4; // y coordinate (ignored — we trust order)
    cursor += 4; // pixel data size in bytes
    const dataStart = cursor;

    const outputRow = height - 1 - scanlineIndex;
    const outputRowOffset = outputRow * width * 4;
    const rOffset = dataStart + rIndex * channelStride;
    const gOffset = dataStart + gIndex * channelStride;
    const bOffset = dataStart + bIndex * channelStride;
    const aOffset = aIndex >= 0 ? dataStart + aIndex * channelStride : -1;

    for (let pixelX = 0; pixelX < width; pixelX += 1) {
      const outIdx = outputRowOffset + pixelX * 4;
      output[outIdx + 0] = view.getUint16(rOffset + pixelX * 2, true);
      output[outIdx + 1] = view.getUint16(gOffset + pixelX * 2, true);
      output[outIdx + 2] = view.getUint16(bOffset + pixelX * 2, true);
      output[outIdx + 3] =
        aOffset >= 0 ? view.getUint16(aOffset + pixelX * 2, true) : HALF_FLOAT_ONE_BITS;
    }

    cursor = dataStart + channelStride * channelCount;
  }

  return { width, height, rgbaHalfFloats: output };
}

function readNullTerminatedAscii(view: DataView, offset: number): string {
  let end = offset;
  while (end < view.byteLength && view.getUint8(end) !== 0) {
    end += 1;
  }
  let result = "";
  for (let index = offset; index < end; index += 1) {
    result += String.fromCharCode(view.getUint8(index));
  }
  return result;
}
