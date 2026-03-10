---
name: errorable
description: Use this skill when the user wants Go-style error handling in TypeScript or JavaScript, wants to adopt or review @ev3rlit/errorable, or asks about wrapping errors, structured metadata, stacktrace filtering, public error messages, error codes, trace/span fields, benchmarks, or migration from plain Error or neverthrow.
---

# Errorable

Use this skill when working with `@ev3rlit/errorable`, a Go-style error handling library for TypeScript inspired by Go `errors` and the Go `samber/oops` library.

## Trigger cases

- The user wants Go-style error wrapping in TypeScript or JavaScript.
- The user asks to adopt `@ev3rlit/errorable` in an app or library.
- The user asks how to model structured errors, public messages, trace/span, or stacktrace filtering.
- The user wants to compare `errorable` with `Error`, `neverthrow`, or Go's `errors` package.
- The user wants tests, benchmarks, or docs for `errorable`.

## Core guidance

- Prefer `Error` as the external contract in public interfaces.
- Create richer internal errors with `errorable()`.
- Prefer returning structured errors and wrapping causes over throwing eagerly in intermediate layers.
- Use `errorf()` for new formatted errors and `wrapf()` for contextual wrapping.
- Prefer `recover()` or `recoverf()` over handwritten `try/catch` when the goal is only to turn thrown values into structured errors.
- Reuse immutable builders for shared context. Define a common base builder once at module scope or near the top of a function, then derive more specific errors from it.
- Use `.public(...)` for user-safe messages and internal `.message` for operator-facing detail.
- Use `.code(...)` for machine-readable codes. Default `code()` returns the first code found from the current wrapper down the cause chain. Use `code({ codeSource: "deepest" })` only when the deepest code is explicitly needed.
- Use `trace()` for request-level correlation and `span()` for local operation-level correlation.
- Use `stackFrames()`, `stacktrace()`, and `toJSON()` for diagnostics. Filtered frames are the default; use `{ frameFilter: "all" }` only when debugging internals.
- Prefer calling stack-related APIs at logging or error-boundary layers, not deep inside hot business logic.

## Recommended workflow

1. Inspect the current project's error handling style before changing it.
2. Keep public return types as `Error` unless the user explicitly wants a narrower internal contract.
3. Introduce a shared builder for stable context such as domain, tags, owner, or request metadata.
4. Replace ad-hoc string-only errors with `builder.errorf(...)` when structured metadata is useful.
5. Prefer `builder.recover(...)` or `builder.recoverf(...)` when converting thrown values into `Error`.
6. Replace contextual `catch` blocks with `builder.wrapf(...)` when preserving the original cause matters.
7. Return the wrapped or recovered error upward and reserve `throw` for boundary layers that already use exception flow.
8. Add tests for:
   - plain creation
   - wrapping behavior
   - recover or recoverf behavior
   - code resolution
   - public message extraction
   - stacktrace or JSON serialization when relevant
9. If performance matters, benchmark `errorf`, `wrapf`, `code`, `toJSON`, and `stacktrace`, especially on deep chains.

## Usage patterns

### Shared builder pattern

```ts
import { errorable } from "@ev3rlit/errorable";

const billingErrors = errorable()
  .in("billing")
  .tags("db");

function buildPaymentFailedError(requestId: string, userId: string): Error {
  return billingErrors
    .with("requestId", requestId)
    .code("payment_failed")
    .public("Unable to process payment.")
    .errorf("payment failed for %s", userId);
}
```

### Wrap an existing cause

```ts
import { errorable } from "@ev3rlit/errorable";

const userServiceErrors = errorable().in("user-service");

function wrapLoadUserError(id: string, cause: unknown): Error {
  const baseError = cause instanceof Error ? cause : new Error(String(cause));

  return userServiceErrors
    .code("user_load_failed")
    .with("userId", id)
    .wrapf(baseError, "failed to load user")!;
}
```

### Recover thrown values without handwritten try/catch

```ts
import { errorable } from "@ev3rlit/errorable";

const userServiceErrors = errorable().in("user-service");

function loadUser(id: string): Error | undefined {
  return userServiceErrors
    .code("user_load_failed")
    .with("userId", id)
    .recoverf(() => {
      riskyUserOperation(id);
    }, "failed to load user");
}
```

### Preserve `Error` as the public contract

```ts
import { errorable } from "@ev3rlit/errorable";

const userErrors = errorable().in("user-service");

function loadUser(id: string): Error {
  return userErrors
    .code("user_load_failed")
    .with("userId", id)
    .errorf("failed to load user");
}
```

### Tuple return pattern

```ts
import { errorable } from "@ev3rlit/errorable";

const userErrors = errorable().in("user-service");

function loadUser(id: string): [user: User | null, error: Error | null] {
  const error = userErrors
    .code("user_load_failed")
    .with("userId", id)
    .recoverf(() => {
      parseUserOrThrow(id);
    }, "failed to load user");

  if (error) {
    return [null, error];
  }

  return [parseUser(id), null];
}
```

### neverthrow result pattern

```ts
import { err, ok, type Result } from "neverthrow";
import { errorable } from "@ev3rlit/errorable";

const userErrors = errorable().in("user-service");

function loadUser(id: string): Result<User, Error> {
  const error = userErrors
    .code("user_load_failed")
    .with("userId", id)
    .recoverf(() => {
      validateUserInputOrThrow(id);
    }, "failed to load user");

  if (error) {
    return err(error);
  }

  return ok(fetchUserFromSomewhere(id));
}
```

### Stacktrace and structured diagnostics

```ts
import { errorable } from "@ev3rlit/errorable";

const userErrors = errorable().in("user-service");

function logUserError(id: string, cause: unknown) {
  const baseError = cause instanceof Error ? cause : new Error(String(cause));
  const error = userErrors
    .code("user_load_failed")
    .with("userId", id)
    .wrapf(baseError, "failed to load user")!;

  console.error(error.stacktrace());
  console.error(JSON.stringify(error.toJSON(), null, 2));
}
```

### Show all frames while debugging internals

```ts
import { errorable } from "@ev3rlit/errorable";

const debugErrors = errorable().in("debug");

function inspectInternalFrames(cause: Error) {
  const error = debugErrors.wrapf(cause, "debug failure")!;

  console.error(error.stacktrace({ frameFilter: "all" }));
  console.dir(error.stackFrames({ frameFilter: "all" }), { depth: null });
}
```

## Review checklist

- Does the change preserve the original cause where it should?
- Is `.public(...)` used only for user-safe text?
- Are machine-readable codes stable and intentional?
- Are trace/span fields applied consistently rather than copied randomly?
- Are stack-heavy operations called only where diagnostics are actually needed?
- Is filtered stack output the default, with raw frames reserved for explicit debugging?
- Do tests cover deep wrap chains if the code relies on them?

## Repository-specific note

When working inside the `errorable` repository itself:

- keep README examples aligned with the current package name `@ev3rlit/errorable`
- keep benchmark documentation aligned with the latest benchmark snapshot
- keep publish automation aligned with npm scoped publishing and tag-based GitHub Actions release flow
