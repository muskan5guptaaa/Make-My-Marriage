import mongoose from 'mongoose';

// One row per person who can act on a wedding. An invite is a row with no acceptedAt.
// If the invited email has no account yet, `user` stays empty until they sign up with
// that email; queries match on invitedEmail meanwhile.
const weddingMemberSchema = new mongoose.Schema(
  {
    wedding: { type: mongoose.Schema.Types.ObjectId, ref: 'Wedding', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    invitedEmail: { type: String, lowercase: true, trim: true },
    role: { type: String, enum: ['owner', 'co-admin'], required: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    acceptedAt: { type: Date },
  },
  { timestamps: true },
);

weddingMemberSchema.pre('validate', function requireUserOrEmail(next) {
  if (!this.user && !this.invitedEmail) this.invalidate('user', 'A member needs a user or an invited email.');
  next();
});

// Each user holds one role per wedding; each email is invited once per wedding.
weddingMemberSchema.index(
  { wedding: 1, user: 1 },
  { unique: true, name: 'wedding_user_unique', partialFilterExpression: { user: { $type: 'objectId' } } },
);
weddingMemberSchema.index(
  { wedding: 1, invitedEmail: 1 },
  { unique: true, name: 'wedding_email_unique', partialFilterExpression: { invitedEmail: { $type: 'string' } } },
);
weddingMemberSchema.index({ user: 1 });
weddingMemberSchema.index({ invitedEmail: 1 }, { partialFilterExpression: { invitedEmail: { $type: 'string' } } });

export const WeddingMember = mongoose.model('WeddingMember', weddingMemberSchema);
