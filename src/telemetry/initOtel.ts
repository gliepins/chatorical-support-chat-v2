// Optional OpenTelemetry setup. No-op if OTEL libs are not installed or not configured.
try {
  const otlpEndpoint = String((process.env as any).OTEL_EXPORTER_OTLP_ENDPOINT || '').trim();
  if (otlpEndpoint) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Resource } = require('@opentelemetry/resources');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

    const serviceName = String((process.env as any).OTEL_SERVICE_NAME || 'support-chat-v2');

    const provider = new NodeTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      }),
    });
    const exporter = new OTLPTraceExporter({ url: otlpEndpoint });
    provider.addSpanProcessor(new BatchSpanProcessor(exporter));
    provider.register();
  }
} catch {
  // ignore
}


