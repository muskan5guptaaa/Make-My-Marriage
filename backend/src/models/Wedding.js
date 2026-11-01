import mongoose from 'mongoose';

const weddingSchema = new mongoose.Schema(
  {
    brideName: { type: String, required: true, trim: true },
    groomName: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    timezone: { type: String, default: 'Asia/Kolkata' },
    currency: { type: String, default: 'INR', enum: ['INR'] },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    // The couple's own invitation words; guest name, functions and link are added when sending.
    invitation: {
      email: { type: String, trim: true, maxlength: 1500 },
      whatsapp: { type: String, trim: true, maxlength: 500 },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export const Wedding = mongoose.model('Wedding', weddingSchema);
