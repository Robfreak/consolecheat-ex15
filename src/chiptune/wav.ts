// 16-bit PCM RIFF/WAVE encoder. Pure: Float32 samples in, bytes out.

export const WAV_HEADER_BYTES = 44;

export function wavByteLength(frames: number, channels: number): number {
  return WAV_HEADER_BYTES + frames * channels * 2;
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
}

/** Converts -1..1 floats to signed 16-bit integers, clipping outside that range. */
export function floatToInt16(value: number): number {
  const v = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  return v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff);
}

/**
 * Encodes channel data (all channels the same length) as a little-endian
 * 16-bit PCM WAVE file: RIFF header, "fmt " chunk (PCM, 16 bytes), "data" chunk.
 */
export function encodeWav(channels: readonly Float32Array[], sampleRate: number): ArrayBuffer {
  const count = Math.max(1, channels.length);
  const frames = channels[0]?.length ?? 0;
  const dataBytes = frames * count * 2;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * 2, true); // byte rate
  view.setUint16(32, count * 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);
  let offset = WAV_HEADER_BYTES;
  for (let i = 0; i < frames; i += 1) {
    for (let c = 0; c < count; c += 1) {
      view.setInt16(offset, floatToInt16(channels[c]?.[i] ?? 0), true);
      offset += 2;
    }
  }
  return buffer;
}

/** Reads the header back. Used by the tests and as a sanity check before download. */
export function readWavHeader(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  const ascii = (offset: number) =>
    String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const dataBytes = view.getUint32(40, true);
  return {
    riff: ascii(0),
    riffSize: view.getUint32(4, true),
    wave: ascii(8),
    fmt: ascii(12),
    fmtSize: view.getUint32(16, true),
    format: view.getUint16(20, true),
    channels,
    sampleRate,
    byteRate: view.getUint32(28, true),
    blockAlign: view.getUint16(32, true),
    bitsPerSample: view.getUint16(34, true),
    data: ascii(36),
    dataBytes,
    frames: dataBytes / (channels * 2),
    seconds: dataBytes / (channels * 2) / sampleRate,
  };
}
