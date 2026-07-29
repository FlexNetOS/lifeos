const ESC = 0x1b;
const APC = 0x5f;
const KITTY_GRAPHICS = 0x47;
const ST = 0x5c;

// Slightly above the pinned image addon's 20 MB `kittySizeLimit`, so the guard
// only ever releases bytes the addon would have rejected anyway.
const MAX_PENDING_BYTES = 24 * 1024 * 1024;

const concatBytes = (left, right) => {
  const result = new Uint8Array(left.length + right.length);
  result.set(left);
  result.set(right, left.length);
  return result;
};

// Kitty creates a virtual placement with `a=p` (place an already-transmitted
// image) or `a=T` (transmit and display). Yazi emits both, and a placement that
// references an existing image carries no payload — so the control section ends
// at the ST terminator rather than at a `;`.
const VIRTUAL_PLACEMENT_ACTION = /(?:^|,)a=[Tp](?=,|$)/;
const VIRTUAL_PLACEMENT_FLAG = /(?:^|,)U=1(?=,|$)/;

const normalizeVirtualPlacement = (sequence) => {
  const terminator = sequence.length - 2;
  const semicolon = sequence.indexOf(0x3b, 3);
  const controlEnd = semicolon < 0 || semicolon > terminator ? terminator : semicolon;
  if (controlEnd <= 3) return sequence;

  const control = String.fromCharCode(...sequence.subarray(3, controlEnd));
  if (!VIRTUAL_PLACEMENT_ACTION.test(control) || !VIRTUAL_PLACEMENT_FLAG.test(control)) {
    return sequence;
  }

  // The pinned addon understands direct placement but not Kgp's U=1 virtual
  // placement flag. Remove only that display-layer flag; the original PTY
  // frame remains captured unchanged by the Tauri channel and CodeDB path.
  const directControl = control
    .replace(/(?:^|,)U=1(?=,|$)/, "")
    .replace(/^,|,$/g, "");
  const normalizedControl = /(?:^|,)C=\d+(?:,|$)/.test(directControl)
    ? directControl.replace(/(?:^|,)C=\d+(?=,|$)/, (value) => value.replace(/\d+$/, "1"))
    : `${directControl},C=1`;
  const prefix = sequence.subarray(0, 3);
  // `controlEnd` is the `;` when a payload follows, otherwise the ST terminator,
  // so this keeps payload-less placements intact.
  const payload = sequence.subarray(controlEnd);
  const normalized = new TextEncoder().encode(normalizedControl);
  return concatBytes(concatBytes(prefix, normalized), payload);
};

/**
 * Keeps the PTY byte capture untouched while adapting Kitty's virtual image
 * placements for the pinned xterm image addon. The addon already implements
 * direct placement; C=1 makes the virtual placement leave the cursor where
 * the following U+10EEEE cells expect it to be.
 */
export class KittyUnicodePlaceholderStream {
  #pending = new Uint8Array();

  feed(frame) {
    const input = frame instanceof Uint8Array ? frame : new Uint8Array(frame);
    const data = concatBytes(this.#pending, input);
    const output = [];
    let cursor = 0;

    while (cursor < data.length) {
      if (data[cursor] !== ESC) {
        output.push(data[cursor++]);
        continue;
      }
      if (cursor + 1 >= data.length) break;
      if (data[cursor + 1] !== APC) {
        output.push(data[cursor++]);
        continue;
      }
      if (cursor + 2 >= data.length) break;
      if (data[cursor + 2] !== KITTY_GRAPHICS) {
        output.push(data[cursor++]);
        continue;
      }

      let end = -1;
      for (let index = cursor + 3; index + 1 < data.length; index += 1) {
        if (data[index] === ESC && data[index + 1] === ST) {
          end = index;
          break;
        }
      }
      if (end < 0) break;

      output.push(normalizeVirtualPlacement(data.slice(cursor, end + 2)));
      cursor = end + 2;
    }

    this.#pending = data.slice(cursor);
    // A malformed or oversized APC that never terminates must not stall the
    // terminal. Past the addon's own kitty size limit the bytes cannot be a
    // placement it would accept, so release them unmodified.
    if (this.#pending.length > MAX_PENDING_BYTES) {
      output.push(this.#pending);
      this.#pending = new Uint8Array();
    }
    const length = output.reduce(
      (total, part) => total + (typeof part === "number" ? 1 : part.length),
      0,
    );
    const result = new Uint8Array(length);
    let offset = 0;
    for (const part of output) {
      result.set(typeof part === "number" ? [part] : part, offset);
      offset += typeof part === "number" ? 1 : part.length;
    }
    return result;
  }

  flush() {
    const pending = this.#pending;
    this.#pending = new Uint8Array();
    return pending;
  }
}

/**
 * The U+10EEEE glyph is protocol metadata, not user-visible terminal text.
 * xterm's ImageAddon paints the direct placement above the buffer; this addon
 * clears only the placeholder cells after parsing while retaining their cell
 * attributes and the raw PTY capture.
 */
export class KittyUnicodePlaceholderAddon {
  #terminal;
  #disposables = [];

  activate(terminal) {
    this.#terminal = terminal;
    const scan = () => this.#clearPlaceholderCells();
    this.#disposables.push(terminal.onWriteParsed(scan));
    this.#disposables.push(terminal.onScroll(scan));
    this.#disposables.push(terminal.onResize(scan));
    return undefined;
  }

  dispose() {
    for (const disposable of this.#disposables) disposable.dispose();
    this.#disposables = [];
    this.#terminal = undefined;
  }

  #clearPlaceholderCells() {
    const terminal = this.#terminal;
    const buffer = terminal?._core?._bufferService?.buffer;
    if (!terminal || !buffer?.lines?.get) return;

    const first = Math.max(0, Math.trunc(Number(buffer.ydisp) - 1));
    const last = Math.min(
      Math.trunc(Number(buffer.length) - 1),
      Math.trunc(Number(buffer.ydisp) + Number(terminal.rows)),
    );
    if (!Number.isInteger(first) || !Number.isInteger(last) || last < first) return;
    for (let y = first; y <= last; y += 1) {
      const line = buffer.lines.get(y);
      if (!line?.getCell || !line?.setCellFromCodepoint) continue;
      for (let x = 0; x < terminal.cols; x += 1) {
        const cell = line.getCell(x);
        if (cell?.getCode?.() !== 0x10eeee) continue;
        line.setCellFromCodepoint(x, 0x20, cell.getWidth?.() || 1, cell);
      }
    }
    terminal.refresh(first, last);
  }
}
