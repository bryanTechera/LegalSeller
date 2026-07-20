# Chain complex prompts for stronger performance

<Note>
  While these tips apply broadly to all Claude models, you can find prompting tips specific to extended thinking models [here](/en/docs/build-with-claude/prompt-engineering/extended-thinking-tips).
</Note>

## What is prompt chaining?

Prompt chaining is a technique where you break down a complex task into smaller, manageable subtasks. Each subtask is handled by a separate, focused prompt in a sequence, with the output of one prompt feeding into the next.

This approach allows Claude to focus on each step individually, leading to better results than trying to accomplish everything in a single, complicated prompt.

## Why chain prompts?

* **Increased accuracy** - Each subtask gets Claude's full attention, reducing errors
* **Easier debugging** - Isolate and fix issues in specific steps
* **Greater clarity** - Simpler prompts are easier to write and maintain
* **Better performance** - Focused tasks often produce higher quality results

## When to chain prompts

Consider chaining when:
* Task has multiple distinct steps
* Each step requires different expertise or perspective
* Intermediate outputs are useful independently
* Task is complex and monolithic prompts aren't working
* You need to validate intermediate results

## Chaining strategies

### 1. Sequential processing
Each step produces output for the next step:
```
Step 1: Research → Output: Research findings
Step 2: Analysis → Output: Analysis report (uses findings)
Step 3: Recommendations → Output: Action plan (uses analysis)
```

### 2. Parallel processing + synthesis
Multiple independent prompts feed into a final synthesis:
```
Prompt A: Analyze competitors → Output A
Prompt B: Analyze market trends → Output B
Prompt C: Analyze internal data → Output C
Final Prompt: Synthesize A, B, C → Strategic recommendations
```

### 3. Validation chains
Include verification steps:
```
Step 1: Generate content → Output: Draft
Step 2: Review for accuracy → Output: Corrections needed
Step 3: Apply corrections → Output: Final version
```

### 4. Iterative refinement
Use feedback loops:
```
Step 1: Generate solution → Output: Initial solution
Step 2: Critique solution → Output: Issues identified
Step 3: Improve solution → Output: Refined solution
(Repeat steps 2-3 as needed)
```

## Chaining techniques

### Using XML tags for handoff
```xml
<!-- Prompt 1 -->
Analyze this document and extract key points.

<output>
<key_points>
  <point>Finding 1...</point>
  <point>Finding 2...</point>
</key_points>
</output>

<!-- Prompt 2 -->
Using the key points in <key_points> tags, create an executive summary...
```

### Explicit context passing
```
Prompt 1: "Extract all dates and amounts from this invoice."
Output 1: [Structured data]

Prompt 2: "Using the following extracted data: [Output 1], calculate totals and flag any discrepancies over $1000."
```

### Role switching
```
Prompt 1: "As a data analyst, identify trends in this dataset."
Prompt 2: "As a business strategist, recommend actions based on these trends: [trends from prompt 1]"
```

## Example: Document processing workflow

### Without chaining (monolithic)
```
Analyze this 50-page contract for risks, compliance issues, financial terms,
and problematic clauses. Then create an executive summary, a detailed risk
report, and a list of recommended changes.
```
❌ Overwhelming, likely to miss details or produce generic output

### With chaining (sequential)
```
Prompt 1: "Extract all financial terms and obligations from this contract."
→ Output: Structured financial data

Prompt 2: "Review these financial terms [from output 1] for any unusual or risky provisions."
→ Output: Risk assessment

Prompt 3: "Identify compliance requirements across these sections: [relevant sections]"
→ Output: Compliance checklist

Prompt 4: "Based on the following analyses [outputs 1-3], create an executive summary highlighting the top 5 concerns."
→ Output: Executive summary
```
✅ Each step focused, comprehensive, and high-quality

## Best practices

1. **Keep each prompt focused** - One clear objective per prompt
2. **Use XML tags** - Structure handoffs between prompts clearly
3. **Pass relevant context only** - Don't overload subsequent prompts
4. **Validate intermediate outputs** - Check quality before proceeding
5. **Document your chain** - Make the workflow transparent
6. **Iterate on weak links** - Improve prompts that underperform
7. **Consider parallel processing** - Run independent steps simultaneously

## Common chaining patterns

### Research → Analysis → Synthesis
```
1. Gather information from multiple sources
2. Analyze each source independently
3. Synthesize findings into coherent insights
```

### Generate → Critique → Refine
```
1. Create initial output
2. Critically evaluate output
3. Incorporate feedback and improve
```

### Extract → Transform → Load (ETL)
```
1. Extract data from unstructured sources
2. Transform into structured format
3. Load into final output format
```

### Decompose → Solve → Combine
```
1. Break complex problem into subproblems
2. Solve each subproblem independently
3. Combine solutions into complete answer
```

## Performance tips

* **Run independent chains in parallel** - Don't serialize unnecessarily
* **Cache expensive results** - Reuse outputs when inputs don't change
* **Monitor token usage** - Long chains can accumulate tokens
* **Set up failure handling** - What if a step fails?
* **Test each step independently** - Validate before full chain execution

## Key principles

1. **Break down complexity** - Divide and conquer
2. **One task per prompt** - Keep it focused
3. **Clear handoffs** - Explicit context passing
4. **Validate steps** - Check quality throughout
5. **Iterate and improve** - Refine weak links

## Source
https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/chain-prompts.md
