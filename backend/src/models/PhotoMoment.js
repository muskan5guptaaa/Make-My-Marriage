import mongoose from 'mongoose';

// The chosen best shot of one group of look-alike photos, remembered so the AI isn't asked
// again. `key` is the group's photo ids, sorted and joined: when photos join or leave the group
// the key changes, and the group starts again from the largest photo.
const photoMomentSchema = new mongoose.Schema(
  {
    wedding: { type: mongoose.Schema.Types.ObjectId, ref: 'Wedding', required: true },
    album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
    key: { type: String, required: true },
    photos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Photo' }],
    best: { type: mongoose.Schema.Types.ObjectId, ref: 'Photo', required: true },
    by: { type: String, enum: ['ai', 'you'], required: true },
    reason: { type: String, trim: true },
  },
  { timestamps: true },
);

photoMomentSchema.index({ album: 1, key: 1 }, { unique: true });
photoMomentSchema.index({ photos: 1 });

export const PhotoMoment = mongoose.model('PhotoMoment', photoMomentSchema);
