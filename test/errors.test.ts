import { describe, expect, it } from "vitest";
import { CardanoBech32Error, isCardanoBech32Error, tryDecodeBech32 } from "../src/index.js";
import { attempt, show } from "../src/errors.js";

describe("errors", () => {
  it("CardanoBech32Error carries name, code and message", () => {
    const err = new CardanoBech32Error("InvalidHex", "bad hex");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("CardanoBech32Error");
    expect(err.code).toBe("InvalidHex");
    expect(err.message).toBe("bad hex");
  });

  it("isCardanoBech32Error narrows only library errors", () => {
    expect(isCardanoBech32Error(new CardanoBech32Error("InvalidHex", "x"))).toBe(true);
    expect(isCardanoBech32Error(new Error("x"))).toBe(false);
    expect(isCardanoBech32Error({ code: "InvalidHex" })).toBe(false);
    expect(isCardanoBech32Error(null)).toBe(false);
  });

  it("try* variants return library errors as results", () => {
    const r = tryDecodeBech32("abc");
    expect(r.ok).toBe(false);
    expect(!r.ok && isCardanoBech32Error(r.error)).toBe(true);
  });

  it("attempt rethrows anything that is not a library error", () => {
    const bug = new TypeError("bug");
    expect(() =>
      attempt(() => {
        throw bug;
      }),
    ).toThrow(bug);
    expect(attempt(() => 1)).toEqual({ ok: true, value: 1 });
  });

  it("show describes untrusted values without throwing", () => {
    expect(show("abc")).toBe('"abc"');
    expect(show("x".repeat(50))).toBe(JSON.stringify(`${"x".repeat(40)}…`));
    expect(show(42)).toBe("42");
    expect(show(null)).toBe("null");
    expect(show(undefined)).toBe("undefined");
    expect(show(Symbol("s"))).toBe("Symbol(s)");
    expect(show(Object.create(null))).toBe("[object Object]");
    expect(show([1, 2])).toBe("[object Array]");
    expect(show(new Date(Number.NaN))).toBe("Invalid Date");
    expect(show(new Date(0))).toBe("1970-01-01T00:00:00.000Z");
  });
});
