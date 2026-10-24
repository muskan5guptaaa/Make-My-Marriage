// Rewrites saved phone numbers into the +<country code><number> format.
//   npm run normalize-phones            preview only: lists what would change
//   npm run normalize-phones -- --apply  saves the changes
import mongoose from 'mongoose';
import { Guest } from '../src/models/Guest.js';
import { User } from '../src/models/User.js';
import { normalizePhone } from '../src/utils/phone.js';

const apply = process.argv.includes('--apply');
await mongoose.connect(process.env.MONGODB_URI);

for (const [label, Model] of [['Guests', Guest], ['Users', User]]) {
  const docs = await Model.find({ phone: { $nin: [null, ''] } }).select('name phone');
  const changes = [];
  const unreadable = [];
  for (const d of docs) {
    const phone = normalizePhone(d.phone);
    if (!phone) unreadable.push(d);
    else if (phone !== d.phone) changes.push({ d, phone });
  }
  console.log(`\n${label}: ${docs.length} with a phone, ${changes.length} to change, ${unreadable.length} not understood`);
  for (const { d, phone } of changes) console.log(`  ${d.name}: ${d.phone}  ->  ${phone}`);
  for (const d of unreadable) console.log(`  ${d.name}: "${d.phone}" (left as is; fix it in the app)`);
  if (apply && changes.length) {
    await Model.bulkWrite(changes.map(({ d, phone }) => ({ updateOne: { filter: { _id: d._id }, update: { $set: { phone } } } })));
    console.log(`  saved ${changes.length}`);
  }
}
if (!apply) console.log('\nPreview only. Run with --apply to save.');
await mongoose.disconnect();
