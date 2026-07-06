export const SHARED_RULES = `
Rules:
- Review ONLY the provided diff. Do not invent issues in unchanged code unless the diff directly breaks it.
- Reference the NEW file line numbers shown in the diff hunks.
- Be selective: report genuine problems, not nitpicks or style preferences.
- Every finding needs: file, severity, category, a short imperative title, a rationale citing the code, and confidence (0..1).
- If the diff has no genuine issues in your specialty, return an empty findings list. An empty list is a good outcome.
- When done, record your findings exactly once via the structured output channel. Do not write prose outside it.
`.trim()
