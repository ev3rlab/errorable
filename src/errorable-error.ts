import { as, type ErrorMatcher, kErrorAs, kErrorIs } from "./errors.js";
import type {
  ErrorableCode,
  ErrorableCodeOptions,
  ErrorablePayload,
  ErrorableSerializationOptions,
  ErrorableStackOptions,
  ErrorableState,
  ErrorableSubject,
  LazyRecord,
  StackFrame,
  SubjectState,
} from "./errorable-types.js";
import {
  deepestMatchingValue,
  firstMatchingValue,
  formatFrames,
  getStackFrames,
  isErrorMatch,
  mergeLazyRecords,
  parseStack,
  visitMatchingErrors,
} from "./errorable-utils.js";

/**
 * Structured error type inspired by Go-style wrapping and metadata-rich errors.
 *
 * The class preserves an underlying cause, captures stack frames at creation
 * time, and exposes helpers for traversing merged metadata across nested
 * `ErrorableError` chains.
 */
export class ErrorableError extends Error {
  override readonly cause: Error;
  readonly summary: string | undefined;
  readonly createdAt: Date;
  readonly durationMs: number | undefined;
  readonly domainName: string | undefined;
  readonly localTags: string[];
  readonly localContext: LazyRecord;
  readonly traceId: string;
  readonly spanId: string;
  readonly hintText: string | undefined;
  readonly publicText: string | undefined;
  readonly ownerName: string | undefined;
  readonly localCode: ErrorableCode | undefined;
  readonly localUser: SubjectState | undefined;
  readonly localTenant: SubjectState | undefined;
  readonly frames: StackFrame[];

  /**
   * Creates a structured error from a wrapped cause and builder state.
   */
  constructor(input: { cause: Error; summary: string | undefined; state: ErrorableState }) {
    const message = input.summary ? `${input.summary}: ${input.cause.message}` : input.cause.message;
    super(message, { cause: input.cause });
    this.name = "ErrorableError";
    this.cause = input.cause;
    this.summary = input.summary;
    this.createdAt = new Date(input.state.time);
    this.durationMs = input.state.durationMs;
    this.domainName = input.state.domain;
    this.localTags = [...input.state.tags];
    this.localContext = { ...input.state.context };
    this.traceId = input.state.trace ?? crypto.randomUUID();
    this.spanId = input.state.span ?? crypto.randomUUID();
    this.hintText = input.state.hint;
    this.publicText = input.state.publicMessage;
    this.ownerName = input.state.owner;
    this.localCode = input.state.code;
    this.localUser = input.state.user
      ? {
          id: input.state.user.id,
          data: { ...input.state.user.data },
        }
      : undefined;
    this.localTenant = input.state.tenant
      ? {
          id: input.state.tenant.id,
          data: { ...input.state.tenant.data },
        }
      : undefined;

    Error.captureStackTrace?.(this, ErrorableError);
    this.frames = parseStack(this.stack);
  }

  /**
   * Returns the wrapped cause.
   */
  unwrap(): Error {
    return this.cause;
  }

  [kErrorIs](target: unknown): boolean {
    return target instanceof ErrorableError;
  }

  [kErrorAs]<T extends Error>(matcher: ErrorMatcher<T>): T | undefined {
    return isErrorMatch(this, matcher) ? (this as T) : undefined;
  }

  /**
   * Returns the first code found from the current wrapper down the cause chain by default.
   *
   * Use `{ codeSource: "deepest" }` to resolve the deepest code in the chain.
   *
   * @defaultValue First code found in the chain
   */
  code(options: ErrorableCodeOptions = {}): ErrorableCode | undefined {
    if (options.codeSource === "deepest") {
      return deepestMatchingValue(this, isErrorableError, (error) => error.localCode);
    }

    return firstMatchingValue(this, isErrorableError, (error) => error.localCode);
  }

  /**
   * Returns the deepest timestamp in the error chain.
   */
  time(): Date {
    return deepestMatchingValue(this, isErrorableError, (error) => error.createdAt) ?? this.createdAt;
  }

  /**
   * Returns the deepest duration in the error chain.
   */
  duration(): number | undefined {
    return deepestMatchingValue(this, isErrorableError, (error) => error.durationMs);
  }

  /**
   * Returns the deepest domain name in the error chain.
   */
  domain(): string | undefined {
    return deepestMatchingValue(this, isErrorableError, (error) => error.domainName);
  }

  /**
   * Returns the union of tags across the entire error chain.
   */
  tags(): string[] {
    const seen = new Set<string>();
    visitMatchingErrors(this, isErrorableError, (error) => {
      for (const tag of error.localTags) {
        seen.add(tag);
      }
    });
    return [...seen];
  }

  /**
   * Reports whether the error chain contains the provided tag.
   */
  hasTag(tag: string): boolean {
    return this.tags().includes(tag);
  }

  /**
   * Returns merged structured context across the entire error chain.
   *
   * Lazy context values are evaluated when this method is called.
   */
  context(): Record<string, unknown> {
    return mergeLazyRecords(this, isErrorableError, (error) => error.localContext);
  }

  /**
   * Returns the trace identifier for the error chain.
   */
  trace(): string {
    return deepestMatchingValue(this, isErrorableError, (error) => error.traceId) ?? this.traceId;
  }

  /**
   * Returns the span identifier for this error instance.
   */
  span(): string {
    return this.spanId;
  }

  /**
   * Returns the deepest developer-facing hint in the chain.
   */
  hint(): string | undefined {
    return deepestMatchingValue(this, isErrorableError, (error) => error.hintText);
  }

  /**
   * Returns the deepest user-safe public message in the chain.
   */
  public(): string | undefined {
    return deepestMatchingValue(this, isErrorableError, (error) => error.publicText);
  }

  /**
   * Returns the deepest owner value in the chain.
   */
  owner(): string | undefined {
    return deepestMatchingValue(this, isErrorableError, (error) => error.ownerName);
  }

  /**
   * Returns merged user identity data from the error chain.
   */
  user(): ErrorableSubject | undefined {
    const id = deepestMatchingValue(this, isErrorableError, (error) => error.localUser?.id);
    const data = mergeLazyRecords(this, isErrorableError, (error) => error.localUser?.data ?? {});

    if (!id && Object.keys(data).length === 0) {
      return undefined;
    }

    return {
      id: id ?? "",
      data,
    };
  }

  /**
   * Returns merged tenant identity data from the error chain.
   */
  tenant(): ErrorableSubject | undefined {
    const id = deepestMatchingValue(this, isErrorableError, (error) => error.localTenant?.id);
    const data = mergeLazyRecords(this, isErrorableError, (error) => error.localTenant?.data ?? {});

    if (!id && Object.keys(data).length === 0) {
      return undefined;
    }

    return {
      id: id ?? "",
      data,
    };
  }

  /**
   * Returns parsed stack frames for this error instance.
   *
   * @defaultValue Filtered stack frames
   */
  stackFrames(options: ErrorableStackOptions = {}): StackFrame[] {
    return getStackFrames(this.frames, options);
  }

  /**
   * Renders a human-readable stacktrace for every `ErrorableError` in the chain.
   *
   * @defaultValue Filtered stack frames
   */
  stacktrace(options: ErrorableStackOptions = {}): string {
    const blocks: string[] = [];
    visitMatchingErrors(this, isErrorableError, (error) => {
      const label = error.summary ?? error.cause.message;
      blocks.push(`Thrown: ${label}\n${formatFrames(error.stackFrames(options))}`);
    });
    return blocks.join("\n");
  }

  /**
   * Serializes the error into a JSON-friendly payload.
   *
   * Stack frame filtering and code resolution can both be controlled through the options object.
   */
  toJSON(options: ErrorableSerializationOptions = {}): ErrorablePayload {
    const causeErrorable = as(this.cause, ErrorableError);

    return {
      name: this.name,
      message: this.message,
      summary: this.summary,
      code: this.code(options),
      time: this.time().toISOString(),
      durationMs: this.duration(),
      domain: this.domain(),
      tags: this.tags(),
      trace: this.trace(),
      span: this.span(),
      hint: this.hint(),
      publicMessage: this.public(),
      owner: this.owner(),
      context: this.context(),
      user: this.user(),
      tenant: this.tenant(),
      stack: this.stackFrames(options),
      cause: causeErrorable
        ? causeErrorable.toJSON(options)
        : {
            name: this.cause.name,
            message: this.cause.message,
          },
    };
  }
}

/**
 * Runtime type guard for {@link ErrorableError}.
 */
export function isErrorableError(error: Error): error is ErrorableError {
  return error instanceof ErrorableError;
}
