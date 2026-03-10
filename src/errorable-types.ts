/**
 * Parsed representation of a single stack frame.
 */
export interface StackFrame {
  raw: string;
  functionName?: string;
  file?: string;
  line?: number;
  column?: number;
}

/**
 * Machine-readable error code supported by `Errorable`.
 *
 * Use strings for symbolic codes and integers for numeric status-style codes.
 */
export type ErrorableCode = string | number;

/**
 * Controls how `code()` resolves an error code from a wrapped error chain.
 */
export interface ErrorableCodeOptions {
  /**
   * Selects whether the first code found from the current wrapper downward or the deepest wrapped code is returned.
   *
   * @defaultValue `"first"`
   */
  codeSource?: "first" | "deepest";
}

/**
 * Controls whether stack-oriented APIs return filtered or raw frames.
 */
export interface ErrorableStackOptions {
  /**
   * Selects the frame filtering mode.
   *
   * @defaultValue `"filtered"`
   */
  frameFilter?: "filtered" | "all";
}

/**
 * Combined option bag used by serialization helpers that expose both code and stack data.
 */
export interface ErrorableSerializationOptions extends ErrorableCodeOptions, ErrorableStackOptions {}

/**
 * Structured identity payload for a user or tenant.
 */
export interface ErrorableSubject {
  id: string;
  data: Record<string, unknown>;
}

/**
 * JSON-friendly serialized representation of an {@link ErrorableError}.
 */
export interface ErrorablePayload {
  name: string;
  message: string;
  summary: string | undefined;
  code: ErrorableCode | undefined;
  time: string;
  durationMs: number | undefined;
  domain: string | undefined;
  tags: string[];
  trace: string;
  span: string;
  hint: string | undefined;
  publicMessage: string | undefined;
  owner: string | undefined;
  context: Record<string, unknown>;
  user: ErrorableSubject | undefined;
  tenant: ErrorableSubject | undefined;
  stack: StackFrame[];
  cause: ErrorablePayload | { name: string; message: string };
}

/**
 * Lazily-evaluated value accepted by structured context maps.
 */
export type LazyValue = unknown | (() => unknown);

/**
 * Key/value storage used internally for structured metadata.
 */
export type LazyRecord = Record<string, LazyValue>;

/**
 * Input accepted by `.with(...)`.
 */
export type BuilderContextInput = Record<string, unknown> | Array<unknown>;

/**
 * Input accepted by `.user(...)` and `.tenant(...)`.
 */
export type SubjectInput = Record<string, unknown> | Array<unknown> | undefined;

/**
 * Internal subject representation stored on the builder and error objects.
 */
export interface SubjectState {
  id: string;
  data: LazyRecord;
}

/**
 * Internal immutable builder state used to construct {@link ErrorableError}.
 */
export interface ErrorableState {
  code: ErrorableCode | undefined;
  time: Date;
  durationMs: number | undefined;
  domain: string | undefined;
  tags: string[];
  context: LazyRecord;
  trace: string | undefined;
  span: string | undefined;
  hint: string | undefined;
  publicMessage: string | undefined;
  owner: string | undefined;
  user: SubjectState | undefined;
  tenant: SubjectState | undefined;
}
