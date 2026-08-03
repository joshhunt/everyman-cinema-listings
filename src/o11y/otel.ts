import { NodeSDK } from "@opentelemetry/sdk-node";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { metrics, trace, SpanKind, type Attributes } from "@opentelemetry/api";
import { SamplingDecision, type Sampler } from "@opentelemetry/sdk-trace-base";
import { ATTR_HTTP_ROUTE } from "@opentelemetry/semantic-conventions";
import { logger } from "./logger.ts";

const SERVICE_NAME = "everyman-cinema-listings";

/**
 * Drop server spans for /metrics. A Prometheus scrape every few seconds would
 * otherwise be most of the trace volume, and says nothing about the app.
 */
const ignoreMetricsScrapes: Sampler = {
  shouldSample(_ctx, _traceId, _spanName, spanKind, attributes: Attributes) {
    if (spanKind === SpanKind.SERVER && attributes[ATTR_HTTP_ROUTE] === "/metrics") {
      return { decision: SamplingDecision.NOT_RECORD };
    }
    return { decision: SamplingDecision.RECORD_AND_SAMPLED };
  },
  toString() {
    return "IgnoreMetricsScrapes";
  },
};

// Prometheus metrics are served through the app's own /metrics route rather
// than the exporter's built-in server, so everything is on one port.
export const prometheusExporter = new PrometheusExporter({
  preventServerStart: true,
});

// Traces are only exported when an OTLP endpoint is configured.
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

const sdk = new NodeSDK({
  serviceName: SERVICE_NAME,
  metricReader: prometheusExporter,
  traceExporter: otlpEndpoint ? new OTLPTraceExporter() : undefined,
  sampler: ignoreMetricsScrapes,
  instrumentations: [
    new HttpInstrumentation(),
    new UndiciInstrumentation(),
  ],
});

sdk.start();
logger.info({ otlpEndpoint: otlpEndpoint ?? null }, "otel started");

process.on("SIGTERM", () => {
  sdk.shutdown().finally(() => process.exit(0));
});

export const tracer = trace.getTracer(SERVICE_NAME);
const meter = metrics.getMeter(SERVICE_NAME);

export const httpRequestDuration = meter.createHistogram(
  "http_request_duration_seconds",
  {
    description: "Duration of handled HTTP requests",
    unit: "s",
    advice: { explicitBucketBoundaries: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5] },
  },
);

export const upstreamFetchDuration = meter.createHistogram(
  "everyman_upstream_fetch_duration_seconds",
  {
    description: "Duration of fetches to Everyman upstream endpoints",
    unit: "s",
    advice: { explicitBucketBoundaries: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] },
  },
);

export const upstreamFetchErrors = meter.createCounter(
  "everyman_upstream_fetch_errors_total",
  { description: "Failed fetches to Everyman upstream endpoints" },
);

export const cacheEvents = meter.createCounter("everyman_cache_events_total", {
  description: "Cache lookups by resource and result (hit, stale, miss)",
});

export const sessionRefreshes = meter.createCounter(
  "everyman_session_refreshes_total",
  { description: "Member session token refreshes by result" },
);

export const tmdbLookups = meter.createCounter("everyman_tmdb_lookups_total", {
  description: "TMDB runtime lookups by result (hit, miss, error)",
});

export const bookingRedirects = meter.createCounter(
  "everyman_booking_redirects_total",
  { description: "Booking link clicks by whether a member session was attached" },
);

// Age of each cached resource, labelled by cache key. Registered callbacks
// are provided by the cache module.
export const cacheAgeGauge = meter.createObservableGauge(
  "everyman_cache_age_seconds",
  { description: "Age of cached upstream resources" },
);

/** Run an async function inside a span, recording errors. */
export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number>,
  fn: () => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn();
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: 2, message: String(err) });
      throw err;
    } finally {
      span.end();
    }
  });
}
