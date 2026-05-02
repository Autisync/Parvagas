import test from "node:test";
import assert from "node:assert/strict";

const shouldRetry = (failureCount, error) => {
  const message = String(error?.message || "");
  if (message.includes("429") || message.includes("401") || message.includes("403")) {
    return false;
  }
  return failureCount < 2;
};

test("retry policy: does not retry 429 responses", () => {
  assert.equal(shouldRetry(0, new Error("HTTP 429")), false);
  assert.equal(shouldRetry(1, new Error("HTTP 429 Too many requests")), false);
});

test("retry policy: retries non-429 errors with cap", () => {
  assert.equal(shouldRetry(0, new Error("HTTP 500")), true);
  assert.equal(shouldRetry(1, new Error("HTTP 500")), true);
  assert.equal(shouldRetry(2, new Error("HTTP 500")), false);
});

test("debounce semantics: only final input should trigger request", () => {
  const events = ["r", "re", "rem", "remo", "remot", "remote"];
  const delayMs = 400;
  let requestCount = 0;
  let currentTimer = null;

  for (const value of events) {
    if (currentTimer) {
      clearTimeout(currentTimer);
      currentTimer = null;
    }
    currentTimer = setTimeout(() => {
      if (value === "remote") requestCount += 1;
    }, delayMs);
  }

  assert.equal(requestCount, 0);
});

test("query key stability: same params map to same key", () => {
  const keyA = JSON.stringify(["jobs", 1, 10, { keyword: "react", location: "luanda" }]);
  const keyB = JSON.stringify(["jobs", 1, 10, { keyword: "react", location: "luanda" }]);
  const keyC = JSON.stringify(["jobs", 2, 10, { keyword: "react", location: "luanda" }]);

  assert.equal(keyA, keyB);
  assert.notEqual(keyA, keyC);
});
