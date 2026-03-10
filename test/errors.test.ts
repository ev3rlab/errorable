import { describe, expect, it } from "vitest";

import { JoinedError, as, is, join, kErrorAs, kErrorIs, newError, toError, unwrap } from "../src/errors.js";

class DatabaseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DatabaseError";
  }
}

class AliasError extends Error {
  constructor(message: string, readonly alias: string) {
    super(message);
    this.name = "AliasError";
  }
}

describe("errors", () => {
  it("creates a basic error", () => {
    const error = newError("boom");

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("boom");
  });

  it("unwraps causes and joined errors", () => {
    const root = new DatabaseError("db offline");
    const wrapped = new Error("request failed", { cause: root });
    const joined = join(wrapped, new Error("cache offline"));

    expect(unwrap(wrapped)).toBe(root);
    expect(joined).toBeInstanceOf(JoinedError);
    expect(unwrap(joined)).toHaveLength(2);
  });

  it("converts strings and arbitrary values into errors", () => {
    const stringError = toError("boom");
    const objectError = toError({ code: 500, reason: "offline" });

    expect(stringError.message).toBe("boom");
    expect(objectError.message).toContain("offline");
    expect(objectError.message).toContain("500");
  });

  it("handles empty and single joins", () => {
    const single = new Error("only one");

    expect(join()).toBeUndefined();
    expect(join(undefined, null)).toBeUndefined();
    expect(join(single)).toBe(single);
  });

  it("unwraps custom unwrap hooks and aggregate errors", () => {
    const root = new DatabaseError("db offline");
    const custom = new Error("custom unwrap") as Error & { unwrap: () => Error };
    custom.unwrap = () => root;
    const aggregate = new AggregateError([root, new Error("cache offline")], "many things failed");

    expect(unwrap(custom)).toBe(root);
    expect(unwrap(aggregate)).toHaveLength(2);
  });

  it("matches sentinels across wrapped and joined errors", () => {
    const sentinel = new DatabaseError("db offline");
    const wrapped = new Error("request failed", { cause: sentinel });
    const joined = join(new Error("cache offline"), wrapped);

    expect(is(wrapped, sentinel)).toBe(true);
    expect(is(joined, sentinel)).toBe(true);
    expect(is(joined, new Error("db offline"))).toBe(false);
  });

  it("supports custom is hooks", () => {
    const sentinel = new AliasError("alias sentinel", "db_timeout");
    const error = new Error("wrapped alias") as Error & { [kErrorIs]: (target: unknown) => boolean };
    error[kErrorIs] = (target) => target instanceof AliasError && target.alias === "db_timeout";

    expect(is(error, sentinel)).toBe(true);
  });

  it("extracts typed errors", () => {
    const expected = new DatabaseError("db offline");
    const joined = join(new Error("cache offline"), new Error("request failed", { cause: expected }));

    const matched = as(joined, DatabaseError);

    expect(matched).toBe(expected);
  });

  it("supports type guards and custom as hooks", () => {
    const custom = new Error("alias unavailable") as Error & {
      [kErrorAs]: <T extends Error>(matcher: (value: unknown) => value is T) => T | undefined;
    };

    custom[kErrorAs] = (matcher) => {
      const alias = new AliasError("alias unavailable", "service_down");
      return matcher(alias) ? alias : undefined;
    };

    const extractedByHook = as(custom, (value): value is AliasError => value instanceof AliasError);
    const extractedByGuard = as(new Error("wrapped", { cause: new AliasError("db offline", "db_timeout") }), (value): value is AliasError =>
      value instanceof AliasError && value.alias === "db_timeout",
    );

    expect(extractedByHook?.alias).toBe("service_down");
    expect(extractedByGuard?.alias).toBe("db_timeout");
  });
});
