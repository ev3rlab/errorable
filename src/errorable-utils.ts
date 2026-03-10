import type { ErrorMatcher } from "./errors.js";
import type { BuilderContextInput, ErrorableStackOptions, ErrorableState, LazyRecord, StackFrame } from "./errorable-types.js";

export function createErrorableState(): ErrorableState {
  return {
    code: undefined,
    time: new Date(),
    durationMs: undefined,
    domain: undefined,
    tags: [],
    context: {},
    trace: undefined,
    span: undefined,
    hint: undefined,
    publicMessage: undefined,
    owner: undefined,
    user: undefined,
    tenant: undefined,
  };
}

export function cloneErrorableState(state: ErrorableState): ErrorableState {
  return {
    code: state.code,
    time: new Date(state.time),
    durationMs: state.durationMs,
    domain: state.domain,
    tags: [...state.tags],
    context: { ...state.context },
    trace: state.trace,
    span: state.span,
    hint: state.hint,
    publicMessage: state.publicMessage,
    owner: state.owner,
    user: state.user
      ? {
          id: state.user.id,
          data: { ...state.user.data },
        }
      : undefined,
    tenant: state.tenant
      ? {
          id: state.tenant.id,
          data: { ...state.tenant.data },
        }
      : undefined,
  };
}

export function normalizeRecord(initial?: BuilderContextInput, ...rest: Array<unknown>): LazyRecord {
  const result: LazyRecord = {};

  if (Array.isArray(initial)) {
    applyKeyValues(result, initial);
    applyKeyValues(result, rest);
    return result;
  }

  if (initial && typeof initial === "object") {
    Object.assign(result, initial);
    applyKeyValues(result, rest);
    return result;
  }

  applyKeyValues(result, initial === undefined ? rest : [initial, ...rest]);
  return result;
}

export function visitMatchingErrors<T extends Error>(
  error: Error,
  predicate: (value: Error) => value is T,
  visitor: (value: T) => void,
): void {
  visitErrors(error, (current) => {
    if (predicate(current)) {
      visitor(current);
    }
  });
}

export function firstMatchingValue<TValue, TError extends Error>(
  error: Error,
  predicate: (value: Error) => value is TError,
  select: (value: TError) => TValue | undefined,
): TValue | undefined {
  let result: TValue | undefined;

  visitErrors(
    error,
    (current) => {
      if (result !== undefined || !predicate(current)) {
        return;
      }

      const value = select(current);
      if (value !== undefined && value !== "") {
        result = value;
      }
    },
    new Set<Error>(),
    "pre",
  );

  return result;
}

export function deepestMatchingValue<TValue, TError extends Error>(
  error: Error,
  predicate: (value: Error) => value is TError,
  select: (value: TError) => TValue | undefined,
): TValue | undefined {
  let result: TValue | undefined;

  visitMatchingErrors(error, predicate, (current) => {
    if (result !== undefined) {
      return;
    }

    const value = select(current);
    if (value !== undefined && value !== "") {
      result = value;
    }
  });

  return result;
}

export function mergeLazyRecords<TError extends Error>(
  error: Error,
  predicate: (value: Error) => value is TError,
  select: (value: TError) => LazyRecord,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};

  visitMatchingErrors(error, predicate, (current) => {
    const record = select(current);
    for (const [key, value] of Object.entries(record)) {
      merged[key] = typeof value === "function" ? (value as () => unknown)() : value;
    }
  });

  return merged;
}

export function parseStack(stack: string | undefined): StackFrame[] {
  if (!stack) {
    return [];
  }

  return stack
    .split("\n")
    .slice(1)
    .map((line) => parseStackLine(line))
    .filter((frame): frame is StackFrame => frame !== undefined);
}

export function getStackFrames(frames: StackFrame[], options: ErrorableStackOptions = {}): StackFrame[] {
  if (options.frameFilter === "all") {
    return [...frames];
  }

  const filtered = frames.filter((frame) => shouldIncludeStackFrame(frame));
  return filtered.length > 0 ? filtered : [...frames];
}

export function formatFrames(frames: StackFrame[]): string {
  return frames.map((frame) => frame.raw).join("\n");
}

export function isErrorMatch<T extends Error>(value: unknown, matcher: ErrorMatcher<T>): value is T {
  if (isConstructor(matcher)) {
    return value instanceof matcher;
  }

  return matcher(value);
}

function applyKeyValues(target: LazyRecord, values: Array<unknown>): void {
  for (let index = 0; index + 1 < values.length; index += 2) {
    const key = values[index];
    if (typeof key === "string") {
      target[key] = values[index + 1];
    }
  }
}

function visitErrors(
  error: Error,
  visitor: (error: Error) => void,
  visited = new Set<Error>(),
  order: "pre" | "post" = "post",
): void {
  if (visited.has(error)) {
    return;
  }

  visited.add(error);
  if (order === "pre") {
    visitor(error);
  }
  const next = unwrapNestedErrors(error);

  for (const child of next) {
    visitErrors(child, visitor, visited, order);
  }

  if (order === "post") {
    visitor(error);
  }
}

function unwrapNestedErrors(error: Error): Error[] {
  const unwrapCandidate = error as Error & { unwrap?: () => unknown };
  if (typeof unwrapCandidate.unwrap === "function") {
    const unwrapped = unwrapCandidate.unwrap();
    if (Array.isArray(unwrapped)) {
      return unwrapped.filter((value): value is Error => value instanceof Error);
    }

    if (unwrapped instanceof Error) {
      return [unwrapped];
    }
  }

  if (error instanceof AggregateError) {
    return [...error.errors].filter((value): value is Error => value instanceof Error);
  }

  if ((error as { cause?: unknown }).cause instanceof Error) {
    return [(error as { cause: Error }).cause];
  }

  return [];
}

function parseStackLine(line: string): StackFrame | undefined {
  const trimmed = line.trim();
  const withFunction = /^at\s+(?<fn>.+?)\s+\((?<file>.+?):(?<line>\d+):(?<column>\d+)\)$/.exec(trimmed);

  if (withFunction?.groups) {
    const frame: StackFrame = {
      raw: trimmed,
      line: Number(withFunction.groups.line),
      column: Number(withFunction.groups.column),
    };

    if (withFunction.groups.fn) {
      frame.functionName = withFunction.groups.fn;
    }
    if (withFunction.groups.file) {
      frame.file = withFunction.groups.file;
    }

    return frame;
  }

  const bareFile = /^at\s+(?<file>.+?):(?<line>\d+):(?<column>\d+)$/.exec(trimmed);
  if (bareFile?.groups) {
    const frame: StackFrame = {
      raw: trimmed,
      line: Number(bareFile.groups.line),
      column: Number(bareFile.groups.column),
    };

    if (bareFile.groups.file) {
      frame.file = bareFile.groups.file;
    }

    return frame;
  }

  return {
    raw: trimmed,
  };
}

function shouldIncludeStackFrame(frame: StackFrame): boolean {
  const file = frame.file;

  if (!file) {
    return false;
  }

  const normalizedFile = file.replaceAll("\\", "/");

  if (isNodeRuntimeFrame(normalizedFile)) {
    return false;
  }

  if (isTestRunnerFrame(normalizedFile)) {
    return false;
  }

  if (isErrorableInternalFrame(normalizedFile) && !isAllowedPackageFrame(normalizedFile)) {
    return false;
  }

  return true;
}

function isConstructor<T extends Error>(matcher: ErrorMatcher<T>): matcher is abstract new (...args: any[]) => T {
  return "prototype" in matcher;
}

function isNodeRuntimeFrame(file: string): boolean {
  return (
    file.startsWith("node:") ||
    file.includes("/node:internal/") ||
    file.includes("/internal/") ||
    file.includes("/node_modules/node:")
  );
}

function isTestRunnerFrame(file: string): boolean {
  return (
    file.includes("/node_modules/@vitest/") ||
    file.includes("/node_modules/vitest/") ||
    file.includes("/node_modules/tinypool/") ||
    file.includes("/runner/dist/") ||
    file.includes("/dist/chunk-hooks.js")
  );
}

function isErrorableInternalFrame(file: string): boolean {
  return (
    file.includes("/src/errorable") ||
    file.includes("/dist/errorable") ||
    file.includes("/node_modules/errorable/") ||
    file.includes("/node_modules/@") && file.includes("/errorable/")
  );
}

function isAllowedPackageFrame(file: string): boolean {
  return (
    file.includes("/test/") ||
    file.includes("/tests/") ||
    file.includes("/example/") ||
    file.includes("/examples/") ||
    file.includes(".test.") ||
    file.includes(".spec.")
  );
}
