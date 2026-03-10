import { describe, expect, it } from "vitest";

import { ErrorableError, errorable } from "../src/index.js";
import { debugStack } from "./helpers/debug-stack.js";

function createNestedErrorable(): { inner: ErrorableError; outer: ErrorableError } {
  const inner = errorable().code("db_timeout").new("query failed");
  const outer = errorable().in("repository").wrapf(inner, "load user");

  if (!outer) {
    throw new Error("expected outer error");
  }

  return { inner, outer };
}

function createDeeplyWrappedError(): ErrorableError {
  function leafStorageCall(): ErrorableError {
    return errorable().code("disk_timeout").errorf("disk read failed");
  }

  function repositoryLoadUser(): ErrorableError {
    const error = leafStorageCall();
    const wrapped = errorable().in("repository").wrapf(error, "query user");
    if (!wrapped) {
      throw new Error("expected repository error");
    }
    return wrapped;
  }

  function serviceLoadProfile(): ErrorableError {
    const error = repositoryLoadUser();
    const wrapped = errorable().in("service").wrapf(error, "load profile");
    if (!wrapped) {
      throw new Error("expected service error");
    }
    return wrapped;
  }

  function httpHandleRequest(): ErrorableError {
    const error = serviceLoadProfile();
    const wrapped = errorable().in("http").with("route", "/users/:id").wrapf(error, "handle request");
    if (!wrapped) {
      throw new Error("expected http error");
    }
    return wrapped;
  }

  return httpHandleRequest();
}

describe("errorable stacktrace", () => {
  it("provides a verbose debugging helper for stack inspection", () => {
    const { outer } = createNestedErrorable();
    const lines: string[] = [];
    const rendered = debugStack(outer, {
      label: "stacktrace-test",
      logger: (message) => {
        lines.push(message);
      },
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(rendered);
    expect(rendered).toContain("[stack]");
    expect(rendered).toContain("[stacktrace()]");
    expect(rendered).toContain("[stackFrames()]");
    expect(rendered).toContain("[toJSON().stack]");
    expect(rendered).toContain("stacktrace-test");
    expect(rendered).toContain("Thrown: load user");
  });

  it("captures structured stack frames with file, line, and column", () => {
    const { outer } = createNestedErrorable();
    const frames = outer.stackFrames();
    const allFrames = outer.stackFrames({ frameFilter: "all" });
    const structuredFrame = frames.find((frame) => frame.file !== undefined);
    const callerFrame = frames.find((frame) => frame.file?.includes("errorable.stacktrace.test.ts"));

    expect(frames.length).toBeGreaterThan(0);
    expect(allFrames.length).toBeGreaterThanOrEqual(frames.length);
    expect(structuredFrame).toBeDefined();
    expect(structuredFrame?.line).toBeTypeOf("number");
    expect(structuredFrame?.column).toBeTypeOf("number");
    expect(structuredFrame?.line).toBeGreaterThan(0);
    expect(structuredFrame?.column).toBeGreaterThan(0);
    expect(callerFrame).toBeDefined();
    expect(callerFrame?.file).toContain("errorable.stacktrace.test.ts");
    expect(frames.some((frame) => frame.file?.includes("errorable-builder.ts"))).toBe(false);
    expect(frames.some((frame) => frame.file?.includes("chunk-hooks.js"))).toBe(false);
    expect(allFrames.some((frame) => frame.file?.includes("errorable-builder.ts"))).toBe(true);
    expect(frames.every((frame) => frame.raw.length > 0)).toBe(true);
    expect(frames[0]?.raw.startsWith("at ")).toBe(true);
  });

  it("returns a defensive copy of stack frames", () => {
    const { outer } = createNestedErrorable();
    const initial = outer.stackFrames();
    const mutated = outer.stackFrames();

    mutated.pop();

    expect(initial.length).toBeGreaterThan(0);
    expect(outer.stackFrames()).toHaveLength(initial.length);
  });

  it("serializes the same parsed stack frames into json output", () => {
    const { outer } = createNestedErrorable();
    const frames = outer.stackFrames();
    const payload = outer.toJSON();
    const unfilteredPayload = outer.toJSON({ frameFilter: "all" });

    expect(payload.stack).toEqual(frames);
    expect(payload.cause).toHaveProperty("message", "query failed");
    expect("stack" in payload.cause).toBe(true);
    expect(unfilteredPayload.stack.some((frame) => frame.file?.includes("errorable-builder.ts"))).toBe(true);
  });

  it("renders stacktrace blocks for each wrapped error in chain order", () => {
    const { inner, outer } = createNestedErrorable();
    const rendered = outer.stacktrace();
    const renderedAll = outer.stacktrace({ frameFilter: "all" });

    expect(rendered).toContain("Thrown: query failed");
    expect(rendered).toContain("Thrown: load user");
    expect(rendered.indexOf("Thrown: query failed")).toBeLessThan(rendered.indexOf("Thrown: load user"));
    expect(rendered).toContain("createNestedErrorable");
    expect(rendered).not.toContain("ErrorableBuilder.create");
    expect(rendered).not.toContain("chunk-hooks.js");
    expect(renderedAll).toContain("ErrorableBuilder.create");
    expect(rendered).toContain(inner.stackFrames()[0]?.raw ?? "");
    expect(rendered).toContain(outer.stackFrames()[0]?.raw ?? "");
  });

  it("keeps stacktrace rendering stable for direct errors without summaries", () => {
    const error = errorable().new("plain failure");
    const rendered = error.stacktrace();

    expect(rendered).toContain("Thrown: plain failure");
    expect(rendered.split("\n")[0]).toBe("Thrown: plain failure");
    expect(rendered).toContain("errorable.stacktrace.test.ts");
    expect(rendered).not.toContain("errorable-builder.ts");
    expect(rendered).toContain(error.stackFrames()[0]?.raw ?? "");
  });

  it("renders readable stacktraces for deeply nested wrap chains", () => {
    const error = createDeeplyWrappedError();
    const rendered = error.stacktrace();
    const lines: string[] = [];
    const debugOutput = debugStack(error, {
      label: "deep-wrap-chain",
      logger: (message) => {
        lines.push(message);
        if (process.env.DEBUG_ERRORABLE_STACK === "1") {
          console.log(message);
        }
      },
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(debugOutput);
    expect(rendered.match(/^Thrown:/gm)).toHaveLength(4);
    expect(rendered).toContain("Thrown: disk read failed");
    expect(rendered).toContain("Thrown: query user");
    expect(rendered).toContain("Thrown: load profile");
    expect(rendered).toContain("Thrown: handle request");
    expect(rendered.indexOf("Thrown: disk read failed")).toBeLessThan(rendered.indexOf("Thrown: query user"));
    expect(rendered.indexOf("Thrown: query user")).toBeLessThan(rendered.indexOf("Thrown: load profile"));
    expect(rendered.indexOf("Thrown: load profile")).toBeLessThan(rendered.indexOf("Thrown: handle request"));
    expect(rendered).toContain("leafStorageCall");
    expect(rendered).toContain("repositoryLoadUser");
    expect(rendered).toContain("serviceLoadProfile");
    expect(rendered).toContain("httpHandleRequest");
    expect(rendered).not.toContain("ErrorableBuilder.create");
    expect(rendered).not.toContain("chunk-hooks.js");
    expect(debugOutput).toContain("deep-wrap-chain");
    expect(debugOutput).toContain("Thrown: handle request");
    expect(debugOutput).not.toContain("ErrorableBuilder.create");
    expect(debugOutput).not.toContain("chunk-hooks.js");
  });
});
