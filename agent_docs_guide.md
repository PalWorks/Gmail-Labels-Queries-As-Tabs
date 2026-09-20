Agent and LLM Repository Documentation Guide Generated:
2026-02-22T17:37:54.071101

Purpose

When working on a codebase with agents or LLM driven automation, the
goal of markdown documentation is to externalize context so agents do
not need to infer intent. The best repositories treat markdown files as
structured operational memory.

Core Project Context

1.  README.md Mandatory entry point. Should include: Project purpose
    Architecture overview Setup instructions Key commands Agent usage
    notes Links to deeper documentation

2.  ARCHITECTURE.md System design reference. Include: Component diagram
    Data flow Service boundaries External dependencies Scaling
    considerations

3.  ROADMAP.md Future direction and priorities. Helps agents understand
    intent and avoid misaligned changes.

4.  CHANGELOG.md Human readable change history. Agents use this to
    detect regressions and evolution patterns.

Agent Specific Control Files

5.  AGENTS.md Primary agent behavior contract. Include: Agent roles
    Allowed actions Restricted areas Coding conventions Review rules
    Safety constraints

This is the single most important file for LLM workflows.

6.  PROMPTS.md Reusable prompts and patterns. Include: System prompts
    Task templates Review prompts Debug prompts

Prevents prompt drift.

7.  SKILLS.md Agent capabilities catalog. Include: Available tools APIs
    CLI commands Workflows Example usage

Useful when agents have tool invocation.

8.  MEMORY.md Persistent decisions and context. Include: Architectural
    decisions Tradeoffs Known constraints Assumptions

Acts like long term cognition.

9.  PLAYBOOK.md Operational procedures. Include: How to implement
    features How to debug How to release How to rollback

Agents follow this step by step.

Engineering Standards

10. CONTRIBUTING.md Contribution workflow. Branch strategy PR
    requirements Review checklist

11. CODE_STYLE.md Formatting and conventions.

12. TESTING.md Testing philosophy and commands.

13. SECURITY.md Secrets handling Authentication patterns Vulnerability
    policy

14. DEPLOYMENT.md or CLOUD.md Infrastructure instructions. Environments
    Continuous integration and deployment Secrets Rollback steps

Runtime and Operations Knowledge

15. RUNBOOK.md Production troubleshooting. Common failures Recovery
    steps Monitoring locations

16. OBSERVABILITY.md Logging Metrics Tracing Dashboards

17. INCIDENTS.md Postmortems and learnings.

Domain Knowledge

18. DOMAIN.md Business logic explanation. Entities Terminology Rules

This dramatically improves agent correctness.

19. DATA_MODEL.md Schemas Relationships Migration strategy

20. API.md Endpoints Contracts Examples

LLM Optimization Files

21. CONTEXT_MAP.md Where knowledge lives. Which file to read for what.

Very useful for large repositories.

22. TASKS.md Structured work queue for agents. Each task with: Goal
    Constraints Acceptance criteria

23. DECISIONS.md Architecture Decision Records. Why something exists.

24. LIMITATIONS.md Known bugs Technical debt Edge cases

Prevents agents from repeating mistakes.

Optional but High Value

25. LOCAL_SETUP.md Fast developer onboarding.

26. FAQ.md Common issues and answers.

27. GLOSSARY.md Terminology definitions.

28. DEPENDENCIES.md External services and versions.

Minimal High Impact Set

If you want only the most effective subset:

README.md ARCHITECTURE.md AGENTS.md PROMPTS.md SKILLS.md MEMORY.md
PLAYBOOK.md RUNBOOK.md DOMAIN.md TASKS.md

This combination covers most agent productivity needs.

Advanced Insight

Repositories that work best with LLM agents follow three layers:

Orientation layer README ARCHITECTURE DOMAIN

Execution layer AGENTS PLAYBOOK TASKS PROMPTS

Memory layer MEMORY DECISIONS CHANGELOG
