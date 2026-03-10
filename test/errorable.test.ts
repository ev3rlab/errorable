import { describe, expect, it } from "vitest";

import { ErrorableError, assertf, errorf, getPublic, join, matches, errorable, recover, wrapf } from "../src/index.js";
import { debugErrorableJson } from "./helpers/debug-stack.js";

describe("errorable", () => {
  it("builds immutable structured errors", () => {
    const builder = errorable().in("billing").tags("db").with("requestId", "req-1");
    const error = builder.code("payment_failed").public("결제를 처리할 수 없습니다.").errorf("payment failed for %s", "user-1");

    expect(error).toBeInstanceOf(ErrorableError);
    expect(error.message).toBe("payment failed for user-1");
    expect(error.domain()).toBe("billing");
    expect(error.code()).toBe("payment_failed");
    expect(error.tags()).toEqual(["db"]);
    expect(error.context()).toEqual({ requestId: "req-1" });
    expect(getPublic(error, "fallback")).toBe("결제를 처리할 수 없습니다.");
  });

  it("supports integer error codes", () => {
    const error = errorable().code(503).errorf("service unavailable");

    expect(error.code()).toBe(503);
    expect(error.toJSON().code).toBe(503);
  });

  it("rejects non-integer numeric error codes", () => {
    expect(() => errorable().code(12.5)).toThrowError("Errorable code numbers must be integers.");
  });

  it("supports trace, span, timing, and ownership metadata", () => {
    const startedAt = new Date("2026-03-10T00:00:00.000Z");
    const error = errorable()
      .time(startedAt)
      .duration(250)
      .trace("trace-123")
      .span("span-abc")
      .hint("check upstream latency")
      .owner("platform-team")
      .public("일시적인 오류가 발생했습니다.")
      .errorf("gateway timeout");

    expect(error.time().toISOString()).toBe("2026-03-10T00:00:00.000Z");
    expect(error.duration()).toBe(250);
    expect(error.trace()).toBe("trace-123");
    expect(error.span()).toBe("span-abc");
    expect(error.hint()).toBe("check upstream latency");
    expect(error.owner()).toBe("platform-team");
    expect(error.public()).toBe("일시적인 오류가 발생했습니다.");
  });

  it("merges user, tenant, and context metadata across wrapped chains", () => {
    const inner = errorable()
      .trace("trace-inner")
      .span("span-inner")
      .user("user-1", { role: "admin" })
      .tenant("tenant-1", { plan: "pro" })
      .with("query", "SELECT 1")
      .new("inner failure");
    const outer = errorable()
      .span("span-outer")
      .user("user-1", { locale: "ko-KR" })
      .tenant("tenant-1", { region: "ap-northeast-2" })
      .with("requestId", "req-1")
      .wrapf(inner, "outer failure");

    expect(outer?.trace()).toBe("trace-inner");
    expect(outer?.span()).toBe("span-outer");
    expect(outer?.user()).toEqual({
      id: "user-1",
      data: {
        role: "admin",
        locale: "ko-KR",
      },
    });
    expect(outer?.tenant()).toEqual({
      id: "tenant-1",
      data: {
        plan: "pro",
        region: "ap-northeast-2",
      },
    });
    expect(outer?.context()).toEqual({
      query: "SELECT 1",
      requestId: "req-1",
    });
  });

  it("copies selected values from context objects", () => {
    const context = {
      requestId: "req-1",
      userId: "user-1",
      attempt: 2,
    };

    const selected = errorable().withContext(context, "requestId", "attempt").errorf("selected");
    const allValues = errorable().withContext(context).errorf("all");

    expect(selected.context()).toEqual({
      requestId: "req-1",
      attempt: 2,
    });
    expect(allValues.context()).toEqual(context);
  });

  it("merges metadata across wrapped chains", () => {
    const inner = errorable().code("db_timeout").with("query", "SELECT 1").new("query failed");
    const outer = errorable().in("repository").tags("critical").with("requestId", "req-1").wrapf(inner, "load user");

    expect(outer?.message).toBe("load user: query failed");
    expect(outer?.code()).toBe("db_timeout");
    expect(outer?.code({ codeSource: "deepest" })).toBe("db_timeout");
    expect(outer?.domain()).toBe("repository");
    expect(outer?.context()).toEqual({ query: "SELECT 1", requestId: "req-1" });
    expect(outer?.tags()).toEqual(["critical"]);
    expect(matches(outer, inner)).toBe(true);
  });

  it("returns the first code found in the chain by default and can resolve the deepest code on demand", () => {
    const inner = errorable().code("db_timeout").new("query failed");
    const outer = errorable().code("repository_load_failed").wrapf(inner, "load user");

    expect(outer?.code()).toBe("repository_load_failed");
    expect(outer?.code({ codeSource: "deepest" })).toBe("db_timeout");
    expect(outer?.toJSON().code).toBe("repository_load_failed");
    expect(outer?.toJSON({ codeSource: "deepest" }).code).toBe("db_timeout");
  });

  it("returns fallback public messages for non-errorable errors", () => {
    expect(getPublic(new Error("plain"), "fallback")).toBe("fallback");
  });

  it("recovers thrown values and join preserves sentinels", () => {
    const sentinel = errorf("sentinel");
    const recovered = recover(() => {
      throw sentinel;
    });
    const combined = join(recovered, new Error("secondary"));

    expect(recovered?.message).toBe("sentinel");
    expect(combined).toBeInstanceOf(ErrorableError);
    expect(matches(combined, sentinel)).toBe(true);
  });

  it("supports recoverf and empty join inputs", () => {
    const primitive = errorable().recoverf(() => {
      throw "primitive failure";
    }, "outer context");

    expect(primitive?.message).toBe("outer context: primitive failure");
    expect(primitive?.unwrap().message).toBe("primitive failure");
    expect(errorable().join(undefined, null)).toBeUndefined();
    expect(join(undefined, null)).toBeUndefined();
  });

  it("supports assertions and structured serialization", () => {
    let thrown: unknown;

    try {
      assertf(false, "expected %d items", 2);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ErrorableError);
    expect((thrown as ErrorableError).message).toBe("expected 2 items");
    expect((thrown as ErrorableError).toJSON().stack.length).toBeGreaterThan(0);
  });

  it("provides verbose json logging for structured errors", () => {
    const error = errorable()
      .in("billing")
      .code("payment_failed")
      .public("결제를 처리할 수 없습니다.")
      .with("requestId", "req-1")
      .errorf("payment failed for %s", "user-1");

    const lines: string[] = [];
    const rendered = debugErrorableJson(error, {
      label: "errorable-json",
      logger: (message) => {
        lines.push(message);
        if (process.env.DEBUG_ERRORABLE_JSON === "1") {
          console.log(message);
        }
      },
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(rendered);
    expect(rendered).toContain("[errorable-json]");
    expect(rendered).toContain('"name": "ErrorableError"');
    expect(rendered).toContain('"message": "payment failed for user-1"');
    expect(rendered).toContain('"code": "payment_failed"');
    expect(rendered).toContain('"domain": "billing"');
    expect(rendered).toContain('"publicMessage": "결제를 처리할 수 없습니다."');
    expect(rendered).toContain('"requestId": "req-1"');
  });

  it("returns undefined when wrapping nil-like values", () => {
    expect(errorable().wrap(undefined)).toBeUndefined();
    expect(wrapf(undefined, "ignored")).toBeUndefined();
  });
});
