---
name: improve-html-article
description: Edit and improve HTML articles by restructuring sections, improving clarity, and tightening prose. Use when user wants to edit, revise, or improve an article draft.
disable-model-invocation: true
---

Use this as a sub skill for improving a complete standalone HTML article after it has been generated.

When invoked from the `to-html` skill as a required post-processing pass, apply the steps directly to the file and do not stop to confirm the sections with the user. Instead, make a concise internal section plan, edit the article, and verify the result.

1. First, divide the article into sections based on its headings. Think about the main points you want to make during those sections.

Consider that information is a directed acyclic graph, and that pieces of information can depend on other pieces of information. Make sure that the order of the sections and their contents respects these dependencies.

Confirm the sections with the user only when this skill is invoked directly for an interactive revision. Skip confirmation when this skill is invoked by `to-html` after article generation.

2. For each section:

2a. Rewrite the section to improve clarity, coherence, and flow. Use maximum 240 characters per paragraph.

2b. Improve the article's visual design while keeping it self-contained:

- Strengthen hierarchy with clear title, deck, section headings, spacing, and rhythm.
- Make the layout readable on mobile and desktop with responsive CSS and sensible line lengths.
- Improve code blocks, tables, callouts, and lists so they are easy to scan.
- Use a restrained, article-appropriate color system. Avoid relying on external assets, CDNs, or browser-default code styling.
- Keep the design connected to the article's subject matter without adding decorative clutter.

3. Verify the improved HTML:

- The file remains a standalone `.html` document.
- The article still preserves the user's primary language.
- Paragraphs are concise and readable.
- Code blocks preserve escaping and indentation.
- The visual design is materially better than the first draft.
