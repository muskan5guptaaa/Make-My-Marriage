import mongoose from 'mongoose';

// One guest, task or expense as a line of text plus its embedding, for search by meaning.
// A copy kept in step with the record by utils/aiIndex.js; the record itself stays the truth.
// Phone numbers and emails are never in the text. Atlas searches `embedding` with a vector
// index named "aichunks_vector" that filters on `wedding` (see README).
const aiChunkSchema = new mongoose.Schema(
  {
    wedding: { type: mongoose.Schema.Types.ObjectId, ref: 'Wedding', required: true },
    kind: { type: String, enum: ['guest', 'task', 'expense'], required: true },
    record: { type: mongoose.Schema.Types.ObjectId, required: true },
    text: { type: String, required: true },
    embedding: { type: [Number], default: undefined },
    needsEmbedding: { type: Boolean, default: true },
  },
  { timestamps: true },
);
aiChunkSchema.index({ wedding: 1, record: 1 }, { unique: true });
aiChunkSchema.index({ wedding: 1, needsEmbedding: 1 });

export const AiChunk = mongoose.model('AiChunk', aiChunkSchema);
