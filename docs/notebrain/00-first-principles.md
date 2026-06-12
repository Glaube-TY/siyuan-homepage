# Notebrain Agent First Principles

## Core Model

Notebrain Agent uses the model provider's native tool-call protocol as the control plane.

The runtime is responsible for:

- building system, context, skill, assistant, user, and tool messages
- passing native tool schemas to the provider
- parsing streamed text, reasoning, and tool calls
- dispatching registered tools
- appending `role=tool` results with matching tool call IDs
- enforcing cancellation, permission gates, loop limits, and duplicate-write guards
- keeping compacted session history valid for provider tool-call pairing

The model is responsible for:

- deciding whether a tool is needed
- choosing the tool and arguments
- writing the final assistant answer as normal assistant text

There is no separate structured planning protocol in the main Agent path.

## Tools

Tools are independent executable capabilities. A tool owns only:

- name, title, description
- input JSON schema
- safety metadata
- execution function
- result summary

Tools do not own conversation flow. Tools return structured results; the runtime wraps them into provider-visible `role=tool` messages.

The final response is not a native Agent tool. Final answers are provider assistant messages without tool calls.

## Skills

Skills are instruction packages. A skill can describe domain boundaries, terminology, evidence rules, and general response preferences.

Skills do not own tools, execute code, choose tools for the model, prescribe tool order, force a fixed flow, or replace runtime permission checks.

## Provider Compatibility

Only models that support provider-native tool calls may enter Agent mode.

Current production path uses OpenAI-compatible chat completions and covers Kimi, DeepSeek, MiMo, and custom OpenAI-compatible providers. Gemini and Anthropic adapters exist as protocol adapters for future configuration surfaces.

## Safety

Read-only tools may run without confirmation.

Write tools pass through the runtime permission gate and the existing document-edit confirmation bridge used by the concrete Siyuan write tools. Duplicate write calls with the same tool and arguments in one turn are blocked before execution.

The runtime never claims a write succeeded. The final answer must follow the actual tool result.

## Memory And Compaction

The session log is append-only inside a turn. Provider-facing history is normalized so assistant tool calls are immediately followed by matching tool results. Orphan tool results and incomplete tool-call pairs are dropped before provider submission.

When history grows, the runtime compacts older messages and large tool outputs while preserving the newest valid tool-call pairs.

## References

Footer references are grounded from actual current-turn observations, attached documents, and trusted conversation context. Search results are candidates; read content is evidence.
