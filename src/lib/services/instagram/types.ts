/**
 * Instagram integration boundary.
 *
 * The rest of the app (pipeline, webhook route, actions, UI) talks ONLY to this
 * interface. Meta Graph API details live in a single implementation file
 * (meta.ts). MockInstagramService is used in demo mode.
 */

export interface InstagramProfile {
  externalId: string;
  username: string;
  name: string;
  avatarUrl: string | null;
}

export interface InstagramThread {
  externalThreadId: string;
  profile: InstagramProfile;
}

export interface InstagramMessage {
  externalMessageId: string;
  externalThreadId: string;
  /** Instagram-scoped id of whoever sent it. */
  senderExternalId: string;
  /** true when sent by the business account itself (includes DMs typed manually in the IG app). */
  isEcho: boolean;
  text: string;
  timestamp: string; // ISO
}

/** Normalized inbound event, independent of Meta's payload shape. */
export interface InboundEvent {
  thread: InstagramThread;
  message: InstagramMessage;
}

export interface SendMessageInput {
  externalThreadId: string;
  recipientExternalId: string;
  text: string;
}

export interface SendMessageResult {
  externalMessageId: string;
  /** "mock" means NOTHING was delivered to Instagram. */
  delivery: "instagram" | "mock";
}

export interface ConnectionStatus {
  kind: "mock" | "meta";
  connected: boolean;
  label: string;
  detail: string;
}

export interface InstagramService {
  readonly kind: "mock" | "meta";

  getStatus(): Promise<ConnectionStatus>;
  getConversation(externalThreadId: string): Promise<InstagramThread | null>;
  /** Latest messages for a thread, oldest to newest. Used for backfill/sync. */
  getMessages(externalThreadId: string, limit: number): Promise<InstagramMessage[]>;
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
  getProfile(externalUserId: string): Promise<InstagramProfile | null>;

  /**
   * Validates (signature) and parses a raw webhook POST into normalized events.
   * MUST throw WebhookValidationError when the request can't be trusted.
   */
  handleWebhook(rawBody: string, headers: Headers): Promise<InboundEvent[]>;
  /** GET subscription verification handshake. Returns the challenge to echo, or null if invalid. */
  verifyWebhookChallenge(params: URLSearchParams): string | null;
}

export class WebhookValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookValidationError";
  }
}

export class InstagramNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstagramNotConfiguredError";
  }
}

export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "InstagramApiError";
  }
}
