# CLAUDE.md

This file tells you how to work in this repo. Read it fully before every task.

It only describes the process. Everything about the project itself (what it does, how the code is laid out, what the database looks like) lives in the project files below. Read them instead of assuming.

## The project files

Five files in the repo root, plus a `README.md` in each folder, keep you (and the team) from guessing. Each has one job:

| File | What it holds | When you read it | When you update it |
|---|---|---|---|
| `business.md` | The business logic: roles, flows, rules (who can do what, what states a visit goes through, what the AI may and may not do) | Before writing or changing any feature | When a rule is added, changed or clarified |
| `schema.md` | The database: databases, schemas, DB users and access, every table, column, type, key and index | Before writing any query, model, migration or API that touches data | In the same change as any migration or schema file edit |
| `structure.md` | The architecture and stack, where things live in the codebase, and the rules for where code goes | At the start of every task, to find the right files | Whenever the architecture or stack changes, or a file or folder that matters is added, moved, renamed or deleted |
| `changelog.md` | Every change made to the codebase, with date and time | When you need to know what changed recently or why | After every change, before you finish |
| `prompt_log.md` | Every prompt given to the agent, word for word, who wrote it, and the changes it caused | When you need the reason behind a change | At the start of every prompt (log it) and at the end (link the changes) |
| Folder `README.md` | What that folder is for, its rules, and what each file in it does (`structure.md` says which folders have one) | Before working in a folder | Whenever you add, change the purpose of, rename or delete a file in that folder |

## Rules

### 1. Never guess the schema or the business rules
- If a table, column or relation isn't in `schema.md`, it doesn't exist. Don't invent it. Either add it properly (migration + `schema.md`) or ask.
- If `schema.md` and the actual schema files (`structure.md` says where they are) disagree, stop and tell the user. Don't pick one silently.
- If a rule isn't in `business.md`, or the code contradicts it, ask before deciding. Then record the answer in `business.md`.
- If a file isn't where `structure.md` says, or the code doesn't follow its rules for where code goes, stop and tell the user.

### 2. Every prompt follows this loop

**At the start**
1. Get the current time with `date "+%Y-%m-%d %H:%M %z"`. Never make up a timestamp.
2. Get the author with `git config user.name`. If it isn't set, ask who is writing the prompt.
3. Add an entry to `prompt_log.md` with the next prompt ID, the timestamp, the author and the prompt, word for word.
4. Read `structure.md`, then the parts of `business.md` and `schema.md` your task touches, then the `README.md` of each folder you'll work in.

**While working**
5. Make the change.

**Before you finish**
6. Add one entry to `changelog.md` for each logical change, with the next change ID and the prompt ID that caused it.
7. Update `schema.md` if the database changed.
8. Update `structure.md` if the architecture or stack changed, or files or folders were added, moved, renamed or deleted.
9. Update the `README.md` of every folder where you added, renamed or deleted a file, or changed what a file does. A new folder (only after the user agrees) gets its own `README.md` in the same change.
10. Update `business.md` if a rule was added, changed or clarified.
11. Go back to the prompt's entry in `prompt_log.md` and fill in the change IDs (or `none` if nothing in the repo changed).

This applies to every prompt, including small fixes and prompts that only ask a question. A question with no code change still gets a `prompt_log.md` entry with `Changes: none`.

### 3. IDs and links
- Prompts are numbered `P-0001`, `P-0002`, ... in `prompt_log.md`.
- Changes are numbered `C-0001`, `C-0002`, ... in `changelog.md`.
- Every change names its prompt (`Prompt: P-0007`), and every prompt lists its changes (`Changes: C-0012, C-0013`). Both directions must match.
- Look at the newest entry (the top one) in each file to get the next number. Never reuse or renumber IDs.

### 4. Keeping the logs honest
- Newest entries go at the **top** of `changelog.md` and `prompt_log.md`.
- Never edit or delete old entries. If something was wrong, add a new entry that corrects it.
- Log prompts word for word, but replace passwords, API keys, tokens and real personal data with `[REDACTED]`.
- Changelog entries describe what changed and why in plain words, and list the files touched.
- Project-file and folder README updates (steps 7 to 10) count as part of the change that caused them. They don't need their own changelog entry.

### 5. Don't edit this file
This file only changes when the team changes the process itself. Facts about the project never go here: paths, folders, stack, architecture, tables and business rules belong in `structure.md`, `schema.md` or `business.md`. If you're about to add one of those here, put it in the right project file instead.
