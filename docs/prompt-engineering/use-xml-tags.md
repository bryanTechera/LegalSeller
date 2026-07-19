# Use XML tags to structure your prompts

<Note>
  While these tips apply broadly to all Claude models, you can find prompting tips specific to extended thinking models [here](/en/docs/build-with-claude/prompt-engineering/extended-thinking-tips).
</Note>

When your prompts involve multiple components like context, instructions, and examples, XML tags can be a game-changer. They help Claude parse your prompts more accurately, leading to higher-quality outputs.

<Tip>**XML tip**: Use tags like `<instructions>`, `<example>`, and `<formatting>` to clearly separate different parts of your prompt. This prevents Claude from mixing up instructions with examples or context.</Tip>

## Why use XML tags?

* **Clarity:** Clearly separate different parts of your prompt and ensure your prompt is well structured.
* **Accuracy:** Reduce errors caused by Claude misinterpreting parts of your prompt.
* **Flexibility:** Easily find, add, remove, or modify parts of your prompt without rewriting everything.
* **Parseability:** Having Claude use XML tags in its output makes it easier to extract specific parts of its response by post-processing.

<Note>There are no canonical "best" XML tags that Claude has been trained with in particular, although we recommend that your tag names make sense with the information they surround.</Note>

## Tagging best practices

1. **Be consistent**: Use the same tag names throughout your prompts, and refer to those tag names when talking about the content (e.g, `Using the contract in <contract> tags...`).
2. **Nest tags**: You should nest tags `<outer><inner></inner></outer>` for hierarchical content.

<Tip>**Power user tip**: Combine XML tags with other techniques like multishot prompting (`<examples>`) or chain of thought (`<thinking>`, `<answer>`). This creates super-structured, high-performance prompts.</Tip>

## Common XML Tag Patterns

### Separating Prompt Components
```xml
<context>
Background information, domain knowledge
</context>

<instructions>
Step-by-step task requirements
</instructions>

<examples>
  <example>
    <input>Sample input</input>
    <output>Expected output</output>
  </example>
</examples>

<formatting>
Output format requirements
</formatting>
```

### Structuring Input Data
```xml
<documents>
  <document index="1">
    <source>filename.pdf</source>
    <document_content>
      {{CONTENT}}
    </document_content>
  </document>
</documents>
```

### Guiding Output Structure
```xml
<thinking>
Reasoning process
</thinking>

<answer>
Final response
</answer>
```

## Benefits of XML Tags

1. **Clear boundaries** - No ambiguity about where one section ends and another begins
2. **Hierarchical structure** - Nest tags for complex relationships
3. **Easy reference** - Refer to specific sections: "Using the data in <user_data> tags..."
4. **Programmatic parsing** - Extract specific sections from Claude's output
5. **Prevents confusion** - Claude won't mistake examples for instructions

## Key Principles

1. **Use semantic names** - Tag names should describe their content
2. **Be consistent** - Same tags throughout your prompts
3. **Nest hierarchically** - Use nesting for related content
4. **Combine with other techniques** - XML + examples + CoT = powerful prompts
5. **Reference tags explicitly** - Tell Claude to use specific tagged sections

## When to Use XML Tags

**Always use for:**
- Multi-part prompts (context + instructions + examples)
- Complex data structures
- When you need to parse output programmatically
- Long documents or multiple documents
- Hierarchical information

**Optional for:**
- Very simple, single-purpose prompts
- Quick one-off queries

## Source
https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags.md
