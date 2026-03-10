import { format } from "node:util";

import { join as joinErrors, toError } from "./errors.js";
import { ErrorableError } from "./errorable-error.js";
import type { ErrorableCode, ErrorableState, SubjectInput } from "./errorable-types.js";
import { cloneErrorableState, createErrorableState, normalizeRecord } from "./errorable-utils.js";

/**
 * Immutable builder for creating structured {@link ErrorableError} instances.
 *
 * Builder methods return a new builder with updated state so a single base
 * builder can be safely reused across multiple errors.
 */
export class ErrorableBuilder {
  readonly #state: ErrorableState;

  /**
   * Creates a builder from the provided internal state.
   *
   * Most callers should use {@link errorable} instead of calling the
   * constructor directly.
   */
  constructor(state: ErrorableState = createErrorableState()) {
    this.#state = cloneErrorableState(state);
  }

  /**
   * Sets a machine-readable error code.
   *
   * Numeric codes must be integers.
   *
   * @throws {TypeError} When a numeric code is not an integer.
   */
  code(code: ErrorableCode): ErrorableBuilder {
    validateErrorableCode(code);

    return this.update((state) => {
      state.code = code;
    });
  }

  /**
   * Sets the timestamp associated with the resulting error.
   */
  time(time: Date): ErrorableBuilder {
    return this.update((state) => {
      state.time = new Date(time);
    });
  }

  /**
   * Sets the duration based on the elapsed time since `startTime`.
   */
  since(startTime: Date): ErrorableBuilder {
    return this.duration(Date.now() - startTime.getTime());
  }

  /**
   * Sets the duration associated with the resulting error, in milliseconds.
   */
  duration(durationMs: number): ErrorableBuilder {
    return this.update((state) => {
      state.durationMs = durationMs;
    });
  }

  /**
   * Sets the logical domain or subsystem for the error.
   */
  in(domain: string): ErrorableBuilder {
    return this.update((state) => {
      state.domain = domain;
    });
  }

  /**
   * Appends one or more classification tags.
   */
  tags(...tags: string[]): ErrorableBuilder {
    return this.update((state) => {
      state.tags.push(...tags);
    });
  }

  /**
   * Sets the trace identifier shared across a wider request flow.
   */
  trace(traceId: string): ErrorableBuilder {
    return this.update((state) => {
      state.trace = traceId;
    });
  }

  /**
   * Sets the span identifier for the current unit of work.
   */
  span(spanId: string): ErrorableBuilder {
    return this.update((state) => {
      state.span = spanId;
    });
  }

  /**
   * Adds structured key/value context to the error.
   *
   * Accepts either a plain object or alternating `key, value` pairs.
   */
  with(...input: Array<unknown>): ErrorableBuilder {
    return this.update((state) => {
      Object.assign(state.context, normalizeRecord(input));
    });
  }

  /**
   * Copies selected values from an existing context object into the builder.
   *
   * When no keys are provided, every own key in the input context is copied.
   */
  withContext(context: Record<PropertyKey, unknown>, ...keys: Array<PropertyKey>): ErrorableBuilder {
    return this.update((state) => {
      const selected = keys.length > 0 ? keys : Reflect.ownKeys(context);

      for (const key of selected) {
        const value = context[key];
        if (value !== undefined) {
          state.context[String(key)] = value;
        }
      }
    });
  }

  /**
   * Adds a developer-facing troubleshooting hint.
   */
  hint(hint: string): ErrorableBuilder {
    return this.update((state) => {
      state.hint = hint;
    });
  }

  /**
   * Sets a user-safe public message.
   */
  public(message: string): ErrorableBuilder {
    return this.update((state) => {
      state.publicMessage = message;
    });
  }

  /**
   * Sets the owner responsible for triaging the error.
   */
  owner(owner: string): ErrorableBuilder {
    return this.update((state) => {
      state.owner = owner;
    });
  }

  /**
   * Attaches structured user identity metadata.
   */
  user(id: string, data?: SubjectInput, ...rest: Array<unknown>): ErrorableBuilder {
    return this.update((state) => {
      state.user = {
        id,
        data: normalizeRecord(data, ...rest),
      };
    });
  }

  /**
   * Attaches structured tenant identity metadata.
   */
  tenant(id: string, data?: SubjectInput, ...rest: Array<unknown>): ErrorableBuilder {
    return this.update((state) => {
      state.tenant = {
        id,
        data: normalizeRecord(data, ...rest),
      };
    });
  }

  /**
   * Creates a new structured error from a fixed message.
   */
  new(message: string): ErrorableError {
    return this.create(new Error(message));
  }

  /**
   * Creates a new structured error from a formatted message.
   *
   * Formatting follows Node's `util.format`.
   */
  errorf(template: string, ...args: Array<unknown>): ErrorableError {
    return this.create(new Error(format(template, ...args)));
  }

  /**
   * Wraps an existing error with the builder's metadata.
   *
   * @returns `undefined` when `error` is `null` or `undefined`.
   */
  wrap(error: Error | null | undefined): ErrorableError | undefined {
    if (!(error instanceof Error)) {
      return undefined;
    }

    return this.create(error);
  }

  /**
   * Wraps an existing error and prepends a formatted summary message.
   *
   * @returns `undefined` when `error` is `null` or `undefined`.
   */
  wrapf(error: Error | null | undefined, template: string, ...args: Array<unknown>): ErrorableError | undefined {
    if (!(error instanceof Error)) {
      return undefined;
    }

    return this.create(error, format(template, ...args));
  }

  /**
   * Joins multiple errors and wraps the combined error with the builder's metadata.
   */
  join(...errors: Array<Error | null | undefined>): ErrorableError | undefined {
    const combined = joinErrors(...errors);
    return combined ? this.wrap(combined) : undefined;
  }

  /**
   * Converts a thrown value from a callback into an {@link ErrorableError}.
   *
   * @returns `undefined` when the callback completes without throwing.
   */
  recover<T>(callback: () => T): ErrorableError | undefined {
    try {
      callback();
      return undefined;
    } catch (error) {
      return this.wrap(toError(error));
    }
  }

  /**
   * Like {@link recover}, but prepends a formatted summary message.
   */
  recoverf<T>(callback: () => T, template: string, ...args: Array<unknown>): ErrorableError | undefined {
    const recovered = this.recover(callback);
    return recovered ? this.wrapf(recovered, template, ...args) : undefined;
  }

  /**
   * Throws a structured assertion error when `condition` is falsy.
   *
   * @throws {ErrorableError}
   */
  assert(condition: unknown, message = "assertion failed"): ErrorableBuilder {
    if (!condition) {
      throw this.new(message);
    }

    return this;
  }

  /**
   * Throws a formatted structured assertion error when `condition` is falsy.
   *
   * @throws {ErrorableError}
   */
  assertf(condition: unknown, template: string, ...args: Array<unknown>): ErrorableBuilder {
    if (!condition) {
      throw this.errorf(template, ...args);
    }

    return this;
  }

  private update(mutator: (state: ErrorableState) => void): ErrorableBuilder {
    const next = cloneErrorableState(this.#state);
    mutator(next);
    return new ErrorableBuilder(next);
  }

  private create(cause: Error, summary?: string): ErrorableError {
    return new ErrorableError({
      cause,
      summary,
      state: this.#state,
    });
  }
}

function validateErrorableCode(code: ErrorableCode): void {
  if (typeof code === "string") {
    return;
  }

  if (!Number.isInteger(code)) {
    throw new TypeError("Errorable code numbers must be integers.");
  }
}
