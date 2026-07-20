# Long context prompting tips

<Note>
  While these tips apply broadly to all Claude models, you can find prompting tips specific to extended thinking models [here](/en/docs/build-with-claude/prompt-engineering/extended-thinking-tips).
</Note>

Claude's extended context window (200K tokens for Claude 3 models) enables handling complex, data-rich tasks. This guide will help you leverage this power effectively.

## Essential tips for long context prompts

### 1. Put longform data at the top

Place your long documents and inputs (~20K+ tokens) near the top of your prompt, above your query, instructions, and examples. This can significantly improve Claude's performance across all models.

<Note>Queries at the end can improve response quality by up to 30% in tests, especially with complex, multi-document inputs.</Note>

**Optimal structure:**
```xml
<documents>
  [Long documents here - 20K+ tokens]
</documents>

<instructions>
  [Your task instructions]
</instructions>

<examples>
  [Examples if needed]
</examples>

[Your specific query]
```

### 2. Structure document content with XML tags

When using multiple documents, wrap each document in `<document>` tags with `<document_content>` and `<source>` (and other metadata) subtags for clarity.

### 3. Ground responses in quotes

For long document tasks, ask Claude to quote relevant parts of the documents first before carrying out its task. This helps Claude cut through the "noise" of the rest of the document's contents.

## Key principles

1. **Documents first, queries last** - Up to 30% performance boost
2. **Structure with XML** - Clear boundaries and metadata
3. **Quote then analyze** - Ground responses in source text
4. **Be explicit** - Don't assume Claude sees relationships
5. **Optimize wisely** - Long context doesn't mean inefficient

## Source
https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/long-context-tips.md
