# System prompts and role prompting

<Note>
  While these tips apply broadly to all Claude models, you can find prompting tips specific to extended thinking models [here](/en/docs/build-with-claude/prompt-engineering/extended-thinking-tips).
</Note>

## Role Prompting with System Parameter

The `system` parameter in the Messages API is a powerful way to guide Claude's personality, style, tone, and behavior through role prompting.

### What is role prompting?

Role prompting involves assigning Claude a specific role or persona to shape its responses. This can dramatically improve performance for specialized tasks by giving Claude expert context.

## Benefits of Role Prompting

* **Enhanced accuracy** - Expert roles improve domain-specific responses
* **Consistent tone** - Roles help maintain appropriate communication style
* **Task focus** - Clear roles help Claude understand its purpose
* **Domain expertise** - Roles unlock specialized knowledge and perspective

## How to Use System Prompts

```python
import anthropic

client = anthropic.Anthropic()
response = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    system="You are a senior financial analyst with expertise in risk assessment.",  # Role here
    messages=[
        {"role": "user", "content": "Analyze this company's financial statements..."}
    ]
)
```

## Effective Role Prompting Patterns

### Professional Roles
```
You are a [profession] with [X] years of experience in [specialty].
Your expertise includes [specific skills/knowledge areas].
```

**Examples:**
- "You are a senior legal counsel specializing in contract law and intellectual property."
- "You are an experienced software architect with expertise in distributed systems and microservices."
- "You are a medical researcher specializing in oncology with 15 years of clinical experience."

### Behavioral Characteristics
```
You are [characteristics]. You should [specific behaviors].
```

**Examples:**
- "You are thorough, precise, and detail-oriented. Always cite sources and show your reasoning."
- "You are concise and direct. Provide actionable insights without unnecessary elaboration."
- "You are patient and educational. Explain complex concepts in simple terms with analogies."

### Combined Approach (Most Effective)
```
You are a [role] with [expertise]. Your [characteristics] shape your responses.
When [situation], you [behavior]. Your goal is [objective].
```

## Key Principles

1. **Be specific about expertise** - "Tax attorney" > "Lawyer"
2. **Define behavioral traits** - How should Claude approach the task?
3. **Set clear objectives** - What is Claude trying to achieve?
4. **Include relevant context** - Industry norms, audience expectations
5. **Iterate and refine** - Test different role descriptions

## Examples of Role Impact

### Without Role (Generic)
```
User: Analyze this investment opportunity.
Claude: This investment has some potential benefits and some risks...
```

### With Specific Role
```
System: You are a CFO with 20 years of experience in venture capital and risk management. You evaluate investments with a focus on downside protection and sustainable growth.

User: Analyze this investment opportunity.
Claude: From a risk-management perspective, I see three critical concerns with this investment:
1. The 5-year revenue projections assume 300% annual growth without comparable market precedents...
2. The cap table reveals concentration risk with 70% ownership in two entities...
3. The burn rate analysis suggests only 8 months of runway at current spend levels...
```

## System vs User Messages

**System parameter:**
- Sets overall role, tone, and behavioral guidelines
- Persistent context for the entire conversation
- Best for: Role definition, general instructions, behavioral rules

**User messages:**
- Specific tasks and queries
- Can reference and build on system context
- Best for: Actual work requests, questions, data to process

## Common Role Types

**Analytical Roles:**
- Financial Analyst
- Data Scientist
- Research Analyst
- Strategic Consultant

**Creative Roles:**
- Content Writer
- Marketing Strategist
- UX Designer
- Creative Director

**Technical Roles:**
- Software Engineer
- DevOps Specialist
- Security Expert
- Solutions Architect

**Advisory Roles:**
- Legal Counsel
- Medical Advisor
- Career Coach
- Executive Mentor

## Best Practices

1. **Match role to task complexity** - More specialized roles for specialized tasks
2. **Define expertise depth** - Junior vs senior, generalist vs specialist
3. **Specify perspective** - Whose interests does Claude represent?
4. **Include constraints** - Ethical guidelines, regulatory requirements
5. **Test and iterate** - Refine role descriptions based on output quality

## Source
https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/system-prompts.md
