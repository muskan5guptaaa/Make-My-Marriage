import mongoose from 'mongoose';

// The saved run sheet for one day of a wedding. Only the steps the couple added or kept are
// stored; each function's start is added from the function itself whenever the plan is shown,
// so moving a function on the Functions page moves it here too.
const itemSchema = new mongoose.Schema(
  {
    time: { type: String, required: true }, // HH:mm in the wedding's timezone
    title: { type: String, required: true, trim: true },
    function: { type: mongoose.Schema.Types.ObjectId, ref: 'Function' },
    who: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { _id: false },
);

const dayPlanSchema = new mongoose.Schema(
  {
    wedding: { type: mongoose.Schema.Types.ObjectId, ref: 'Wedding', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    items: [itemSchema],
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

dayPlanSchema.index({ wedding: 1, date: 1 }, { unique: true });

export const DayPlan = mongoose.model('DayPlan', dayPlanSchema);
