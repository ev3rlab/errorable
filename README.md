# errorable

`errorable` is a TypeScript error-handling library built in the style of Go.

It explicitly follows two Go ideas:

- the standard `errors` package traversal model: `join`, `unwrap`, `is`, `as`
- a structured error builder inspired by the Go `oops` library

This project is based on:

- Go's standard `errors` package design
- the Go [`samber/oops`](https://github.com/samber/oops) library

This is not an official port of `samber/oops`. It is a TypeScript library that adopts the same overall philosophy and adapts it to the JavaScript/TypeScript runtime model.

## Install

```sh
npm install
```

## Quick start

```ts
import { errorable, is, as, join } from "errorable";

const err = errorable()
  .in("user-service")
  .tags("database", "postgres")
  .code("network_failure")
  .public("사용자 정보를 가져오지 못했습니다.")
  .with("requestId", "req-123")
  .errorf("failed to fetch user: %s", "connection timeout");

const wrapped = errorable()
  .trace("trace-123")
  .with("productId", "456")
  .wrapf(err, "user operation failed");

console.log(wrapped?.toJSON());
console.log(is(wrapped, err));
console.log(as(wrapped, Error)?.message);
console.log(join(err, new Error("secondary failure"))?.message);
```

## Design origin

`errorable` should be read as a Go-style library first, not as a Result-type library.

- Error traversal is intentionally modeled after Go `errors`
- Structured wrapping and metadata are intentionally modeled after Go `oops`
- The API is adapted to TypeScript and native JavaScript `Error`, `cause`, and stack behavior

## API

### `errors` helpers

- `newError(message)`
- `join(...errors)`
- `unwrap(error)`
- `is(error, target)`
- `as(error, matcher)`

### `errorable` helpers

- `errorable()` to create an immutable builder
- builder methods: `.code()` (`string` or integer), `.in()`, `.tags()`, `.trace()`, `.span()`, `.with()`, `.withContext()`, `.hint()`, `.public()`, `.owner()`, `.user()`, `.tenant()`
- terminal methods: `.new()`, `.errorf()`, `.wrap()`, `.wrapf()`, `.join()`, `.recover()`, `.recoverf()`
- assertions: `assert()`, `assertf()`
- structured extraction: `error.context()`, `error.tags()`, `error.code()`, `error.toJSON()`, `getPublic(error, fallback)`

## API design guidance

In normal TypeScript application code, prefer `Error` as your external contract.

- return `Error` from public boundaries and shared interfaces
- create errors with `errorable()` internally when you want richer metadata
- keep the public shape simple and let logging or boundary code consume the extra metadata

Example:

```ts
import { errorable } from "errorable";

function loadUser(): Error {
  return errorable()
    .in("user-service")
    .code("user_load_failed")
    .errorf("failed to load user");
}

throw loadUser();
```

## Using with neverthrow

`errorable` can be used together with [`neverthrow`](https://github.com/supermacro/neverthrow).

- `neverthrow` models control flow with `Result<T, E>`
- `errorable` makes the error value itself richer and easier to debug

Example:

```ts
import { err, ok, type Result } from "neverthrow";
import { errorable } from "errorable";

type User = {
  id: string;
  name: string;
};

function loadUser(id: string): Result<User, Error> {
  try {
    const user = fetchUserFromSomewhere(id);
    return ok(user);
  } catch (cause) {
    const baseError = cause instanceof Error ? cause : new Error(String(cause));

    return err(
      errorable()
        .in("user-service")
        .code("user_load_failed")
        .with("userId", id)
        .wrapf(baseError, "failed to load user")!,
    );
  }
}
```

This works well when:

- you want `neverthrow` to enforce explicit success/failure handling
- you want `errorable` to preserve stacktrace, code, trace/span, and structured metadata

## Benchmarking

Run the benchmark suite with:

```sh
npm run bench
```

Write a machine-readable benchmark report for CI or commit-to-commit comparison with:

```sh
npm run bench:json
```

This writes the latest result to `bench/results/latest.json`.

The benchmark suite lives in `bench/errorable.bench.ts` and uses `vitest bench`, which in turn uses time-based sampling rather than fixed iteration counts. That means the runner keeps executing a case for a target duration and reports statistical results, closer to the Go benchmark style than a hand-written `for` loop.

It measures:

- flat creation costs such as `errorf()` and `wrap()`
- repeated reads for `code()`, `toJSON()`, and `stacktrace()`
- wrap-chain creation costs at increasing depths
- depth sweeps that show how read costs grow as the chain gets deeper
- deep probes beyond the normal sweep to check whether creation and traversal still succeed

The output is intentionally split into:

- flat and hot-path operations such as `errorf()`, `wrap()`, `code()`, `toJSON()`, and `stacktrace()`
- wrap-chain creation at several depths
- traversal and serialization costs at moderate and deep chain lengths
- very deep probe scenarios focused on chain creation and code lookup stability

Benchmark numbers are machine-dependent. Use them to compare scenarios against each other and to spot regressions across commits, not as fixed universal throughput guarantees.

For CI-style comparisons, keep a previous JSON report and use Vitest's built-in compare support, for example:

```sh
npx vitest bench --run --compare ./bench/results/latest.json
```

## Notes

- The project targets Node.js and uses native `Error.cause`.
- Formatting follows Node's `util.format`, so `%s`, `%d`, `%j` style placeholders work.
- Errors created by `errorable()` capture stack frames at creation time and expose structured metadata helpers such as `stackFrames()`, `stacktrace()`, and `toJSON()`.
- The stacktrace model filters internal/runtime frames by default, but `stackFrames()`, `stacktrace()`, and `toJSON()` can expose all frames with `{ frameFilter: "all" }`.
