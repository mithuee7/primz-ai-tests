import { randomUUID } from "node:crypto";
import {
  type ConnectionStatus,
  type InboundEvent,
  type InstagramMessage,
  type InstagramProfile,
  type InstagramService,
  type InstagramThread,
  type SendMessageInput,
  type SendMessageResult,
} from "./types";

/**
 * Demo implementation. Nothing here talks to Instagram.
 * sendMessage only mints a fake id and reports delivery: "mock" so callers
 * (and the UI) can label the message as simulated.
 */
export class MockInstagramService implements InstagramService {
  readonly kind = "mock" as const;

  async getStatus(): Promise<ConnectionStatus> {
    return {
      kind: "mock",
      connected: false,
      label: "Not connected (demo)",
      detail: "Messages are simulated locally. Nothing is sent to Instagram.",
    };
  }

  async getConversation(): Promise<InstagramThread | null> {
    return null;
  }

  async getMessages(): Promise<InstagramMessage[]> {
    // The mock has no remote inbox. Demo history lives in the repository.
    return [];
  }

  async sendMessage(_input: SendMessageInput): Promise<SendMessageResult> {
    return { externalMessageId: `mock_${randomUUID()}`, delivery: "mock" };
  }

  async getProfile(): Promise<InstagramProfile | null> {
    return null;
  }

  async handleWebhook(): Promise<InboundEvent[]> {
    // Demo mode has no webhook source; simulated lead messages go through the
    // same ingest function directly (see simulateLeadMessage action).
    return [];
  }

  verifyWebhookChallenge(): string | null {
    return null;
  }
}
