import { describe, expect, it } from "vitest";
import { KittyUnicodePlaceholderStream } from "../src/lib/kitty-unicode-placeholders.js";

const bytes = (value) => new TextEncoder().encode(value);
const text = (value) => new TextDecoder().decode(value);

describe("Kitty Unicode placeholder stream", () => {
  it("normalizes virtual placements without changing the captured source bytes", () => {
    const stream = new KittyUnicodePlaceholderStream();
    const frame = bytes("\u001b_Ga=p,U=1,i=7,c=2,r=1;\u001b\\\uDBBB\uDEEE\uDBBB\uDEEE");

    expect(text(stream.feed(frame))).toBe(
      "\u001b_Ga=p,i=7,c=2,r=1,C=1;\u001b\\\uDBBB\uDEEE\uDBBB\uDEEE",
    );
    expect(text(stream.flush())).toBe("");
    expect(text(frame)).toContain("a=p,U=1");
  });

  it("replaces an existing cursor flag and preserves non-virtual Kitty commands", () => {
    const stream = new KittyUnicodePlaceholderStream();
    const frame = bytes(
      "\u001b_Ga=p,U=1,C=0,i=3;\u001b\\\uDBBB\uDEEE\u001b_Ga=t,i=3;AAAA\u001b\\",
    );

    expect(text(stream.feed(frame))).toBe(
      "\u001b_Ga=p,C=1,i=3;\u001b\\\uDBBB\uDEEE\u001b_Ga=t,i=3;AAAA\u001b\\",
    );
  });

  it("holds split APC sequences until their string terminator arrives", () => {
    const stream = new KittyUnicodePlaceholderStream();

    expect(text(stream.feed(bytes("before\u001b_Ga=p,U=1,i=9;")))).toBe("before");
    expect(text(stream.feed(bytes("payload\u001b\\after")))).toBe(
      "\u001b_Ga=p,i=9,C=1;payload\u001b\\after",
    );
  });

  it("passes unrelated escape sequences byte-for-byte", () => {
    const stream = new KittyUnicodePlaceholderStream();
    const frame = bytes("\u001b[2J\u001b[Hhello");

    expect(stream.feed(frame)).toEqual(frame);
  });

  // Yazi's Kgp adapter emits transmit-and-display (`a=T`) far more often than a
  // standalone `a=p`, and a placement referencing an already-transmitted image
  // carries no payload at all. Both shapes were unhandled by an earlier revision
  // while every case above still passed, so they are pinned explicitly here.
  const APC = "_G";
  const ST = "\\";

  it("normalizes a transmit-and-display virtual placement", () => {
    const stream = new KittyUnicodePlaceholderStream();
    const frame = bytes(`${APC}a=T,f=100,t=d,i=1,q=2,U=1,c=20,r=10;QUJD${ST}`);

    const result = text(stream.feed(frame));
    expect(result).not.toContain("U=1");
    expect(result).toBe(`${APC}a=T,f=100,t=d,i=1,q=2,c=20,r=10,C=1;QUJD${ST}`);
  });

  it("normalizes a payload-less placement whose control ends at the terminator", () => {
    const stream = new KittyUnicodePlaceholderStream();
    const frame = bytes(`${APC}a=p,U=1,i=1,c=20,r=10${ST}`);

    expect(text(stream.feed(frame))).toBe(`${APC}a=p,i=1,c=20,r=10,C=1${ST}`);
  });

  it("leaves transmit-only and already-direct commands untouched", () => {
    const transmitOnly = bytes(`${APC}a=t,f=100,i=1;QUJD${ST}`);
    const alreadyDirect = bytes(`${APC}a=T,i=1,c=20,r=10;QUJD${ST}`);

    expect(new KittyUnicodePlaceholderStream().feed(transmitOnly)).toEqual(transmitOnly);
    expect(new KittyUnicodePlaceholderStream().feed(alreadyDirect)).toEqual(alreadyDirect);
  });

  it("releases an unterminated APC rather than buffering the terminal to a halt", () => {
    const stream = new KittyUnicodePlaceholderStream();
    // No string terminator ever arrives; the size guard must emit instead of stalling.
    const oversized = bytes(`${APC}a=T,U=1,i=1;${"A".repeat(25 * 1024 * 1024)}`);

    expect(stream.feed(oversized).length).toBeGreaterThan(0);
  });
});
