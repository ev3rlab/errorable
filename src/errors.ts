import { inspect } from "node:util";

/**
 * Symbol-based hook used to customize `is(error, target)` matching.
 */
export const kErrorIs = Symbol.for("errorable.errors.is");

/**
 * Symbol-based hook used to customize `as(error, matcher)` extraction.
 */
export const kErrorAs = Symbol.for("errorable.errors.as");

/**
 * Constructor type used by {@link as} for `instanceof`-style matching.
 */
export type ErrorConstructor<T extends Error> = abstract new (...args: any[]) => T;

/**
 * Type guard used by {@link as} for predicate-based matching.
 */
export type ErrorGuard<T extends Error> = (value: unknown) => value is T;

/**
 * Matcher accepted by {@link as}, either a constructor or a type guard.
 */
export type ErrorMatcher<T extends Error> = ErrorConstructor<T> | ErrorGuard<T>;

/**
 * Extended error shape supported by the traversal helpers in this module.
 *
 * Errors may optionally provide custom `unwrap`, `cause`, `is`, and `as`
 * behavior without inheriting from a specific base class.
 */
export interface ErrorLike extends Error {
  cause?: unknown;
  unwrap?: () => unknown;
  [kErrorIs]?: (target: unknown) => boolean;
  [kErrorAs]?: <T extends Error>(matcher: ErrorMatcher<T>) => T | undefined;
}

/**
 * Minimal error implementation used by {@link newError}.
 */
export class BasicError extends Error {
  /**
   * Creates a basic error with the provided message.
   */
  constructor(message: string) {
    super(message);
    this.name = "BasicError";
  }
}

/**
 * Error type used to represent multiple underlying errors as a single value.
 */
export class JoinedError extends Error {
  readonly errors: Error[];

  /**
   * Creates a joined error from multiple underlying errors.
   */
  constructor(errors: readonly Error[]) {
    const normalized = [...errors];
    super(normalized.map((error) => error.message).join("; "));
    this.name = "JoinedError";
    this.errors = normalized;
  }

  /**
   * Returns the wrapped child errors.
   */
  unwrap(): Error[] {
    return [...this.errors];
  }
}

/**
 * Creates a plain error using the library's basic error type.
 */
export function newError(message: string): Error {
  return new BasicError(message);
}

/**
 * Converts any unknown value into an {@link Error}.
 *
 * Existing `Error` instances are returned as-is. Strings become `Error`
 * messages, and other values are rendered with `util.inspect`.
 */
export function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }

  if (typeof value === "string") {
    return new Error(value);
  }

  return new Error(inspect(value, { depth: 4, breakLength: 120 }));
}

/**
 * Joins multiple errors into a single error.
 *
 * Returns `undefined` when every provided value is `null` or `undefined`.
 * Returns the original error unchanged when only one error is provided.
 */
export function join(...errors: Array<Error | null | undefined>): Error | undefined {
  const normalized = errors.filter((value): value is Error => value instanceof Error);

  if (normalized.length === 0) {
    return undefined;
  }

  if (normalized.length === 1) {
    return normalized[0];
  }

  return new JoinedError(normalized);
}

/**
 * Returns the next error or errors in an error chain.
 *
 * Supports explicit `unwrap()` implementations, `AggregateError`, and native
 * `Error.cause`.
 */
export function unwrap(error: unknown): Error | Error[] | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const candidate = error as ErrorLike;

  if (typeof candidate.unwrap === "function") {
    const unwrapped = candidate.unwrap();
    if (Array.isArray(unwrapped)) {
      return unwrapped.filter((value): value is Error => value instanceof Error);
    }

    if (unwrapped instanceof Error) {
      return unwrapped;
    }
  }

  if (error instanceof AggregateError) {
    return [...error.errors].filter((value): value is Error => value instanceof Error);
  }

  if (candidate.cause instanceof Error) {
    return candidate.cause;
  }

  return undefined;
}

/**
 * Reports whether an error chain matches a target error.
 *
 * Matching uses direct identity, custom {@link kErrorIs} hooks, `unwrap()`,
 * joined errors, and native `cause` traversal.
 */
export function is(error: unknown, target: unknown): boolean {
  if (!(error instanceof Error) || target == null) {
    return false;
  }

  const visited = new Set<Error>();
  const stack: Error[] = [error];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);

    if (current === target) {
      return true;
    }

    const customMatch: ErrorLike[typeof kErrorIs] = (current as ErrorLike)[kErrorIs];
    if (typeof customMatch === "function" && customMatch.call(current, target)) {
      return true;
    }

    const next = unwrap(current);
    if (Array.isArray(next)) {
      for (const child of next) {
        stack.push(child);
      }
    } else if (next instanceof Error) {
      stack.push(next);
    }
  }

  return false;
}

/**
 * Extracts a typed error from an error chain.
 *
 * The matcher may be an error constructor or a type guard.
 */
export function as<T extends Error>(error: unknown, matcher: ErrorMatcher<T>): T | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const visited = new Set<Error>();
  const stack: Error[] = [error];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);

    const customAs: ErrorLike[typeof kErrorAs] = (current as ErrorLike)[kErrorAs];
    if (typeof customAs === "function") {
      const matched = customAs.call(current, matcher);
      if (matched !== undefined) {
        return matched as T;
      }
    }

    if (matchesValue(current, matcher)) {
      return current as T;
    }

    const next = unwrap(current);
    if (Array.isArray(next)) {
      for (const child of next) {
        stack.push(child);
      }
    } else if (next instanceof Error) {
      stack.push(next);
    }
  }

  return undefined;
}

function matchesValue<T extends Error>(value: unknown, matcher: ErrorMatcher<T>): value is T {
  if (isConstructor(matcher)) {
    return value instanceof matcher;
  }

  return matcher(value);
}

function isConstructor<T extends Error>(matcher: ErrorMatcher<T>): matcher is ErrorConstructor<T> {
  return "prototype" in matcher;
}
