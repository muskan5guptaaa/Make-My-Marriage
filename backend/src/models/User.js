import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    globalRole: { type: String, enum: ['user', 'superadmin'], default: 'user' },

    // Password reset: only the SHA-256 of the emailed token is stored, unlike guest
    // links, because a reset link never needs to be rebuilt.
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
    // Sessions issued before this moment are rejected, so a reset signs out everywhere.
    passwordChangedAt: { type: Date },
  },
  { timestamps: true },
);

userSchema.index({ passwordResetTokenHash: 1 }, { sparse: true });

userSchema.methods.toPublic = function toPublic() {
  return {
    _id: this._id,
    name: this.name,
    email: this.email,
    phone: this.phone ?? null,
    globalRole: this.globalRole,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model('User', userSchema);
