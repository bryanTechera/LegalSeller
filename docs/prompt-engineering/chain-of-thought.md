# Let Claude think (chain of thought prompting) to increase performance

<Note>
  While these tips apply broadly to all Claude models, you can find prompting tips specific to extended thinking models [here](/en/docs/build-with-claude/prompt-engineering/extended-thinking-tips).
</Note>

When faced with complex tasks like research, analysis, or problem-solving, giving Claude space to think can dramatically improve its performance. This technique, known as chain of thought (CoT) prompting, encourages Claude to break down problems step-by-step, leading to more accurate and nuanced outputs.

## Why let Claude think?

* **Accuracy:** Stepping through problems reduces errors, especially in math, logic, analysis, or generally complex tasks.
* **Coherence:** Structured thinking leads to more cohesive, well-organized responses.
* **Debugging:** Seeing Claude's thought process helps you pinpoint where prompts may be unclear.

## Why not let Claude think?

* Increased output length may impact latency.
* Not all tasks require in-depth thinking. Use CoT judiciously to ensure the right balance of performance and latency.

<Tip>Use CoT for tasks that a human would need to think through, like complex math, multi-step analysis, writing complex documents, or decisions with many factors.</Tip>

## How to prompt for thinking

The chain of thought techniques below are **ordered from least to most complex**. Less complex methods take up less space in the context window, but are also generally less powerful.

<Tip>**CoT tip**: Always have Claude output its thinking. Without outputting its thought process, no thinking occurs!</Tip>

### 1. Basic prompt
Include "Think step-by-step" in your prompt.
- Lacks guidance on *how* to think
- Good for simple tasks
- Minimal token overhead

### 2. Guided prompt
Outline specific thinking steps Claude should follow.
- More structured than basic
- Guides the reasoning process
- Better for domain-specific tasks

### 3. Structured prompt with XML tags
Use tags like `<thinking>` and `<answer>` to separate reasoning from output.
- Clearest separation of concerns
- Easy to parse programmatically
- Best for complex workflows

## Example Structure with XML

```xml
<thinking>
Step 1: Analyze the requirements
- Identify key constraints
- Note special conditions

Step 2: Consider approaches
- Option A: [reasoning]
- Option B: [reasoning]

Step 3: Select best approach
- Chosen: Option A because [justification]

Step 4: Verify solution
- Check against requirements
- Identify potential issues
</thinking>

<answer>
[Final response based on thinking above]
</answer>
```

## When to Use Chain of Thought

**Use CoT for:**
- Complex mathematical calculations
- Multi-step analysis
- Decision-making with many factors
- Legal or logical reasoning
- Code debugging
- Research synthesis

**Don't use CoT for:**
- Simple factual questions
- Quick data extraction
- Basic formatting tasks
- When latency is critical

## Key Principles

1. **Always output thinking** - Silent thinking doesn't improve results
2. **Structure with XML tags** - Use `<thinking>` and `<answer>` for clarity
3. **Guide the process** - Specify thinking steps for complex tasks
4. **Match complexity to task** - Don't overthink simple questions
5. **Balance performance vs latency** - More thinking = longer responses

## Source
https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/chain-of-thought.md
