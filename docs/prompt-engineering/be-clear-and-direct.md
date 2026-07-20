# Be clear, direct, and detailed

<Note>
  While these tips apply broadly to all Claude models, you can find prompting tips specific to extended thinking models [here](/en/docs/build-with-claude/prompt-engineering/extended-thinking-tips).
</Note>

When interacting with Claude, think of it as a brilliant but very new employee (with amnesia) who needs explicit instructions. Like any new employee, Claude does not have context on your norms, styles, guidelines, or preferred ways of working.
The more precisely you explain what you want, the better Claude's response will be.

<Tip>**The golden rule of clear prompting**<br />Show your prompt to a colleague, ideally someone who has minimal context on the task, and ask them to follow the instructions. If they're confused, Claude will likely be too.</Tip>

## How to be clear, contextual, and specific

* **Give Claude contextual information:** Just like you might be able to better perform on a task if you knew more context, Claude will perform better if it has more contextual information. Some examples of contextual information:
  * What the task results will be used for
  * What audience the output is meant for
  * What workflow the task is a part of, and where this task belongs in that workflow
  * The end goal of the task, or what a successful task completion looks like
* **Be specific about what you want Claude to do:** For example, if you want Claude to output only code and nothing else, say so.
* **Provide instructions as sequential steps:** Use numbered lists or bullet points to better ensure that Claude carries out the task the exact way you want it to.

## Key Principles

1. **Context is critical** - Provide background on purpose, audience, workflow, and end goals
2. **Specificity matters** - State exactly what you want, including what to include/exclude
3. **Sequential instructions** - Use numbered lists or bullet points for step-by-step guidance
4. **Test with colleagues** - If someone without context can't follow your instructions, Claude likely won't either
5. **Think of Claude as a new employee** - Explicit, detailed instructions yield best results

## Examples of Improvements

**Unclear:** "Anonymize this customer feedback"
**Clear:** "Remove all personally identifiable information (names, email addresses, phone numbers, physical addresses) from the following customer feedback. Replace names with 'Customer [N]' where N is a sequential number. Replace other PII with appropriate placeholders like [EMAIL], [PHONE], [ADDRESS]."

**Unclear:** "Summarize this document"
**Clear:** "Create a 3-bullet executive summary of the attached quarterly report, focusing on: 1) Revenue performance vs. targets, 2) Major risks or challenges, 3) Strategic recommendations for next quarter. Target audience is C-suite executives."

## Source
https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/be-clear-and-direct.md
