# Use examples (multishot prompting) to guide Claude's behavior

<Note>
  While these tips apply broadly to all Claude models, you can find prompting tips specific to extended thinking models [here](/en/docs/build-with-claude/prompt-engineering/extended-thinking-tips).
</Note>

Examples are your secret weapon shortcut for getting Claude to generate exactly what you need. By providing a few well-crafted examples in your prompt, you can dramatically improve the accuracy, consistency, and quality of Claude's outputs.
This technique, known as few-shot or multishot prompting, is particularly effective for tasks that require structured outputs or adherence to specific formats.

<Tip>**Power up your prompts**: Include 3-5 diverse, relevant examples to show Claude exactly what you want. More examples = better performance, especially for complex tasks.</Tip>

## Why use examples?

* **Accuracy**: Examples reduce misinterpretation of instructions.
* **Consistency**: Examples enforce uniform structure and style.
* **Performance**: Well-chosen examples boost Claude's ability to handle complex tasks.

## Crafting effective examples

For maximum effectiveness, make sure that your examples are:

* **Relevant**: Your examples mirror your actual use case.
* **Diverse**: Your examples cover edge cases and potential challenges, and vary enough that Claude doesn't inadvertently pick up on unintended patterns.
* **Clear**: Your examples are wrapped in `<example>` tags (if multiple, nested within `<examples>` tags) for structure.

<Tip>Ask Claude to evaluate your examples for relevance, diversity, or clarity. Or have Claude generate more examples based on your initial set.</Tip>

## Key Principles

1. **3-5 examples is optimal** - More examples generally means better performance
2. **Diversity is critical** - Cover edge cases and vary enough to avoid unintended patterns
3. **Use XML tags** - Wrap examples in `<example>` tags, multiple examples in `<examples>`
4. **Mirror your use case** - Examples should closely match real scenarios
5. **Show complete interactions** - Include both input and expected output
6. **Cover edge cases** - Don't just show happy path scenarios

## Example Structure

```xml
<examples>
  <example>
    <input>Sample user query or data</input>
    <output>Expected response format and content</output>
  </example>

  <example>
    <input>Different scenario, possibly edge case</input>
    <output>Expected response for this case</output>
  </example>

  <example>
    <input>Third diverse example</input>
    <output>Expected response demonstrating consistency</output>
  </example>
</examples>
```

## When to Use Multishot Prompting

* Structured data extraction or transformation
* Consistent formatting requirements
* Complex classification tasks
* Style or tone matching
* Domain-specific outputs
* When zero-shot prompting yields inconsistent results

## Benefits

* Dramatically reduces misinterpretation
* Ensures consistent output format
* Improves accuracy on complex tasks
* Reduces need for lengthy explanations
* Makes implicit requirements explicit

## Source
https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/multishot-prompting.md
