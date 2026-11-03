import mongoose from 'mongoose';
import { AgentRun } from '../models/AgentRun.js';
import { notFoundError } from '../utils/AppError.js';
import { applyPlan, toRun, undoPlan } from '../utils/askRun.js';

const runNotFound = () => notFoundError('run_not_found', 'These changes are not part of this wedding.');

// POST /weddings/:weddingId/ask/apply { question, steps }
// Saves the approved changes from "Ask your wedding" (all or none), then sends any messages.
export async function apply(req, res) {
  const { question, steps } = req.body;
  res.status(201).json(await applyPlan({ wedding: req.wedding, user: req.user, question, steps }));
}

// GET /weddings/:weddingId/ask/runs — the 10 latest approved plans, newest first.
export async function listRuns(req, res) {
  const runs = await AgentRun.find({ wedding: req.wedding._id }).sort({ createdAt: -1 }).limit(10).populate('createdBy', 'name');
  res.json({ data: runs.map(toRun) });
}

// POST /weddings/:weddingId/ask/runs/:runId/undo
export async function undo(req, res) {
  const { runId } = req.params;
  if (!mongoose.isValidObjectId(runId)) throw runNotFound();
  const run = await AgentRun.findOne({ _id: runId, wedding: req.wedding._id }).populate('createdBy', 'name');
  if (!run) throw runNotFound();
  res.json(await undoPlan({ run, wedding: req.wedding, user: req.user }));
}
