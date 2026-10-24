import express from 'express';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { env } from './config/env.js';

// Entry point on Vercel, where the API runs as on-demand functions instead of a long-running
// server (server.js is still what `npm run dev` and `npm start` use). The database connection
// is opened on the first request and reused while the function stays warm.

let connecting;
function connect() {
  if (mongoose.connection.readyState === 1) return undefined;
  connecting ??= mongoose.connect(env.mongodbUri()).catch((err) => {
    connecting = undefined; // let the next request try again
    throw err;
  });
  return connecting;
}

const app = express();
app.use(async (_req, _res, next) => {
  await connect();
  next();
});
app.use(createApp());

export default app;
