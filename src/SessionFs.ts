import * as fs from "node:fs/promises";
import * as path from "node:path";
import { setInterval } from "node:timers/promises";
import type { PluginInput } from "@opencode-ai/plugin";
import type { Event } from "@opencode-ai/sdk";
import { xdgData } from "xdg-basedir";
import { Seconds } from "@/utils.ts";

export type Path = string;
export type AbsolutePath = string;

export interface SessionFs {
  /**
   * Create a random file to store data for this session in specified realm
   * @param realm Just a random string for further identification, may, for example, be tool name
   * @param sessionId
   * @param writeOnly Open only for writing
   */
  createFile(realm: string, sessionId: string, writeOnly?: boolean): Promise<[AbsolutePath, fs.FileHandle]>;

  /**
   * Normally, {@link opencodeEventListener} should be enough,
   * this is just a precaution to keep data dir size in check
   */
  startBookkeeping(): Promise<void>;

  /**
   * Removes session data from disk when the session is deleted
   */
  opencodeEventListener(event: Event): Promise<void>;
}

// biome-ignore lint/style/noMagicNumbers: ...
const DEFAULT_BOOKKEEPING_FREQUENCY: Seconds = Seconds.fromHours(12);
const THIS_PLUGIN_DATA_DIR_SUFFIX = "opencode-interpreters";

export const SessionFs = {
  create(
    opencodeClient: PluginInput["client"],
    dataDirSuffix: string = THIS_PLUGIN_DATA_DIR_SUFFIX,
    bookkeepingFrequency: Seconds = DEFAULT_BOOKKEEPING_FREQUENCY,
  ): Promise<SessionFs> {
    return OpencodeSessionFs.create(opencodeClient, dataDirSuffix, bookkeepingFrequency);
  },
};

class OpencodeSessionFs implements SessionFs {
  constructor(
    private readonly dataDir: AbsolutePath,
    private readonly opencodeClient: PluginInput["client"],
    private readonly bookkeepingFrequency: Seconds = DEFAULT_BOOKKEEPING_FREQUENCY,
  ) {}

  static async create(
    opencodeClient: PluginInput["client"],
    dataDirSuffix: string = THIS_PLUGIN_DATA_DIR_SUFFIX,
    bookkeepingFrequency: Seconds = DEFAULT_BOOKKEEPING_FREQUENCY,
  ): Promise<OpencodeSessionFs> {
    // ideally, this would have been under opencode data dir, but of course it is not exposed...
    // biome-ignore lint/style/noNonNullAssertion: opencode will die earlier if it is not available
    const dataDir = path.resolve(xdgData!, dataDirSuffix);
    return new OpencodeSessionFs(dataDir, opencodeClient, bookkeepingFrequency);
  }

  async createFile(
    realm: string,
    sessionId: string,
    writeOnly?: boolean,
  ): Promise<[AbsolutePath, fs.FileHandle]> {
    const sessionDir = path.resolve(this.dataDir, this.sessionIdToDirName(sessionId), realm);
    await fs.mkdir(this.dataDir, { recursive: true });

    const fileId = this.generateRandom32Characters();
    const filePath = path.resolve(sessionDir, fileId);

    return [filePath, await fs.open(filePath, `w${writeOnly ? "" : "+"}`)];
  }

  /**
   * Precaution against removing something important in case of misconfiguration
   */
  private sessionIdToDirName(sessionId: string): string {
    return `session.${sessionId}`;
  }

  private isSessionDir(dirName: string): boolean {
    return dirName.startsWith("session.");
  }

  private generateRandom32Characters(): string {
    const maxBase36CharactersIn64BitFloat = 11;
    const base3611Characters = () => this.base36(Math.random()).slice(2, maxBase36CharactersIn64BitFloat + 2);
    const now = Date.now();
    // using date prefix to make it ordered
    const randomString = this.base36(now) + new Array(2).map(() => base3611Characters()).join("");

    // biome-ignore lint/style/noMagicNumbers: self-explanatory
    return randomString.slice(0, 32);
  }

  private base36(data: number): string {
    // biome-ignore lint/style/noMagicNumbers: self-explanatory
    return data.toString(36);
  }

  async opencodeEventListener(event: Event): Promise<void> {
    if (event.type !== "session.deleted") {
      return;
    }

    const sessionDir = path.resolve(this.dataDir, this.sessionIdToDirName(event.properties.info.id));
    const sessionDirExists = await fs.exists(sessionDir);
    if (!sessionDirExists) {
      return;
    }

    await fs.rm(sessionDir, { recursive: true, force: true });
  }

  async startBookkeeping(): Promise<void> {
    // running bookkeeping loop
    for await (const _ of setInterval(Seconds.toMs(this.bookkeepingFrequency))) {
      const allDirs = await fs.readdir(this.dataDir, { recursive: false });
      const sessionDirs = allDirs.filter((dirName) => this.isSessionDir(dirName));
      const activeSessions = (await this.opencodeClient.session.list()).data ?? [];
      const activeSessionDirs = activeSessions.map((session) => this.sessionIdToDirName(session.id));

      const removedSessions = new Set(sessionDirs).difference(new Set(activeSessionDirs));

      await Promise.all(
        removedSessions
          .values()
          .map((removedSession) =>
            fs.rm(path.resolve(this.dataDir, removedSession), { recursive: true, force: true }),
          ),
      );
    }
  }
}
