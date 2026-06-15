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

Tools are independent executable capabilities. Every tool — whether global or Skill-linked — follows the same contract:

- name, title, description
- input JSON schema with parameter descriptions
- safety metadata (readOnly, canWrite, requiresConfirmation)
- execution function
- structured result (ok, content, summary, errorCode)

Tools do not own conversation flow. Tools return structured results; the runtime wraps them into provider-visible `role=tool` messages.

Tool inputs must be minimal. Every parameter must affect execution, scope, output, or safety. Do not add reason/comment/note parameters that do not participate in execution. Usage guidance belongs in description/inputHint/boundary, not in parameters.

The final response is not a native Agent tool. Final answers are provider assistant messages without tool calls.

## Skills

Skills are instruction packages. A skill can:

- control whether a related group of tools is registered for the current turn
- describe domain boundaries, terminology, evidence rules, and general response preferences
- provide heuristic usage suggestions to help the model use tools more effectively

Skills do not own tools, execute code, choose tools for the model, prescribe tool order, force a fixed flow, or replace runtime permission checks.

When a Skill is disabled, its linked tools are not registered and not shown in the tool settings UI. The Skill's suggestions are advisory, not mandatory sequences.

There is no separate structured planning protocol in the main Agent path. No JSON Planner, final_answer tool, custom JSON Planner, control plane JSON, invalid_json, or stream_json.

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
