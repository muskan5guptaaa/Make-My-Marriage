import mongoose from 'mongoose';

// The guest's private invite URL. The raw token is stored (not a hash) so the link and its
// QR code can always be shown again; a leaked token only reveals one guest's invitation.
const guestLinkSchema = new mongoose.Schema(
  {
    guest: { type: mongoose.Schema.Types.ObjectId, ref: 'Guest', required: true },
    wedding: { type: mongoose.Schema.Types.ObjectId, ref: 'Wedding', required: true }, // copied, so portal checks need no join
    token: { type: String, required: true },
    revokedAt: { type: Date }, // empty while active; regenerating sets it on the old link
    lastUsedAt: { type: Date }, // updated on guest-portal visits
  },
  { timestamps: true },
);

guestLinkSchema.index({ token: 1 }, { unique: true });
guestLinkSchema.index({ guest: 1, revokedAt: 1 });

export const GuestLink = mongoose.model('GuestLink', guestLinkSchema);
