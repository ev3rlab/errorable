import { bench, describe } from "vitest";

import { errorable } from "../src/index.js";

const DEFAULT_TIME_MS = 300;
const DEFAULT_WARMUP_MS = 100;
const DEEP_TIME_MS = 150;
const DEEP_WARMUP_MS = 50;

describe("microbenchmarks", () => {
  bench("errorf() flat creation", () => {
    errorable().errorf("plain failure");
  }, timed());

  bench("wrap() plain Error", () => {
    errorable().wrap(new Error("plain cause"));
  }, timed());

  bench("wrapf() create depth=10 chain", () => {
    createWrappedChain(10, { codePlacement: "leaf" });
  }, timed(DEEP_TIME_MS, DEEP_WARMUP_MS));

  const firstHitChain = createWrappedChain(25, { codePlacement: "outer" });
  bench("code() first-hit depth=25", () => {
    firstHitChain.code();
  }, timed());

  const fallbackChain = createWrappedChain(25, { codePlacement: "leaf" });
  bench("code() fallback-to-cause depth=25", () => {
    fallbackChain.code();
  }, timed());

  const deepestCodeChain = createWrappedChain(25, { codePlacement: "all" });
  bench('code({ codeSource: "deepest" }) depth=25', () => {
    deepestCodeChain.code({ codeSource: "deepest" });
  }, timed());

  const filteredJsonChain = createWrappedChain(10, { codePlacement: "all" });
  bench("toJSON() filtered depth=10", () => {
    filteredJsonChain.toJSON();
  }, timed());

  const rawJsonChain = createWrappedChain(10, { codePlacement: "all" });
  bench('toJSON({ frameFilter: "all" }) depth=10', () => {
    rawJsonChain.toJSON({ frameFilter: "all" });
  }, timed());

  const filteredStacktraceChain = createWrappedChain(10, { codePlacement: "all" });
  bench("stacktrace() filtered depth=10", () => {
    filteredStacktraceChain.stacktrace();
  }, timed(DEEP_TIME_MS, DEEP_WARMUP_MS));

  const rawStacktraceChain = createWrappedChain(10, { codePlacement: "all" });
  bench('stacktrace({ frameFilter: "all" }) depth=10', () => {
    rawStacktraceChain.stacktrace({ frameFilter: "all" });
  }, timed(DEEP_TIME_MS, DEEP_WARMUP_MS));
});

describe("depth sweep", () => {
  for (const depth of [1, 10, 100, 500]) {
    bench(`create wrapped chain depth=${depth}`, () => {
      createWrappedChain(depth, { codePlacement: "all" });
    }, timed(depth >= 100 ? DEEP_TIME_MS : DEFAULT_TIME_MS, depth >= 100 ? DEEP_WARMUP_MS : DEFAULT_WARMUP_MS));

    const chain = createWrappedChain(depth, { codePlacement: "all" });

    bench(`code() depth=${depth}`, () => {
      chain.code();
    }, timed(depth >= 500 ? DEEP_TIME_MS : DEFAULT_TIME_MS, depth >= 500 ? DEEP_WARMUP_MS : DEFAULT_WARMUP_MS));

    bench(`toJSON() depth=${depth}`, () => {
      chain.toJSON();
    }, timed(depth >= 100 ? DEEP_TIME_MS : DEFAULT_TIME_MS, depth >= 100 ? DEEP_WARMUP_MS : DEFAULT_WARMUP_MS));

    bench(`stacktrace() depth=${depth}`, () => {
      chain.stacktrace();
    }, timed(depth >= 100 ? DEEP_TIME_MS : DEFAULT_TIME_MS, depth >= 100 ? DEEP_WARMUP_MS : DEFAULT_WARMUP_MS));
  }
});

describe("depth probe", () => {
  for (const depth of [1_000, 2_000, 4_000]) {
    bench(`create wrapped chain depth=${depth}`, () => {
      createWrappedChain(depth, { codePlacement: "all" });
    }, timed(DEEP_TIME_MS, DEEP_WARMUP_MS));

    const chain = createWrappedChain(depth, { codePlacement: "all" });

    bench(`code() depth=${depth}`, () => {
      chain.code();
    }, timed(DEEP_TIME_MS, DEEP_WARMUP_MS));

    bench(`code({ codeSource: "deepest" }) depth=${depth}`, () => {
      chain.code({ codeSource: "deepest" });
    }, timed(DEEP_TIME_MS, DEEP_WARMUP_MS));
  }
});

function timed(time = DEFAULT_TIME_MS, warmupTime = DEFAULT_WARMUP_MS) {
  return {
    time,
    warmupTime,
  };
}

function createWrappedChain(depth: number, options: { codePlacement?: "none" | "leaf" | "outer" | "all" } = {}) {
  const codePlacement = options.codePlacement ?? "none";
  let current = createLeafError(codePlacement);

  for (let level = 1; level <= depth; level += 1) {
    let builder = errorable()
      .with("level", level)
      .tags(`layer-${level % 4}`)
      .in(`layer-${level}`);

    if (codePlacement === "all" || (codePlacement === "outer" && level === depth)) {
      builder = builder.code(`WRAP_${level}`);
    }

    current = builder.wrapf(current, "wrap layer %d", level)!;
  }

  return current;
}

function createLeafError(codePlacement: "none" | "leaf" | "outer" | "all") {
  let builder = errorable()
    .in("leaf")
    .with("query", "SELECT 1")
    .public("Temporary error")
    .hint("check leaf storage");

  if (codePlacement === "all" || codePlacement === "leaf") {
    builder = builder.code("LEAF_FAILURE");
  }

  return builder.errorf("leaf failure");
}
