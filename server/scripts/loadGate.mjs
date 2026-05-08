import autocannon from "autocannon";

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function printScenarioHeader(scenario) {
  console.log(`\n[load-gate] scenario=${scenario.name} url=${scenario.url}`);
  console.log(
    `[load-gate] connections=${scenario.connections} duration=${scenario.duration}s pipelining=${scenario.pipelining} connectionRate=${scenario.connectionRate}`
  );
}

function getRequestsTotal(result, durationSec) {
  const directTotal = Number(result?.requests?.total || 0);
  if (directTotal > 0) return directTotal;
  const avgReqPerSec = Number(result?.requests?.average || 0);
  return Math.max(0, Math.round(avgReqPerSec * durationSec));
}

function getAttemptedTotal(result, durationSec) {
  const requestTotal = getRequestsTotal(result, durationSec);
  const statusBucketsTotal =
    Number(result?.["1xx"] || 0) +
    Number(result?.["2xx"] || 0) +
    Number(result?.["3xx"] || 0) +
    Number(result?.["4xx"] || 0) +
    Number(result?.["5xx"] || 0) +
    Number(result?.non2xx || 0);

  return Math.max(requestTotal, statusBucketsTotal, 1);
}

function buildScenarios(baseUrl) {
  const duration = toNumber(process.env.LOAD_DURATION_SECONDS, 20);
  const pipelining = toNumber(process.env.LOAD_PIPELINING, 1);

  return [
    {
      name: "health",
      url: `${baseUrl}/health`,
      connections: toNumber(process.env.LOAD_HEALTH_CONNECTIONS, 800),
      duration,
      pipelining,
      connectionRate: toNumber(process.env.LOAD_HEALTH_CONNECTION_RATE, 3),
      thresholds: {
        p95: toNumber(process.env.LOAD_HEALTH_MAX_P95_MS, 350),
        p99: toNumber(process.env.LOAD_HEALTH_MAX_P99_MS, 900),
        errorRate: toNumber(process.env.LOAD_HEALTH_MAX_ERROR_RATE, 0.02),
      },
    },
    {
      name: "public-homepage",
      url: `${baseUrl}/public/homepage`,
      connections: toNumber(process.env.LOAD_PUBLIC_CONNECTIONS, 800),
      duration,
      pipelining,
      connectionRate: toNumber(process.env.LOAD_PUBLIC_CONNECTION_RATE, 1),
      thresholds: {
        p95: toNumber(process.env.LOAD_PUBLIC_MAX_P95_MS, 450),
        p99: toNumber(process.env.LOAD_PUBLIC_MAX_P99_MS, 1200),
        errorRate: toNumber(process.env.LOAD_PUBLIC_MAX_ERROR_RATE, 0.03),
      },
    },
  ];
}

async function runScenario(scenario) {
  printScenarioHeader(scenario);

  const result = await autocannon({
    url: scenario.url,
    connections: scenario.connections,
    duration: scenario.duration,
    pipelining: scenario.pipelining,
    connectionRate: scenario.connectionRate > 0 ? scenario.connectionRate : undefined,
  });

  const p95 = Number(result?.latency?.p95 || 0);
  const p99 = Number(result?.latency?.p99 || 0);
  const failures = Number(result?.errors || 0) + Number(result?.timeouts || 0) + Number(result?.non2xx || 0);
  const total = Math.max(getAttemptedTotal(result, scenario.duration), failures, 1);
  const errorRate = failures / total;

  console.log(
    `[load-gate] ${scenario.name} metrics p95=${p95}ms p99=${p99}ms errorRate=${(errorRate * 100).toFixed(2)}% total=${total}`
  );

  const checks = [
    {
      label: "p95",
      pass: p95 <= scenario.thresholds.p95,
      actual: `${p95}ms`,
      expected: `<= ${scenario.thresholds.p95}ms`,
    },
    {
      label: "p99",
      pass: p99 <= scenario.thresholds.p99,
      actual: `${p99}ms`,
      expected: `<= ${scenario.thresholds.p99}ms`,
    },
    {
      label: "errorRate",
      pass: errorRate <= scenario.thresholds.errorRate,
      actual: `${(errorRate * 100).toFixed(2)}%`,
      expected: `<= ${(scenario.thresholds.errorRate * 100).toFixed(2)}%`,
    },
  ];

  for (const check of checks) {
    console.log(
      `[load-gate] ${scenario.name} ${check.label} ${check.pass ? "PASS" : "FAIL"} actual=${check.actual} expected=${check.expected}`
    );
  }

  return checks.every((check) => check.pass);
}

async function main() {
  const baseUrl = String(process.env.LOAD_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:6001").replace(
    /\/$/,
    ""
  );

  const scenarios = buildScenarios(baseUrl);
  let failed = false;

  for (const scenario of scenarios) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await runScenario(scenario);
    if (!ok) failed = true;
  }

  if (failed) {
    console.error("\n[load-gate] FAIL one or more scenarios missed thresholds.");
    process.exit(1);
  }

  console.log("\n[load-gate] PASS all scenarios within thresholds.");
}

main().catch((error) => {
  console.error("[load-gate] Unexpected error", error);
  process.exit(1);
});
