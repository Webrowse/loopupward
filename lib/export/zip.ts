/**
 * A zip file, written by hand, stored (uncompressed).
 *
 * Why by hand: the export bundle has to be byte-identical whether it is built
 * from the cloud or from a signed-out browser's own storage, so it is built in
 * one place — here, on the client. Pulling in a compression library to reach
 * that would be a dependency for the sake of a few hundred kilobytes of text
 * that the operating system's archiver decompresses in milliseconds either
 * way. Stored entries are a legal zip; every unzipper reads them.
 *
 * Format: PKWARE APPNOTE 6.3.2, sections 4.3.7 (local header), 4.3.12
 * (central directory) and 4.3.16 (end of central directory). No zip64, no
 * data descriptors, no encryption — sizes are known before writing, and a
 * personal export is far below the 4 GB / 65535-entry ceilings.
 */

export interface ZipEntry {
  name: string;
  content: string;
}

/* ————— CRC-32, the one thing a zip cannot be written without ————— */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ————— DOS date/time, which is what the format still speaks ————— */

function dosDateTime(d: Date): { time: number; date: number } {
  return {
    // seconds have 2-second resolution in this format; that is the format's
    // problem, not ours, and no reader cares
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

class ByteWriter {
  private parts: Uint8Array[] = [];
  length = 0;

  push(bytes: Uint8Array) {
    this.parts.push(bytes);
    this.length += bytes.length;
  }

  u16(n: number) {
    this.push(new Uint8Array([n & 0xff, (n >>> 8) & 0xff]));
  }

  u32(n: number) {
    this.push(new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]));
  }

  concat(): Uint8Array {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const part of this.parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }
}

/**
 * Build the archive. `at` is the modification time stamped on every entry —
 * passed in rather than read here so a test can produce a stable file.
 */
export function makeZip(entries: ZipEntry[], at = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(at);
  const body = new ByteWriter();
  const central = new ByteWriter();

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = encoder.encode(entry.content);
    const crc = crc32(data);
    const offset = body.length;

    // local file header (4.3.7)
    body.u32(0x04034b50);
    body.u16(20); // version needed: 2.0
    body.u16(0x0800); // bit 11: names and comments are UTF-8
    body.u16(0); // method 0 = stored
    body.u16(time);
    body.u16(date);
    body.u32(crc);
    body.u32(data.length); // compressed == uncompressed, stored
    body.u32(data.length);
    body.u16(nameBytes.length);
    body.u16(0); // no extra field
    body.push(nameBytes);
    body.push(data);

    // central directory entry (4.3.12)
    central.u32(0x02014b50);
    central.u16(20); // version made by
    central.u16(20); // version needed
    central.u16(0x0800);
    central.u16(0);
    central.u16(time);
    central.u16(date);
    central.u32(crc);
    central.u32(data.length);
    central.u32(data.length);
    central.u16(nameBytes.length);
    central.u16(0); // extra
    central.u16(0); // comment
    central.u16(0); // disk number
    central.u16(0); // internal attributes
    central.u32(0); // external attributes
    central.u32(offset);
    central.push(nameBytes);
  }

  const out = new ByteWriter();
  out.push(body.concat());
  const centralBytes = central.concat();
  out.push(centralBytes);

  // end of central directory (4.3.16)
  out.u32(0x06054b50);
  out.u16(0); // this disk
  out.u16(0); // disk with the central directory
  out.u16(entries.length);
  out.u16(entries.length);
  out.u32(centralBytes.length);
  out.u32(body.length);
  out.u16(0); // no archive comment

  return out.concat();
}
