import mongoose from 'mongoose';

// What the AI saw in one photo, and the same as a vector for search by meaning. Only words are
// stored: no face data, no names. Deleted with the photo, its album or the wedding.
const photoDescriptionSchema = new mongoose.Schema(
  {
    wedding: { type: mongoose.Schema.Types.ObjectId, ref: 'Wedding', required: true },
    album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
    photo: { type: mongoose.Schema.Types.ObjectId, ref: 'Photo', required: true },
    status: { type: String, enum: ['done', 'failed'], required: true }, // failed: the AI couldn't describe it
    caption: { type: String, trim: true },
    tags: [String],
    text: { type: String }, // what is embedded: caption, people, setting and tags together
    embedding: { type: [Number], default: undefined },
  },
  { timestamps: true },
);

photoDescriptionSchema.index({ photo: 1 }, { unique: true });
photoDescriptionSchema.index({ wedding: 1, status: 1 });

export const PhotoDescription = mongoose.model('PhotoDescription', photoDescriptionSchema);
