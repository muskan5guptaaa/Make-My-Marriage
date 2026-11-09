# Make My Marriage

A wedding-planning web app for Indian weddings. Couples and their family plan every function in one place: guests and RSVPs per function, tasks, budget and a shared photo gallery. Guests get a private invitation link where they RSVP and see photos, with no account needed. An AI assistant answers questions about the wedding from its own records.

**Live:** [make-my-marriage-mauve.vercel.app](https://make-my-marriage-mauve.vercel.app)

## Features

| Area | What it does |
| --- | --- |
| Weddings and team | Create a wedding, invite co-admins by email link, owner and co-admin roles, archive and restore |
| Functions | Haldi, Mehendi, Sangeet and so on, each with date, time, venue, dress code and livestream link. Archive instead of delete, so nothing is lost by accident |
| Guests | Add one by one or import from CSV. Bride or groom side, plus-ones, accommodation. Phone numbers stored in one format (+91). Bulk delete |
| RSVPs | Separate answer per function, with people count, meal preference and a note |
| Guest portal | Each guest gets a private link to see their functions and RSVP. Invitations by email or WhatsApp |
| RSVP chat (AI) | On their link, a guest can reply in their own words ("we're 3, one is Jain, can't make the Haldi"). The AI fills in each answer and asks back if unsure; the guest checks it and presses Save. It sees only that guest's own invitation |
| Tasks | Due dates, assignees, linked to a function, overdue tracking |
| Expenses | Budget against actual spend per category and function, paid by bride or groom side, payment status |
| Gallery | An album per function plus general albums. Photos upload straight to Cloudinary. The couple decides which guests can view or upload |
| Ask your wedding (AI) | Ask a question in plain words, get a short answer with links to the records it came from |
| Planning agent (AI) | Ask for changes ("move the Haldi to Sunday 10 am and tell everyone"): the assistant suggests a plan of numbered steps, you check and edit it, then every step is saved together. Guests are emailed (or sent on WhatsApp) last. One tap undoes it |
| Task plan (AI) | Draft tasks for upcoming functions with due dates counted back from each one; edit, then save |
| Day plan (AI) | An hour-by-hour run sheet for each day. Code flags clashes (functions that overlap, a tight move between venues, one person in two places, open tasks, vendors not paid); the AI drafts the steps around each function; edit, save and print |
| Smart guest import (AI) | Paste a WhatsApp list or upload a photo of a handwritten one; check the rows, then import. Phone numbers in pasted text are hidden from the AI |
| Invitation words (AI) | Pick a tone and get the email and WhatsApp invitation text; edit and save, and every invitation uses it |
| Photo search (AI) | Search the gallery by what is in the photos ("bride with grandmother at the Mehendi"). The AI describes each photo once (people by role and clothing, never by name; no face data), and a function named in the search picks its album |
| Photo moments (AI) | In an album, "Group similar shots" puts look-alike photos of the same moment together (by Cloudinary's perceptual hash, in code, no face data). The AI picks the best shot of a group on request, or you choose; then hide the rest from guests in one tap |
| Budget insights | Over-budget categories, likely duplicate payments and payments due, worked out in code; AI suggestions on where to save, on request |

## Tech stack

- **Frontend:** React 19, Vite 6, React Router 7
- **Backend:** Node.js, Express 5, Mongoose 8, zod validation, JWT session in an HTTP-only cookie
- **Database:** MongoDB Atlas (free M0 cluster)
- **Photos:** Cloudinary (signed direct uploads)
- **Email:** Gmail SMTP or Resend
- **AI:** Google Gemini API, free plan
- **Tests:** Node test runner + Supertest + in-memory MongoDB (backend); Vitest + Testing Library (frontend); GitHub Actions on every push
- **Hosting:** Vercel (frontend and backend deployed together)

All services run on free plans.

## How the AI assistant works

Every time someone asks a question, the server sends the AI a written summary of that one wedding together with the question, and tells it to answer only from that summary.

```
Question → sign-in and wedding check → load this wedding's records
        → write a summary with a label per record ([G3] guest, [F2] function…)
        → send summary + question + rules to Gemini
        → answer streams back → the page shows it with numbered sources
```

- **Only that wedding's data is sent,** and never phone numbers or emails.
- **Counts and money totals are worked out in code,** not by the AI, so the numbers are always right.
- **Text typed by guests is treated as data,** so a note like "ignore your rules" has no effect.
- **Every fact carries a label** like `[G3]`, which the page turns into a link to the source record. If the answer isn't in the data, the assistant says so instead of guessing.
- **All AI calls go through one file,** [`backend/src/utils/ai.js`](backend/src/utils/ai.js), so changing AI provider means changing only that file. Each free Gemini model allows about 20 requests a day, so the app moves to the next model in `GEMINI_MODELS` when one runs out.

**Measuring quality:** [`backend/evals/`](backend/evals/) has 50 questions about a made-up wedding whose answers are known. `npm run eval` asks the real model each question and checks the answers with simple rules (does it say "12"? does it cite the Sangeet?). Run it after changing the prompt or the data summary. 50 questions is more than one day's free allowance for one model; if it runs out, the run saves what it has and prints a `--resume` command for the next day. The V2 target is 90% correct with no answer citing a record that doesn't exist.

### Planning agent (changes with approval and undo)

When a question asks for changes, the AI calls tools (`create_task`, `update_task`, `update_expense`, `set_rsvp`, `update_function`, `message_guests`) instead of answering only. Nothing is saved at that point:

```
Request → Gemini picks tools and their order (one request: plan, then run)
        → code turns each call into a step, with the same checks as the matching page
        → the page shows the plan: numbered steps, old → new values, the message to edit
        → Apply: POST /ask/apply saves every step in one transaction (all or none)
        → then messages go out: email where possible, WhatsApp links for the rest
        → Undo: POST /ask/runs/:id/undo puts back the old values
```

- **The AI names records by their labels** (`[F2]`), so it can only point at this wedding's records. Code turns labels into ids.
- **Every step runs the same code as the page it belongs to**, with the signed-in person's own access. Archived weddings can't be changed.
- **Each plan is kept in the `agentruns` collection** with the values it replaced, but never phone numbers or emails. Undo leaves a record alone if someone edited it afterwards, and says so.
- **Messages can't be undone,** so they always go last and only after everything else has been saved.

`npm run eval -- --agent` asks the model the change requests in [`evals/agentQuestions.json`](backend/evals/agentQuestions.json) and checks that the plan has the right steps, records and values.

### Search by meaning (RAG)

Most weddings are small enough to send whole, which is the most accurate way to count. For bigger weddings (set by `AI_RAG`), each question is turned into a vector with Gemini embeddings and MongoDB Atlas Vector Search finds the 40 closest guests, tasks and expenses; only those lines are sent, while the Totals lines still count everyone.

- Vectors live in the `aichunks` collection of the same database, one per guest, task or expense, without phone numbers or emails ([`utils/aiIndex.js`](backend/src/utils/aiIndex.js)).
- The index keeps itself up to date: before answering, the server compares each record with its stored text and re-embeds only what changed.
- If the index isn't there, or embeddings fail, the whole wedding is sent instead, so Ask keeps working.

**One-time setup in Atlas:** Database → Atlas Search → Create Search Index → *Atlas Vector Search, JSON editor* → database of the app, collection `aichunks`, index name `aichunks_vector`:

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" },
    { "type": "filter", "path": "wedding" }
  ]
}
```

### Photo search

"Make photos searchable" on the Gallery sends each photo, one at a time, to Gemini as a small JPEG; the description it writes (caption, people by role, setting, tags) is turned into a vector and saved in `photodescriptions`. A search becomes a vector too and the closest photos come back. One request per photo, so a big gallery takes a few days on the free plan; described photos stay searchable.

Optional, for big galleries: create a second Atlas Vector Search index on the `photodescriptions` collection, named `photos_vector`. Without it the ranking is done in code, which is fine for a few thousand photos.

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" },
    { "type": "filter", "path": "wedding" },
    { "type": "filter", "path": "album" }
  ]
}
```

To compare the two approaches on the same questions: `npm run eval` (whole wedding) and `npm run eval -- --rag` (closest 10 records per question).

## Project structure

```
backend/
  src/
    controllers/   request handlers (ask.controller.js = AI assistant)
    models/        Mongoose schemas
    routes/        Express routers, all under /api/v1
    middleware/    auth, wedding membership, validation, errors
    utils/         ai.js, askContext.js, cloudinary, email, phone, time
    validators/    zod schemas
  test/            API tests (in-memory MongoDB, fake AI and Cloudinary)
  evals/           AI test questions and sample wedding
  scripts/         run-evals.js, normalize-phones.js
frontend/
  src/
    pages/         one folder per screen (guests, tasks, expenses, gallery, ask, portal…)
    layout/        sidebar shell and wedding context
    api.js         every call to the backend
    test/          component tests
vercel.json        deploys both apps; /api goes to the backend
```

## Run it locally

You need Node.js 20 or newer, plus free accounts on MongoDB Atlas, Cloudinary and Google AI Studio.

```bash
git clone https://github.com/muskan5guptaaa/Make-My-Marriage.git
cd Make-My-Marriage

# backend
cd backend
npm install
cp .env.example .env      # then fill in the values (see below)
npm run dev               # http://localhost:4000

# frontend, in a second terminal
cd frontend
npm install
npm run dev               # http://localhost:5173
```

The frontend forwards `/api` to the backend, so open http://localhost:5173 and register.

### Environment variables (`backend/.env`)

| Variable | What it's for |
| --- | --- |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Long random string for signing sessions |
| `WEB_APP_URL` | Where the frontend runs; used for CORS and links in emails |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Gmail SMTP (use an app password). Without them, emails are printed in the terminal |
| `RESEND_API_KEY` | Alternative to Gmail |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Photo storage |
| `GEMINI_API_KEY` | Free key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Without it, the Ask page says the assistant isn't set up |
| `GEMINI_MODELS` | Optional. Models to try in order, comma-separated |

`.env.example` explains each one. Never commit `.env`.

## Tests

```bash
cd backend && npm test        # API tests, no internet or real database needed
cd frontend && npm test       # component tests
cd backend && npm run eval    # AI quality check; uses real Gemini requests
```

GitHub Actions runs the backend tests, the frontend tests and the frontend build on every push and pull request.

## Deploy

The repo deploys to Vercel as one project with two services (see [`vercel.json`](vercel.json)): the Vite frontend, and the Express backend serving `/api`. Add the same environment variables in Vercel → Project → Settings → Environment Variables, with `WEB_APP_URL` set to the live address.

## Roadmap

- **V2 (built):** search by meaning with embeddings and Atlas Vector Search, guest-list import from a photo or pasted text, task plan generator, invitation writer, budget insights. Done when the 50-question eval passes the gate.
- **V3 (in progress):** planning agent with approval and undo (built), day-of planner (built), RSVP chat for guests (built), photo search (built), photo moments (built), eval dashboard, Hindi and English voice
