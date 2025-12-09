import { app } from '@azure/functions';
import {
  listEventsHandler,
  getEventHandler,
  featuredEventsHandler,
  searchEventsHandler,
} from '../handlers/events';
import { initTelemetry } from '../utils/telemetry';

initTelemetry();

app.http('listEvents', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'events',
  handler: listEventsHandler,
});

app.http('getEvent', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'events/{id}',
  handler: getEventHandler,
});

app.http('featuredEvents', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'events/featured',
  handler: featuredEventsHandler,
});

app.http('searchEvents', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'search',
  handler: searchEventsHandler,
});
