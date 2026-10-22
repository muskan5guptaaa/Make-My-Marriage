import mongoose from 'mongoose';

// A wedding event such as Haldi or Sangeet. localDate/startTime are wall-clock values in the
// wedding's timezone; startsAt is derived from them on every write and drives sorting.
const functionSchema = new mongoose.Schema(
  {
    wedding: { type: mongoose.Schema.Types.ObjectId, ref: 'Wedding', required: true },
    name: { type: String, required: true, trim: true },
    localDate: { type: String, required: true }, // YYYY-MM-DD
    startTime: { type: String }, // HH:mm, optional
    startsAt: { type: Date, required: true },
    venue: { type: String, trim: true },
    address: { type: String, trim: true },
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 },
    placeId: { type: String },
    dressCode: { type: String, trim: true },
    description: { type: String, trim: true },
    order: { type: Number, default: 0 },
    livestreamUrl: { type: String },
    livestreamVideoId: { type: String },
  },
  { timestamps: true },
);

functionSchema.index({ wedding: 1, startsAt: 1 });

// Named WeddingFunction in code because `Function` is a JavaScript global.
export const WeddingFunction = mongoose.model('Function', functionSchema);
