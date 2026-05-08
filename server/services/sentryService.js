import * as Sentry from "@sentry/node";

let sentryEnabled = false;

export function initSentry() {
  const dsn = String(process.env.SENTRY_DSN || "").trim();
  if (!dsn) {
    console.warn("[sentry] SENTRY_DSN is not configured. Error tracking is disabled.");
    sentryEnabled = false;
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0,
  });

  sentryEnabled = true;
}

export function captureSentryException(error, context = {}) {
  if (!sentryEnabled || !error) return;
  Sentry.withScope((scope) => {
    Object.entries(context || {}).forEach(([key, value]) => scope.setExtra(key, value));
    Sentry.captureException(error);
  });
}

export function captureSentryMessage(message, context = {}, level = "warning") {
  if (!sentryEnabled || !message) return;
  Sentry.withScope((scope) => {
    scope.setLevel(level);
    Object.entries(context || {}).forEach(([key, value]) => scope.setExtra(key, value));
    Sentry.captureMessage(String(message));
  });
}

export function isSentryEnabled() {
  return sentryEnabled;
}
