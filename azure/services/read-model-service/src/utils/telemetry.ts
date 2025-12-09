import * as appInsights from 'applicationinsights';

export function initTelemetry() {
  if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
    appInsights.setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
      .setAutoDependencyCorrelation(true)
      .setAutoCollectRequests(true)
      .setAutoCollectPerformance(true, true)
      .setAutoCollectExceptions(true)
      .setAutoCollectDependencies(true)
      .setAutoCollectConsole(true)
      .setUseDiskRetryCaching(true)
      .setSendLiveMetrics(true)
      .setDistributedTracingMode(appInsights.DistributedTracingModes.AI_AND_W3C)
      .start();
  }
}

export function trackException(error: Error) {
  const client = appInsights.defaultClient;
  if (client) {
    client.trackException({ exception: error });
  }
}
