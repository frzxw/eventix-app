import * as appInsights from "applicationinsights";

// Initialize Application Insights
// This should be called as early as possible in the application lifecycle
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

// Specific Ticket War Metrics
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
