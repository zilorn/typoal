import { describe, expect, it } from "vitest";
import { matchesOrigin } from "../src/lib/origin";

describe("request origin checks", () => {
  it("supports HTTPS termination while requiring the same host and port", () => {
    expect(
      matchesOrigin(
        new Request("http://blog.example/api/articles", {
          headers: { origin: "https://blog.example" },
        }),
      ),
    ).toBe(true);
    expect(
      matchesOrigin(
        new Request("http://localhost:42731/api/articles", {
          headers: { origin: "http://localhost:42731" },
        }),
      ),
    ).toBe(true);
    expect(
      matchesOrigin(
        new Request("http://localhost:42731/api/articles", {
          headers: { origin: "http://localhost:3000" },
        }),
      ),
    ).toBe(false);
  });
  it("rejects other sites and malformed origins", () => {
    for (const origin of [
      "https://evil.example",
      "null",
      "not a url",
      "https://blog.example/path",
      "ftp://blog.example",
      "https://blog.example.evil.example",
    ]) {
      expect(
        matchesOrigin(
          new Request("http://blog.example/api/articles", {
            headers: { origin },
          }),
        ),
      ).toBe(false);
    }
  });
});
