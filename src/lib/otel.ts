import { SpanStatusCode, type Span, type Tracer } from "@opentelemetry/api";

/**
 * Wrap a function in a tracing span.
 * - Preserves argument and return types.
 * - Injects the span as the last argument.
 */
export function traced<
  // Args is the tuple of the function’s arguments
  Args extends any[],
  // R is the return type (sync or async)
  R
>(
  tracer: Tracer,
  name: string,
  fn: (...args: [...Args, Span]) => R
): (...args: Args) => Promise<R> {
  return async (...args: Args): Promise<R> => {
    return tracer.startActiveSpan(name, async (span) => {
      try {
        // call the function with original args + the span
        const result = await fn(...args, span);
        return result;
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR }); // SpanStatusCode.ERROR
        throw err;
      } finally {
        span.end();
      }
    });
  };
}
