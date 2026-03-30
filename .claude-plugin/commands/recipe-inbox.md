---
name: recipe-inbox
description: Process all files in inbox/ — import each, move originals to inbox/processed/
---

# /recipe-inbox

Batch-process all files dropped into the `inbox/` directory.

## Workflow

### Step 1: Scan inbox

List all files in `inbox/` (excluding the `processed/` subdirectory). Supported file types:
- `.md`, `.txt` — markdown/text recipes
- `.pdf` — PDF documents (Claude reads natively)
- `.jpg`, `.png` — images of recipes (Claude vision)

If the inbox is empty, inform the user and exit.

### Step 2: Process each file

For each file found, run the equivalent of `/recipe-import <filepath>`:

1. Read the file content (using appropriate method for the file type)
2. Normalize to markdown
3. Parse into structured JSON using the **recipe-parse** skill
4. Convert units to metric
5. Validate the DAG
6. Present the side-by-side review to the user for approval
7. On approval, save the JSON to `recipes/<category>/<slug>.json`
8. Run `/recipe-build <slug>` to generate the HTML

Process files one at a time so the user can review each recipe before moving on.

### Step 3: Move processed originals

After each file is successfully imported and approved:

```bash
mkdir -p ${CLAUDE_PROJECT_DIR}/inbox/processed
mv inbox/<filename> inbox/processed/<filename>
```

If a file fails to import (user rejects or parsing error), leave it in `inbox/` and note the failure.

### Step 4: Summary

After processing all files, report:
- Number of recipes successfully imported
- Number of files skipped or failed
- List of saved recipe paths
- Reminder to run `/recipe-index` if the index page needs updating
