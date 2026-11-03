import mongoose from 'mongoose';

// One plan from "Ask your wedding" that someone approved: what each step changed, and the values
// it replaced, so the whole plan can be undone later. Messages sent to guests are kept as counts
// only (no phones or emails), and can't be undone.
const stepSchema = new mongoose.Schema(
  {
    kind: { type: String, required: true }, // createTask, updateTask, updateExpense, setRsvp, updateFunction, messageGuests
    title: { type: String, required: true },
    changes: [String],
    ids: { type: mongoose.Schema.Types.Mixed, default: {} },
    record: { type: mongoose.Schema.Types.ObjectId }, // the task, expense, guest or function it changed
    before: { type: mongoose.Schema.Types.Mixed }, // only the fields it changed; null for a new task
    after: { type: mongoose.Schema.Types.Mixed },
    result: { type: mongoose.Schema.Types.Mixed }, // messages: { emailed, notEmailed }
    undo: { type: String, enum: ['undone', 'changed', 'gone', 'not-possible'] },
  },
  { _id: false, minimize: false },
);

const agentRunSchema = new mongoose.Schema(
  {
    wedding: { type: mongoose.Schema.Types.ObjectId, ref: 'Wedding', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    question: { type: String },
    steps: [stepSchema],
    undoneAt: { type: Date },
    undoneBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

agentRunSchema.index({ wedding: 1, createdAt: -1 });

export const AgentRun = mongoose.model('AgentRun', agentRunSchema);
