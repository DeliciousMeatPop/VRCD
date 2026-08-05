import { constants, promises as fs } from "fs";
import type { DownloadStorageStatus } from "../../../shared/types";

export interface StorageFileSystem {
  stat(path: string): Promise<{ isDirectory(): boolean }>;
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  access(path: string, mode: number): Promise<void>;
}

const nodeFileSystem: StorageFileSystem = {
  stat: (path) => fs.stat(path),
  mkdir: (path, options) => fs.mkdir(path, options),
  access: (path, mode) => fs.access(path, mode),
};

function errorDetails(error: unknown): {
  code: string | null;
  message: string;
} {
  if (error && typeof error === "object") {
    const code =
      "code" in error && typeof error.code === "string" ? error.code : null;
    const message =
      "message" in error && typeof error.message === "string"
        ? error.message
        : String(error);
    return { code, message };
  }
  return { code: null, message: String(error) };
}

export async function inspectDownloadStorage(
  path: string,
  options: { allowCreate?: boolean; fileSystem?: StorageFileSystem } = {},
): Promise<DownloadStorageStatus> {
  const fileSystem = options.fileSystem ?? nodeFileSystem;

  try {
    let stat: { isDirectory(): boolean };
    try {
      stat = await fileSystem.stat(path);
    } catch (error) {
      const { code } = errorDetails(error);
      if (code !== "ENOENT" || !options.allowCreate) throw error;
      await fileSystem.mkdir(path, { recursive: true });
      stat = await fileSystem.stat(path);
    }

    if (!stat.isDirectory()) {
      return {
        path,
        state: "unavailable",
        error: "The configured download location is not a directory.",
        code: "ENOTDIR",
      };
    }

    await fileSystem.access(path, constants.R_OK | constants.W_OK);
    return { path, state: "available", error: null, code: null };
  } catch (error) {
    const { code, message } = errorDetails(error);
    return { path, state: "unavailable", error: message, code };
  }
}
