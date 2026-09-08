import { describe, expect, it } from "vitest";
import { readerCode } from "../src/lib/reader-code";
describe("reader code", () => {
  it("preserves leading zeros and removes a reader Enter suffix", () => {
    expect(readerCode("0012345678901\r\n")).toBe("0012345678901");
  });
  it("supports an alphanumeric SKU", () => {
    expect(readerCode("ABC-012")).toBe("ABC-012");
  });
  it.each(["", "  ", "A".repeat(81), "abc\u0000def", "abc\ndef"])(
    "rejects invalid reader input",
    (value) => {
      expect(readerCode(value)).toBeNull();
    },
  );
});
