const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
};

export const env = {
  port: Number(process.env.PORT ?? 4000),
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  mongodbUri: () => required('MONGODB_URI'),
  jwtSecret: () => required('JWT_SECRET'),
  sessionDays: Number(process.env.SESSION_DAYS ?? 7),
  webAppUrl: process.env.WEB_APP_URL ?? 'http://localhost:5173',
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  emailFrom: process.env.EMAIL_FROM ?? '',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
    apiKey: process.env.CLOUDINARY_API_KEY ?? '',
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
    // Tried in order. The free plan allows each model about 20 requests a day, so when one
    // runs out the next one answers.
    models: (process.env.GEMINI_MODELS || 'gemini-2.5-flash-lite,gemini-3.5-flash-lite,gemini-3.5-flash')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
    // Turns records into vectors for search by meaning (free on the same key).
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
  },
  ai: {
    // Search by meaning for "Ask your wedding":
    //   auto   — only for weddings too big to send whole (most weddings are sent whole)
    //   always — every question, when the index is ready (to compare on the eval set)
    //   off    — always send the whole wedding
    // Whenever search isn't ready or fails, the whole wedding is sent instead.
    rag: ['auto', 'always', 'off'].includes(process.env.AI_RAG) ? process.env.AI_RAG : 'auto',
    ragMinChars: Number(process.env.AI_RAG_MIN_CHARS ?? 30_000),
  },
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 465),
    user: process.env.SMTP_USER ?? '',
    pass: (process.env.SMTP_PASS ?? '').replace(/\s+/g, ''), // Gmail shows app passwords with spaces
  },
};
