import mongoose from 'mongoose';

// One answer per invited function, kept inside the guest.
const rsvpSchema = new mongoose.Schema(
  {
    function: { type: mongoose.Schema.Types.ObjectId, ref: 'Function', required: true },
    status: { type: String, enum: ['pending', 'yes', 'no'], default: 'pending' },
    plusOnes: { type: Number, default: 0, min: 0 }, // 0 up to the guest's plusOnesAllowed
    mealPreference: { type: String, trim: true },
    note: { type: String, trim: true }, // the guest's own words
    respondedAt: { type: Date },
  },
  { _id: false },
);

// One per person. RSVPs are per function.
const guestSchema = new mongoose.Schema(
  {
    wedding: { type: mongoose.Schema.Types.ObjectId, ref: 'Wedding', required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    side: { type: String, enum: ['bride', 'groom', 'both'], default: 'both' },
    groupTag: { type: String, enum: ['family', 'friends', 'colleagues', 'other'], default: 'other' },
    invitedFunctions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Function' }],
    plusOnesAllowed: { type: Number, default: 0, min: 0 },
    rsvps: [rsvpSchema],
    accommodationNeeded: { type: Boolean, default: false },
    travelNotes: { type: String, trim: true },
    notes: { type: String, trim: true },
    invitationSentAt: { type: Date }, // last time their link was emailed to them
  },
  { timestamps: true },
);

guestSchema.index({ wedding: 1 });
guestSchema.index({ wedding: 1, invitedFunctions: 1 });

export const Guest = mongoose.model('Guest', guestSchema);
