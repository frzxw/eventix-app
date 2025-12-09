import * as appInsights from "applicationinsights";

// Initialize Application Insights
export const initTelemetry = () => {
  if (process.env.APPINSIGHTS_CONNECTION_STRING) {
    appInsights.setup(process.env.APPINSIGHTS_CONNECTION_STRING)
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
};

export const defaultClient = appInsights.defaultClient;

export const trackEvent = (name: string, properties?: { [key: string]: string }) => {
  if (defaultClient) {
    defaultClient.trackEvent({ name, properties });
  }
};

export const trackMetric = (name: string, value: number) => {
  if (defaultClient) {
    defaultClient.trackMetric({ name, value });
  }
};

export const trackException = (exception: Error, properties?: { [key: string]: string }) => {
  if (defaultClient) {
    defaultClient.trackException({ exception, properties });
  }
};

export const trackIdempotencyConflict = (key: string, reason: string) => {
  trackEvent("IdempotencyConflict", { key, reason });
};
