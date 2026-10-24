import mongoose from 'mongoose';

// An album per function (made automatically) or a general one the couple names.
const albumSchema = new mongoose.Schema(
  {
    wedding: { type: mongoose.Schema.Types.ObjectId, ref: 'Wedding', required: true },
    function: { type: mongoose.Schema.Types.ObjectId, ref: 'Function' }, // empty: a general album
    name: { type: String, required: true, trim: true },
    coverPhoto: { type: mongoose.Schema.Types.ObjectId, ref: 'Photo' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
albumSchema.index({ wedding: 1, function: 1 });

// One uploaded image. The record is made when the upload is signed (pending) and completed
// once Cloudinary has the file, so abandoned uploads can be found and removed.
const photoSchema = new mongoose.Schema(
  {
    wedding: { type: mongoose.Schema.Types.ObjectId, ref: 'Wedding', required: true }, // copied from the album
    album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
    uploaderType: { type: String, enum: ['member', 'guest'], required: true },
    uploaderId: { type: mongoose.Schema.Types.ObjectId, required: true }, // a User or a Guest
    uploaderName: { type: String, trim: true },
    publicId: { type: String, required: true }, // Cloudinary id: mmm/weddings/<w>/albums/<a>/<photo>
    format: { type: String },
    width: { type: Number },
    height: { type: Number },
    sizeBytes: { type: Number },
    version: { type: Number },
    status: { type: String, enum: ['pending', 'complete'], default: 'pending' },
    hidden: { type: Boolean, default: false }, // moderation: hidden from guests
    uploadedAt: { type: Date },
  },
  { timestamps: true },
);
photoSchema.index({ album: 1, hidden: 1, uploadedAt: -1 });
photoSchema.index({ publicId: 1 }, { unique: true });
photoSchema.index({ status: 1, createdAt: 1 });

export const Album = mongoose.model('Album', albumSchema);
export const Photo = mongoose.model('Photo', photoSchema);
