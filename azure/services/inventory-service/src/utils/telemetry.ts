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

export const trackReservationFailure = (eventId: string, reason: string) => {
  trackEvent("ReservationFailed", { eventId, reason });
  trackMetric("ReservationFailureCount", 1);
};

export const trackInventoryMismatch = (eventId: string, expected: number, actual: number) => {
  trackEvent("InventoryMismatch", { 
    eventId, 
    expected: expected.toString(), 
    actual: actual.toString() 
  });
};

export const trackRateLimitHit = (action: string, identifier: string) => {
  trackEvent("RateLimitHit", { action, identifier });
  trackMetric("RateLimitHitCount", 1);
};
