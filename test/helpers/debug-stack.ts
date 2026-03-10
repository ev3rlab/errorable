import { inspect } from "node:util";

import { ErrorableError } from "../../src/index.js";
import type { ErrorableSerializationOptions } from "../../src/index.js";

export interface DebugStackOptions extends ErrorableSerializationOptions {
  logger?: (message: string) => void;
  label?: string;
}

export function debugStack(error: unknown, options: DebugStackOptions = {}): string {
  const logger = options.logger ?? console.log;
  const rendered = formatDebugStack(error, options);

  logger(rendered);

  return rendered;
}

export function formatDebugStack(error: unknown, options: DebugStackOptions = {}): string {
  const label = options.label ?? "debugStack";

  if (!(error instanceof Error)) {
    return [
      `[${label}] non-error`,
      inspect(error, { depth: null, colors: false, compact: false }),
    ].join("\n");
  }

  const sections = [`[${label}] ${error.name}: ${error.message}`];

  if (error instanceof ErrorableError) {
    sections.push(
      "",
      "[stack]",
      `${error.name}: ${error.message}\n${error.stackFrames(options).map((frame) => frame.raw).join("\n")}`.trim(),
    );

    sections.push(
      "",
      "[stacktrace()]",
      error.stacktrace(options) || "(empty)",
      "",
      "[stackFrames()]",
      inspect(error.stackFrames(options), { depth: null, colors: false, compact: false }),
      "",
      "[toJSON().stack]",
      inspect(error.toJSON(options).stack, { depth: null, colors: false, compact: false }),
    );
  } else {
    sections.push(
      "",
      "[stack]",
      error.stack ?? "(no stack available)",
    );
  }

  return sections.join("\n");
}

export function debugErrorableJson(error: unknown, options: DebugStackOptions = {}): string {
  const logger = options.logger ?? console.log;
  const rendered = formatDebugErrorableJson(error, options);

  logger(rendered);

  return rendered;
}

export function formatDebugErrorableJson(error: unknown, options: DebugStackOptions = {}): string {
  const resolvedLabel = options.label ?? "debugErrorableJson";

  if (error instanceof ErrorableError) {
    return [
      `[${resolvedLabel}]`,
      JSON.stringify(error.toJSON(options), null, 2),
    ].join("\n");
  }

  if (error instanceof Error) {
    return [
      `[${resolvedLabel}]`,
      JSON.stringify(
        {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        null,
        2,
      ),
    ].join("\n");
  }

  return [
    `[${resolvedLabel}]`,
    inspect(error, { depth: null, colors: false, compact: false }),
  ].join("\n");
}
