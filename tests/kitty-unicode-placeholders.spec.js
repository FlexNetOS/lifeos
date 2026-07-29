import { describe, expect, it } from "vitest";
import { KittyUnicodePlaceholderStream } from "../src/lib/kitty-unicode-placeholders.js";

const bytes = (value) => new TextEncoder().encode(value);
const text = (value) => new TextDecoder().decode(value);

describe("Kitty Unicode placeholder stream", () => {
  it("normalizes virtual placements without changing the captured source bytes", () => {
    const stream = new KittyUnicodePlaceholderStream();
    const frame = bytes("\u001b_Ga=p,U=1,i=7,c=2,r=1;\u001b\\\uDBBB\uDEEE\uDBBB\uDEEE");

    expect(text(stream.feed(frame))).toBe(
      "\u001b_Ga=p,U=1,i=7,c=2,r=1,C=1;\u001b\\\uDBBB\uDEEE\uDBBB\uDEEE",
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
      "\u001b_Ga=p,U=1,C=1,i=3;\u001b\\\uDBBB\uDEEE\u001b_Ga=t,i=3;AAAA\u001b\\",
    );
  });

  it("holds split APC sequences until their string terminator arrives", () => {
    const stream = new KittyUnicodePlaceholderStream();

    expect(text(stream.feed(bytes("before\u001b_Ga=p,U=1,i=9;")))).toBe("before");
    expect(text(stream.feed(bytes("payload\u001b\\after")))).toBe(
      "\u001b_Ga=p,U=1,i=9,C=1;payload\u001b\\after",
    );
  });

  it("passes unrelated escape sequences byte-for-byte", () => {
    const stream = new KittyUnicodePlaceholderStream();
    const frame = bytes("\u001b[2J\u001b[Hhello");

    expect(stream.feed(frame)).toEqual(frame);
  });
});
