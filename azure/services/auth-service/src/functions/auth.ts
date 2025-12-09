import { app } from '@azure/functions';
import {
  signupHandler,
  loginHandler,
  verifyEmailHandler,
  forgotPasswordHandler,
  logoutHandler,
  refreshTokenHandler,
} from '../handlers/auth';
import { initTelemetry } from '../utils/telemetry';

initTelemetry();

app.http('signup', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/signup',
  handler: signupHandler,
});

app.http('login', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/login',
  handler: loginHandler,
});

app.http('verifyEmail', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/verify-email',
  handler: verifyEmailHandler,
});

app.http('forgotPassword', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/forgot-password',
  handler: forgotPasswordHandler,
});

app.http('logout', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/logout',
  handler: logoutHandler,
});

app.http('refreshToken', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/refresh-token',
  handler: refreshTokenHandler,
});
