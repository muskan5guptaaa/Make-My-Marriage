import mongoose from 'mongoose';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { cleanupAbandonedUploads } from './controllers/photo.controller.js';
import { photosReady } from './utils/cloudinary.js';
import { emailMode } from './utils/email.js';

env.jwtSecret(); // fail at startup, not on the first sign-in
await mongoose.connect(env.mongodbUri());
console.log('Connected to MongoDB');
// Make the database's indexes match the schemas (adds new ones, drops ones no longer defined).
await mongoose.connection.syncIndexes();

createApp().listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}/api/v1`);
  console.log(
    emailMode === 'console'
      ? 'Email: not set up. Emails are printed here and not delivered. See SMTP_* in .env.example.'
      : `Email: sending through ${emailMode}.`,
  );
});

// Uploads that were started but never finished are removed after a day.
if (photosReady()) {
  const sweep = () => cleanupAbandonedUploads().catch((err) => console.error('Photo cleanup failed:', err.message));
  sweep();
  setInterval(sweep, 60 * 60 * 1000).unref();
}
