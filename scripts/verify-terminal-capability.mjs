// ARCHBP-R20 — prove the Glass VT capability envelope is declared and honest.
//
// The Glass renderer is xterm.js, an embedded renderer, not a host terminal
// emulator. This gate proves the PTY never advertises a host terminal's
// identity, that the renderer's declared capabilities match what the pinned
// packages actually implement, and that the Rust constant and the Svelte
// browser-preview fallback have not drifted apart.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const lib = read("src-tauri/src/lib.rs");
const component = read("src/components/EngineRoomTerminal.svelte");
const packageJson = JSON.parse(read("package.json"));

// ---- 1. The Rust capability profile is the source of truth ------------------
const profileBlock = lib.match(/const GLASS_VT_PROFILE[^{]*\{([\s\S]*?)\n\};/);
if (!profileBlock) throw new Error("GLASS_VT_PROFILE is not declared in src-tauri/src/lib.rs");

const field = (name) => {
  const match = profileBlock[1].match(new RegExp(`${name}:\\s*("([^"]*)"|true|false)`));
  if (!match) throw new Error(`GLASS_VT_PROFILE is missing field: ${name}`);
  return match[2] !== undefined ? match[2] : match[1] === "true";
};

const profile = {
  term: field("term"),
  kittyKeyboard: field("kitty_keyboard"),
  kittyGraphics: field("kitty_graphics"),
  kittyUnicodePlaceholders: field("kitty_unicode_placeholders"),
  sixel: field("sixel"),
  iip: field("iip"),
  imageProtocol: field("image_protocol"),
  corePin: field("core_pin"),
  imageAddonPin: field("image_addon_pin"),
};

// ---- 2. TERM never claims a host terminal ----------------------------------
for (const hostTerminal of ["ghostty", "kitty", "wezterm", "mars", "rio", "alacritty"]) {
  if (profile.term.includes(hostTerminal)) {
    throw new Error(`Glass TERM claims host terminal "${hostTerminal}": ${profile.term}`);
  }
}
if (!lib.includes('command.env_remove("TERM_PROGRAM")')) {
  throw new Error("inherited TERM_PROGRAM is not stripped from the Engine Room PTY");
}
if (!lib.includes('command.env_remove("TERM_PROGRAM_VERSION")')) {
  throw new Error("inherited TERM_PROGRAM_VERSION is not stripped from the Engine Room PTY");
}
if (!lib.includes('command.env("YAZI_IMAGE_PROTOCOL"')) {
  throw new Error("the image protocol is not selected explicitly for the Engine Room PTY");
}

// ---- 3. Declared capabilities match what the pinned packages implement ------
const pins = {
  "@xterm/xterm": profile.corePin,
  "@xterm/addon-image": profile.imageAddonPin,
};
for (const [name, expected] of Object.entries(pins)) {
  const actual = packageJson.dependencies?.[name];
  if (actual !== expected) {
    throw new Error(`${name} is pinned at ${actual}, capability profile declares ${expected}`);
  }
}

const coreTypings = read("node_modules/@xterm/xterm/typings/xterm.d.ts");
if (profile.kittyKeyboard && !coreTypings.includes("kittyKeyboard?: boolean")) {
  throw new Error("profile claims kitty keyboard support the pinned core does not expose");
}

const imageTypings = read("node_modules/@xterm/addon-image/typings/addon-image.d.ts");
if (profile.kittyGraphics && !imageTypings.includes("kittySupport?: boolean")) {
  throw new Error("profile claims kitty graphics support the pinned image addon does not expose");
}

// Yazi's `Kgp` uses U+10EEEE Unicode placeholders. The pinned addon implements
// direct placement; LifeOS supplies the renderer-side compatibility adapter.
const imageBundle = read("node_modules/@xterm/addon-image/lib/addon-image.js");
const addonNative = imageBundle.includes("10EEEE") || imageBundle.includes("1114110");

// Behavioural, not textual. An earlier revision of this gate only grepped the
// adapter for identifiers, which passed an adapter that handled one of the three
// sequence shapes Yazi actually emits. Execute it instead: every virtual
// placement must lose `U=1`, and non-placements must pass through byte-identical.
const adapter = await import(
  pathToFileURL(join(root, "src/lib/kitty-unicode-placeholders.js")).href
);
const encode = (value) => new TextEncoder().encode(value);
const decode = (value) => new TextDecoder().decode(value);
const through = (frames) => {
  const stream = new adapter.KittyUnicodePlaceholderStream();
  return frames.map((frame) => decode(stream.feed(encode(frame)))).join("");
};

const mustNormalize = {
  "a=T transmit+display virtual placement": ["_Ga=T,f=100,t=d,i=1,q=2,U=1,c=20,r=10;QUJD\\"],
  "a=p placement with no payload": ["_Ga=p,U=1,i=1,c=20,r=10\\"],
  "a=p placement with payload": ["_Ga=p,U=1,i=1,c=20,r=10;QUJD\\"],
  "placement split across PTY frames": ["_Ga=p,U=1,i=1,c=2", "0,r=10\\"],
};
for (const [label, frames] of Object.entries(mustNormalize)) {
  const result = through(frames);
  if (/U=1/.test(result)) {
    throw new Error(`kitty placeholder adapter leaves ${label} virtual: ${JSON.stringify(result)}`);
  }
  if (result.includes(",C=1;") || result.includes(",C=1\u001b")) continue;
  if (!/(?:^|,)C=1(?=,|$|)/.test(result)) {
    throw new Error(`kitty placeholder adapter did not pin the cursor policy for ${label}`);
  }
}

const mustPassThrough = {
  "plain terminal output": "hello world\r\n",
  "transmit-only (not a placement)": "_Ga=t,f=100,i=1;QUJD\\",
  "already-direct placement": "_Ga=T,i=1,c=20,r=10;QUJD\\",
};
for (const [label, frame] of Object.entries(mustPassThrough)) {
  if (through([frame]) !== frame) {
    throw new Error(`kitty placeholder adapter rewrote ${label}; it must pass through unchanged`);
  }
}

const compatibilityAdapterImplemented =
  typeof adapter.KittyUnicodePlaceholderStream === "function" &&
  typeof adapter.KittyUnicodePlaceholderAddon === "function";
const placeholdersImplemented = addonNative || compatibilityAdapterImplemented;
if (placeholdersImplemented !== profile.kittyUnicodePlaceholders) {
  throw new Error(
    `profile declares kittyUnicodePlaceholders=${profile.kittyUnicodePlaceholders} but the pinned addon/compatibility adapter ${placeholdersImplemented ? "implements" : "does not implement"} them`,
  );
}
if (profile.kittyGraphics && profile.kittyUnicodePlaceholders && profile.imageProtocol !== "Kgp") {
  throw new Error(
    `image protocol must be Kgp with Unicode placeholder support, got ${profile.imageProtocol}`,
  );
}

// ---- 4. The renderer honours the envelope and preserves bytes ---------------
const rendererContract = [
  ["convertEol: false", "the renderer still rewrites line endings on a real PTY surface"],
  ["allowProposedApi: true", "the renderer does not opt into the API the image addon requires"],
  ["terminal.onBinary(", "8-bit onBinary input is dropped instead of forwarded"],
  ["new ImageAddon(", "the image addon is not loaded"],
  ["KittyUnicodePlaceholderStream", "the Kgp renderer compatibility adapter is not loaded"],
  ["KittyUnicodePlaceholderAddon", "the Kgp placeholder-cell adapter is not loaded"],
  ["screenPixels()", "PTY pixel geometry is not reported, so images have no scale reference"],
];
for (const [needle, failure] of rendererContract) {
  if (!component.includes(needle)) throw new Error(failure);
}

// ---- 5. The browser-preview fallback has not drifted from the backend ------
const fallbackBlock = component.match(/const GLASS_VT_FALLBACK = \{([\s\S]*?)\};/);
if (!fallbackBlock) throw new Error("GLASS_VT_FALLBACK is not declared in EngineRoomTerminal.svelte");
for (const key of ["kittyKeyboard", "kittyGraphics", "kittyUnicodePlaceholders", "sixel", "iip"]) {
  const match = fallbackBlock[1].match(new RegExp(`${key}:\\s*(true|false)`));
  if (!match) throw new Error(`GLASS_VT_FALLBACK is missing field: ${key}`);
  if ((match[1] === "true") !== profile[key]) {
    throw new Error(`GLASS_VT_FALLBACK.${key} has drifted from the backend capability profile`);
  }
}

const receipt = {
  schema_version: "lifeos.evidence.terminal-capability.v1",
  authority: "src-tauri/src/lib.rs GLASS_VT_PROFILE, pinned renderer packages, and the Glass renderer source",
  renderer: "xterm.js (embedded); host terminal emulator choice stays open at the native front door",
  capability_envelope: profile,
  pins: { ...pins, "@xterm/addon-fit": packageJson.dependencies?.["@xterm/addon-fit"], "@xterm/addon-webgl": packageJson.dependencies?.["@xterm/addon-webgl"] },
  host_terminal_identity_stripped: ["TERM_PROGRAM", "TERM_PROGRAM_VERSION"],
  resolved_compatibility: {
    kitty_unicode_placeholders: true,
    implementation: "renderer-side Kgp compatibility addon adapts virtual placements before xterm.js parsing; raw PTY capture remains unchanged.",
  },
  byte_fidelity: {
    convert_eol: false,
    on_binary_forwarded: true,
    pty_pixel_geometry_reported: true,
  },
  source_sha256: {
    lib: sha256(lib),
    component: sha256(component),
  },
  ok: true,
};

const receiptPath = join(root, "evidence/glass/terminal-capability-receipt.json");
mkdirSync(join(root, "evidence/glass"), { recursive: true });
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ status: "ok", receipt: receiptPath }, null, 2));
