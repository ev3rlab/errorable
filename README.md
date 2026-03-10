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
  .public("Unable to load user information.")
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

Latest benchmark snapshot:

- measured on March 10, 2026
- machine: Apple M1 Max
- runtime: Node `v22.16.0`
- benchmark runner: `vitest bench` with time-based sampling

Hot-path results from the latest run:

| Scenario | Mean/op |
| --- | ---: |
| `errorf()` flat creation | `41.6 us/op` |
| `wrap()` plain `Error` | `42.0 us/op` |
| `wrapf()` create depth `10` chain | `550.2 us/op` |
| `code()` first-hit depth `25` | `1.7 us/op` |
| `code()` fallback-to-cause depth `25` | `1.9 us/op` |
| `code({ codeSource: "deepest" })` depth `25` | `1.6 us/op` |
| `toJSON()` filtered depth `10` | `152.0 us/op` |
| `toJSON({ frameFilter: "all" })` depth `10` | `91.8 us/op` |
| `stacktrace()` filtered depth `10` | `60.0 us/op` |
| `stacktrace({ frameFilter: "all" })` depth `10` | `5.5 us/op` |

Depth sweep from the latest run:

| Depth | Create | `code()` | `toJSON()` | `stacktrace()` |
| --- | ---: | ---: | ---: | ---: |
| `1` | `0.0986 ms` | `0.0002 ms` | `0.0166 ms` | `0.0115 ms` |
| `10` | `0.5546 ms` | `0.0007 ms` | `0.2043 ms` | `0.0600 ms` |
| `100` | `5.0212 ms` | `0.0081 ms` | `7.2669 ms` | `0.5659 ms` |
| `500` | `28.7357 ms` | `0.0411 ms` | `182.8077 ms` | `2.6056 ms` |

Deep probe from the latest run:

| Depth | Create | `code()` | `code({ codeSource: "deepest" })` |
| --- | ---: | ---: | ---: |
| `1000` | `64.2984 ms` | `0.0861 ms` | `0.0976 ms` |
| `2000` | `139.8489 ms` | `0.1867 ms` | `0.1976 ms` |
| `4000` | `411.9070 ms` | `0.4683 ms` | `0.4114 ms` |

What these numbers suggest:

- `errorf()` and `wrap()` are cheap enough to use freely on normal error paths.
- `code()` lookup remains very cheap even on deep chains.
- `toJSON()` is the most expensive read path and scales the fastest with chain depth.
- filtered stack output costs more than raw stack output because frame filtering runs on every read.

These numbers are machine-dependent. Use them as a relative cost snapshot and for regression comparison, not as fixed universal guarantees.

The benchmark suite lives in `bench/errorable.bench.ts`. For fresh local numbers run `npm run bench`, and for CI comparison output run `npm run bench:json`, which writes `bench/results/latest.json`.

Vitest's raw console output follows `tinybench` conventions and shows `hz`, `min`, `max`, `mean`, `p75`, `p99`, `rme`, and `samples`. In this README the results are rewritten into `us/op` and `ms/op`, which is usually easier to read if you are used to Go-style benchmark tables such as `ns/op`, `B/op`, and `allocs/op`.

The JSON report is useful when you want to compare benchmark runs in CI or post-process them into your own table format. The top-level shape looks like this:

```json
{
  "files": [
    {
      "filepath": "/path/to/bench/errorable.bench.ts",
      "groups": [
        {
          "fullName": "bench/errorable.bench.ts > microbenchmarks",
          "benchmarks": [
            {
              "name": "errorf() flat creation",
              "hz": 24010.8631757659,
              "mean": 0.04164781551915624,
              "min": 0.032999999999901775,
              "max": 1.0425000000000182,
              "p75": 0.03712499999983265,
              "p99": 0.10887499999989814,
              "rme": 3.0800002877322834,
              "sampleCount": 7204
            }
          ]
        }
      ]
    }
  ]
}
```

Useful fields in `bench/results/latest.json`:

- `files[].groups[].fullName`: benchmark suite name such as `microbenchmarks` or `depth probe`
- `files[].groups[].benchmarks[].name`: individual benchmark case name
- `hz`: operations per second
- `mean`: average time per operation in milliseconds
- `min` / `max`: fastest and slowest recorded sample in milliseconds
- `p75` / `p99`: latency percentiles in milliseconds
- `rme`: relative margin of error
- `sampleCount`: number of collected samples

## Notes

- The project targets Node.js and uses native `Error.cause`.
- Formatting follows Node's `util.format`, so `%s`, `%d`, `%j` style placeholders work.
- Errors created by `errorable()` capture stack frames at creation time and expose structured metadata helpers such as `stackFrames()`, `stacktrace()`, and `toJSON()`.
- The stacktrace model filters internal/runtime frames by default, but `stackFrames()`, `stacktrace()`, and `toJSON()` can expose all frames with `{ frameFilter: "all" }`.
