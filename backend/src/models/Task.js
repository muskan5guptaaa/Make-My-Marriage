import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema(
  {
    wedding: { type: mongoose.Schema.Types.ObjectId, ref: 'Wedding', required: true },
    function: { type: mongoose.Schema.Types.ObjectId, ref: 'Function' }, // empty: a wedding-wide task
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // must be a member of the wedding
    dueDate: { type: String }, // YYYY-MM-DD in the wedding's timezone
    status: { type: String, enum: ['todo', 'in-progress', 'done'], default: 'todo' },
    completedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

taskSchema.index({ wedding: 1, status: 1 });
taskSchema.index({ wedding: 1, assignee: 1 });

export const Task = mongoose.model('Task', taskSchema);
