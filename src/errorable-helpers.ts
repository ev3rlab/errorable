import { as, is } from "./errors.js";
import { ErrorableBuilder } from "./errorable-builder.js";
import { ErrorableError } from "./errorable-error.js";

/**
 * Creates a new {@link ErrorableBuilder}.
 */
export function errorable(): ErrorableBuilder {
  return new ErrorableBuilder();
}

/**
 * Wraps an existing error with a fresh {@link ErrorableBuilder}.
 *
 * @returns `undefined` when `error` is `null` or `undefined`.
 */
export function wrap(error: Error | null | undefined): ErrorableError | undefined {
  return new ErrorableBuilder().wrap(error);
}

/**
 * Wraps an existing error with a formatted summary message.
 *
 * @returns `undefined` when `error` is `null` or `undefined`.
 */
export function wrapf(error: Error | null | undefined, template: string, ...args: Array<unknown>): ErrorableError | undefined {
  return new ErrorableBuilder().wrapf(error, template, ...args);
}

/**
 * Creates a new structured error from a formatted message.
 */
export function errorf(template: string, ...args: Array<unknown>): ErrorableError {
  return new ErrorableBuilder().errorf(template, ...args);
}

/**
 * Joins multiple errors and wraps the result in an {@link ErrorableError}.
 */
export function join(...errors: Array<Error | null | undefined>): ErrorableError | undefined {
  return new ErrorableBuilder().join(...errors);
}

/**
 * Converts a thrown callback value into an {@link ErrorableError}.
 */
export function recover<T>(callback: () => T): ErrorableError | undefined {
  return new ErrorableBuilder().recover(callback);
}

/**
 * Like {@link recover}, but prepends a formatted summary message.
 */
export function recoverf<T>(callback: () => T, template: string, ...args: Array<unknown>): ErrorableError | undefined {
  return new ErrorableBuilder().recoverf(callback, template, ...args);
}

/**
 * Throws a structured assertion error when `condition` is falsy.
 */
export function assert(condition: unknown, message?: string): ErrorableBuilder {
  return new ErrorableBuilder().assert(condition, message);
}

/**
 * Throws a formatted structured assertion error when `condition` is falsy.
 */
export function assertf(condition: unknown, template: string, ...args: Array<unknown>): ErrorableBuilder {
  return new ErrorableBuilder().assertf(condition, template, ...args);
}

/**
 * Returns the public-facing message from an {@link ErrorableError}, or a fallback.
 */
export function getPublic(error: unknown, fallback: string): string {
  const matched = as(error, ErrorableError);
  return matched?.public() ?? fallback;
}

/**
 * Reports whether an error chain matches a target error.
 */
export function matches(error: unknown, target: unknown): boolean {
  return is(error, target);
}
