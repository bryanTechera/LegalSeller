# Prefill Claude's response for greater output control

<Note>
  While these tips apply broadly to all Claude models, you can find prompting tips specific to extended thinking models [here](/en/docs/build-with-claude/prompt-engineering/extended-thinking-tips).
</Note>

<Note>
  Prefilling is only available for non-extended thinking modes. It's not currently supported with extended thinking.
</Note>

When using Claude, you have the unique ability to guide its responses by prefilling the `Assistant` message. This powerful technique allows you to direct Claude's actions, skip preambles, enforce specific formats like JSON or XML, and even help Claude maintain character consistency in role-play scenarios.

In some cases where Claude is not performing as expected, a few prefilled sentences can vastly improve Claude's performance. A little prefilling goes a long way!

## How to prefill Claude's response

To prefill, include the desired initial text in the `Assistant` message (Claude's response will continue from where the `Assistant` message leaves off):

```python
import anthropic

client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "What is your favorite color?"},
        {"role": "assistant", "content": "As an AI assistant, I don't have a favorite color, But if I had to pick, it would be green because"}  # Prefill here
    ]
)
```

<Warning>
  The prefill content cannot end with trailing whitespace. A prefill like `"As an AI assistant, I "` (with a space at the end) will result in an error.
</Warning>

## Common Use Cases

### 1. Skip preambles and get straight to the answer

**Without prefill:**
```
User: Generate a JSON object with user data.
Claude: Certainly! I'll create a JSON object for you with user data. Here it is:

{
  "name": "John Doe",
  ...
}
```

**With prefill:**
```
User: Generate a JSON object with user data.
Assistant: {  // Prefill
Claude continues:
  "name": "John Doe",
  "email": "john@example.com",
  ...
}
```

<Tip>**Power user tip**: Prefilling `{` forces Claude to skip the preamble and directly output the JSON object. This is cleaner, more concise, and easier for programs to parse without additional processing.</Tip>

### 2. Enforce specific output formats

Prefill with opening tags or structure to ensure consistent formatting:

**XML output:**
```python
{"role": "assistant", "content": "<response>"}  # Prefill
# Claude continues with properly formatted XML
```

**Markdown sections:**
```python
{"role": "assistant", "content": "## Analysis\n\n"}  # Prefill
# Claude continues with analysis content
```

### 3. Maintain character consistency in role-play

```python
messages=[
    {"role": "user", "content": "You are a 1920s detective. Someone just entered your office."},
    {"role": "assistant", "content": "*leans back in creaky chair, cigar smoke curling*\n\n\""}  # Prefill
]
# Claude continues in character: "What brings you to my office on this foggy evening, friend?"
```

### 4. Guide analytical structure

```python
{"role": "assistant", "content": "Let me analyze this step-by-step:\n\n1. "}  # Prefill
# Claude continues with structured analysis
```

## Benefits of Prefilling

1. **Skip unnecessary preambles** - Get straight to the content
2. **Enforce formatting** - Guarantee JSON, XML, or other structured formats
3. **Maintain consistency** - Keep tone, style, or character throughout conversation
4. **Guide response structure** - Shape how Claude organizes information
5. **Improve parsability** - Make programmatic processing easier

## Key Principles

1. **No trailing whitespace** - Prefills must not end with spaces
2. **A little goes a long way** - Even a single character like `{` can transform output
3. **Combine with instructions** - Prefill works best with clear user instructions
4. **Test iteratively** - Experiment with different prefills to find what works
5. **Use for structured data** - Especially powerful for JSON, XML, CSV output

## Advanced Patterns

### Force JSON output
```python
{"role": "assistant", "content": "{"}
```

### Create consistent report structure
```python
{"role": "assistant", "content": "# Executive Summary\n\n"}
```

### Maintain conversation continuity
```python
{"role": "assistant", "content": "Building on my previous analysis, "}
```

### Guide step-by-step reasoning
```python
{"role": "assistant", "content": "<thinking>\nStep 1: "}
```

## Important Limitations

- **Not available with extended thinking** - Only works in non-extended thinking modes
- **Cannot end with whitespace** - Will cause errors
- **Works with Messages API** - Check API docs for implementation details

## Source
https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/prefill-claudes-response.md
