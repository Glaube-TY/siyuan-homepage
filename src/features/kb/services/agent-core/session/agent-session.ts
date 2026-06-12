import type { AgentMessage } from "../messages/agent-message";
import { AppendOnlyLog } from "./append-only-log";

export class AgentSession {
  readonly messages = new AppendOnlyLog<AgentMessage>();

  constructor(readonly id: string, initialMessages: readonly AgentMessage[] = []) {
    for (const message of initialMessages) {
      this.messages.append(message);
    }
  }

  append(message: AgentMessage): void {
    this.messages.append(message);
  }

  appendMany(messages: readonly AgentMessage[]): void {
    for (const message of messages) {
      this.append(message);
    }
  }

  snapshot(): AgentMessage[] {
    return this.messages.all();
  }

  messageCount(): number {
    return this.messages.size();
  }
}
