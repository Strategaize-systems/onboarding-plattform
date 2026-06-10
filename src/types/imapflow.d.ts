// Minimal type declarations for imapflow (no @types/imapflow available).
//
// 1:1-Port aus strategaize-business-system/cockpit/src/types/imapflow.d.ts
// (Reuse-Quelle BLOCKING per .claude/rules/strategaize-pattern-reuse.md).
// V9.1 SLC-V9.1-A MT-R3 (REVISION R1, DEC-205 IMAP-Reuse).

declare module "imapflow" {
  export interface ImapFlowOptions {
    host: string;
    port: number;
    secure?: boolean;
    auth: {
      user: string;
      pass: string;
    };
    logger?: false | object;
  }

  export interface MailboxObject {
    exists: number;
    uidNext: number;
    path: string;
  }

  export interface FetchMessageObject {
    uid: number;
    source: Buffer;
    envelope?: {
      messageId: string;
      date: Date;
      subject: string;
      from: Array<{ address: string; name: string }>;
      to: Array<{ address: string; name: string }>;
    };
  }

  export interface MailboxLockObject {
    release: () => void;
  }

  export class ImapFlow {
    mailbox: MailboxObject | null;
    constructor(options: ImapFlowOptions);
    connect(): Promise<void>;
    logout(): Promise<void>;
    getMailboxLock(path: string): Promise<MailboxLockObject>;
    search(
      query: Record<string, unknown>,
      options?: { uid?: boolean }
    ): Promise<number[]>;
    fetch(
      range: string,
      query: { source?: boolean; uid?: boolean; envelope?: boolean },
      options?: { uid?: boolean }
    ): AsyncIterable<FetchMessageObject>;
  }
}
