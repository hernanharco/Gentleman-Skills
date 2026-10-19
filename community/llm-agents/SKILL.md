---
name: llm-agents
description: >
  Patterns for building LLM agents: orchestration graphs, tool design, memory, and evaluation.
  Trigger: When building agents with LangGraph or LangChain, when designing tool-calling loops, when adding short/long-term memory to an agent, when debugging non-deterministic agent runs.
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## When to Use

Load this skill when:
- Designing or refactoring an agent orchestration (LangGraph, LangChain, AI SDK agents)
- Defining tools an LLM can call (function calling, MCP servers)
- Adding memory (conversation state, retrieval, checkpointing)
- Debugging agents that loop, forget context, or call tools incorrectly
- Deciding between a single LLM call, a chain, and a full agent

---

## Critical Patterns

- **Prefer the simplest control flow that works**: a single prompt beats a chain, a chain
  beats an agent. Agents are warranted only when the model must decide dynamically which
  tools to call and in what order.
- **Graph state is explicit and serializable**: every field in LangGraph `StateAnnotation`
  must be JSON-serializable — it is what gets checkpointed and streamed. Never put live
  clients, file handles, or non-deterministic objects in state.
- **Tools are narrow and well-described**: one action per tool, with a precise description
  and validated parameters (Zod/Pydantic). The model chooses tools from descriptions
  alone — vague descriptions produce wrong calls more often than weak models do.
- **Bound tool loops**: always set a `max_steps`/recursion limit and detect repeated
  identical calls; an unbounded tool loop burns tokens and can act repeatedly on bad state.
- **Separate reasoning state from side effects**: compute a plan or tool call first, then
  execute it outside the graph step; interleaving both makes retries double-apply effects.
- **Memory is scoped, not global**: short-term (checkpointed thread state) and long-term
  (vector store / structured facts) are different stores with different eviction policies.
  Never dump the whole history into the prompt.
- **Evaluate before prompting**: build a fixed eval set of inputs with expected outcomes;
  prompt and model changes are measured against it. Without evals, "improvements" are
  anecdotes.
- **Human-in-the-loop for irreversible actions**: any tool that sends messages, pays,
  deletes, or publishes must require confirmation before execution.

## Orchestration (LangGraph)

```python
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.sqlite import SqliteSaver
from pydantic import BaseModel, Field


class AgentState(TypedDict):
    # Reducers keep state updates explicit; Annotated list appends messages.
    messages: Annotated[list, "append"]
    next_action: str


class SearchQuery(BaseModel):
    """Precise, validated tool input — the model fills this via tool calling."""
    query: str = Field(description="Search query, max 10 words")
    k: int = Field(default=5, ge=1, le=20, description="Number of results")


def call_model(state: AgentState):
    model_with_tools = model.bind_tools([search_tool])
    return {"messages": [model_with_tools.invoke(state["messages"])]}


def should_continue(state: AgentState) -> str:
    last = state["messages"][-1]
    if getattr(last, "tool_calls", None):
        return "tools"
    return END


builder = StateGraph(AgentState)
builder.add_node("agent", call_model)
builder.add_node("tools", tool_node)
builder.add_edge(START, "agent")
builder.add_conditional_edges("agent", should_continue, ["tools", END])
builder.add_edge("tools", "agent")

# Checkpointer makes threads resumable and enable human-in-the-loop interrupts.
graph = builder.compile(checkpointer=SqliteSaver.from_conn_string("agent.db"))
```

- Use `recursion_limit` (default 25) as the hard stop for runaway loops.
- Use `interrupt_before=["tools"]` for approval-gated side effects.

## Tool Design

```python
def search_tool(query: str, k: int = 5) -> list[dict]:
    """Search the internal docs. Returns [{title, url, snippet}].

    Use for questions about project documentation. Do NOT use for
    codebase search (use code_search instead).
    """
    if not query.strip():
        raise ValueError("query must be non-empty")
    return vector_store.search(query, k=k)
```

- Docstrings/descriptions are the API contract: state what it does, when to use it, and
  when NOT to use it.
- Validate and normalize inside the tool; raise clear errors the model can react to.
- Return small, structured results — never raw dumps (truncate snippets, cap `k`).
- Group read tools freely; split write tools per side effect so each can be gated.

## Memory

| Layer | Store | Use for | Eviction |
|---|---|---|---|
| Thread | Checkpointer (SQLite/Postgres) | Current conversation, resumable state | Trim by turns/summary |
| Long-term | Vector store or structured table | Facts, docs, past decisions | TTL / dedupe by content hash |
| Working | Graph state | Intermediate steps of one run | Cleared every run |

- Summarize old turns instead of truncating blindly; keep the system prompt and the last
  N turns verbatim.
- Write facts to long-term memory only when they will be read back — memory without a
  retrieval path is a write-only database.

## Debugging Checklist

1. Dump the full message list at each node — 90% of bugs are wrong message shape or a
   missing tool result message.
2. Check tool schemas match the function signature (renamed params silently break calls).
3. Look for identical repeated tool calls → missing loop bound or tool error not
   surfaced to the model.
4. Confirm the checkpointer thread_id is stable — a new id per message loses all context.
5. Replay with a fixed eval input before and after any change; never debug on live chat.

## Anti-Patterns

- **Agent-as-default**: chains and direct calls are cheaper and deterministic.
- **God tool**: one `do_anything(action=...)` tool hides every decision from the graph.
- **Unbounded loops**: no recursion limit, no repeated-call detection.
- **Memory as history dump**: full transcript in prompt until context blows up.
- **Unverified writes**: tools that mutate external state run without confirmation.
