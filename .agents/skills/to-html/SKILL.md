---
name: to-html
description: Convert the current conversation context into a polished standalone HTML article saved under this project's docs folder.
disable-model-invocation: true
---

# To HTML

Create a self-contained `.html` article from the useful knowledge in the current context.

## Requirements

- Save the file under `./docs` from the current project root. Create the folder if needed.
- Use a concise topic-based filename, such as `effect-cli-command-guide.html`.
- Write a standalone article, not a transcript, Q&A log, or notes dump.
- Do not mention that the article came from a conversation, thread, chat, user, or assistant unless explicitly requested.
- Preserve the user's primary language unless they request otherwise.
- Include only durable knowledge: explanations, examples, tradeoffs, caveats, code, commands, links, and next steps worth rereading.
- Omit tool noise, hidden reasoning, acknowledgements, and irrelevant back-and-forth.
- Make the HTML pleasant to read without external assets.
- Style code blocks intentionally. Prefer language labels and static standalone syntax highlighting when code is important.
- After creating the initial HTML file, apply the local sub skill `IMPROVE-HTML-ARTICLE.md` to revise the article and improve the visual design before final verification.
- Verify the file exists, then report the relative path and a short summary.

## Code Quality

- Do not rely on CDN assets or browser-default code styling.
- Prefer static highlighting in the generated HTML, not a fragile runtime highlighter.
- For code-heavy articles, use a local highlighter if available, such as Shiki or Pygments, and inline the resulting CSS/HTML.
- If no highlighter is available, manually add simple token spans for important snippets.
- Escape code correctly: `&` -> `&amp;`, `<` -> `&lt;`, `>` -> `&gt;`. Preserve backslashes as literal text.
- Use `<pre><code>` with `white-space: pre` or equivalent so indentation, backslashes, and multiline syntax render exactly.
- Before finishing, inspect at least one code block in the generated HTML and confirm highlighting markup exists.

## Required Post-Processing

After the first complete HTML draft is written:

1. Read `IMPROVE-HTML-ARTICLE.md` from this skill directory.
2. Apply its article-improvement workflow directly to the generated HTML file.
3. Treat this as an internal post-processing pass: do not pause for user confirmation unless the sub skill explicitly cannot be applied without missing information.
4. Make the final saved HTML reflect both the original article requirements and the improvement pass.
5. Re-verify the final file after the improvement pass, including code-block styling when applicable.

Rely on your writing judgment for structure, section names, visual design, and what to include.
