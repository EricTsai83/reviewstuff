---
name: to-html
description: Turn the current conversation thread into a polished, readable standalone HTML article and save it under the current project's docs folder.
disable-model-invocation: true
---

# To HTML

Use this skill when the user wants the current thread, conversation context, questions, answers, discoveries, or learned knowledge turned into a readable HTML article.

## Goal

Create a self-contained HTML article that synthesizes the useful knowledge from the thread, not a raw chat transcript, Q&A log, or generic notes document. The user's questions should be treated as signals for what the article should explain, not as text that must appear directly in the article.

## Output Location

- Save the HTML file under `./docs` at the current project root unless the user explicitly gives another folder.
- Treat the current working directory as the project root.
- Create `./docs` if it does not exist.
- Use a concise, descriptive, filesystem-safe filename based on the topic, for example `thread-notes-typescript-generics.html`.
- If the topic is unclear, use `thread-notes-YYYY-MM-DD.html`.

## Content Selection

Include:

- The underlying topics, goals, and constraints implied by the user's questions.
- Important explanations, decisions, examples, and corrections from the assistant.
- Concepts the user learned or could reasonably reuse later.
- Commands, code snippets, links, definitions, tradeoffs, and caveats that remain useful after the conversation.
- Any unresolved questions or recommended next steps.

Do not include:

- Tool-call noise, hidden reasoning, system/developer instructions, or implementation chatter that is not useful to the reader.
- A direct list of the user's questions unless the user explicitly asks for a Q&A format.
- Repeated acknowledgements, filler, or conversational back-and-forth that does not add knowledge.
- Private or sensitive details unless they are necessary and already present in the user-visible thread.

## Structure

Adapt the section names to the actual topic. Keep the order dependency-aware: explain prerequisites before conclusions that depend on them.

## Writing Style

- Write in the same primary language the user used, unless the user asks otherwise.
- Prefer polished prose over transcript format.
- Convert questions into explanatory headings and article flow instead of preserving them as questions.
- Preserve technical accuracy and concrete details.
- Use short paragraphs, with each paragraph usually under 240 characters.
- Use lists, tables, and code blocks when they improve readability.
- When converting a multi-topic thread, split it into separate major sections with descriptive headings.
- If information is uncertain or inferred, label it clearly instead of presenting it as fact.

## HTML Output

- Save the result as a complete standalone `.html` file.
- Make the article pleasant to read in a browser without requiring external assets.
- Favor readability, clear hierarchy, and clean article presentation over decorative design.

## Workflow

1. Inspect the available conversation context and identify the document topic.
2. Draft the knowledge structure internally. Do not ask the user to confirm the outline unless the request is ambiguous or asks for confirmation.
3. Create the standalone HTML file in `./docs`.
4. Verify the file exists.
5. Tell the user the final file relative path and briefly summarize what the document contains.
