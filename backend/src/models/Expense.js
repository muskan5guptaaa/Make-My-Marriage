import mongoose from 'mongoose';

// Per-wedding categories such as Catering or Decor.
const expenseCategorySchema = new mongoose.Schema(
  {
    wedding: { type: mongoose.Schema.Types.ObjectId, ref: 'Wedding', required: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);
// Unique per wedding, ignoring case ("Decor" and "decor" are the same category).
expenseCategorySchema.index({ wedding: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

// One budget line. Money is whole paise (₹1 = 100 paise), never a float.
const expenseSchema = new mongoose.Schema(
  {
    wedding: { type: mongoose.Schema.Types.ObjectId, ref: 'Wedding', required: true },
    function: { type: mongoose.Schema.Types.ObjectId, ref: 'Function' },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseCategory', required: true },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' }, // linked once Vendors exist
    vendorName: { type: String, required: true, trim: true }, // typed, or copied from the Vendor
    budgetedAmountPaise: { type: Number, required: true, min: 0 },
    actualAmountPaise: { type: Number, default: 0, min: 0 },
    paidBy: { type: String, enum: ['bride-side', 'groom-side', 'shared'], default: 'shared' },
    paymentStatus: { type: String, enum: ['pending', 'partial', 'paid'], default: 'pending' },
    dueDate: { type: String }, // YYYY-MM-DD
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);
expenseSchema.index({ wedding: 1, function: 1 });
expenseSchema.index({ wedding: 1, category: 1 });

export const ExpenseCategory = mongoose.model('ExpenseCategory', expenseCategorySchema);
export const Expense = mongoose.model('Expense', expenseSchema);
