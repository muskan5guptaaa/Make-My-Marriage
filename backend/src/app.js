import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { authRouter } from './routes/auth.routes.js';
import { expenseRouter } from './routes/expense.routes.js';
import { functionRouter } from './routes/function.routes.js';
import { guestRouter } from './routes/guest.routes.js';
import { memberRouter } from './routes/member.routes.js';
import { photoRouter } from './routes/photo.routes.js';
import { portalRouter } from './routes/portal.routes.js';
import { taskRouter } from './routes/task.routes.js';
import { weddingRouter } from './routes/wedding.routes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  // credentials: true lets the React app send the session cookie.
  app.use(cors({ origin: env.webAppUrl, credentials: true }));
  app.use(express.json({ limit: '2mb' })); // CSV imports arrive as JSON text
  app.use(cookieParser());

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/v1', authRouter);
  app.use('/api/v1', weddingRouter);
  app.use('/api/v1', memberRouter);
  app.use('/api/v1', functionRouter);
  app.use('/api/v1', taskRouter);
  app.use('/api/v1', guestRouter);
  app.use('/api/v1', expenseRouter);
  app.use('/api/v1', photoRouter);
  app.use('/api/v1', portalRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
