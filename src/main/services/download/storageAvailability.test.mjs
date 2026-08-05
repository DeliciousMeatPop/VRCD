import assert from "node:assert/strict";
import test from "node:test";
import { inspectDownloadStorage } from "./storageAvailability.ts";

const directory = { isDirectory: () => true };

test("reports an existing readable and writable directory as available", async () => {
  const status = await inspectDownloadStorage("/downloads", {
    fileSystem: {
      stat: async () => directory,
      mkdir: async () => undefined,
      access: async () => undefined,
    },
  });

  assert.deepEqual(status, {
    path: "/downloads",
    state: "available",
    error: null,
    code: null,
  });
});

test("does not recreate a missing custom download location during launch", async () => {
  let mkdirCalled = false;
  const status = await inspectDownloadStorage("/Volumes/missing/VRCD", {
    allowCreate: false,
    fileSystem: {
      stat: async () => {
        throw Object.assign(new Error("volume missing"), { code: "ENOENT" });
      },
      mkdir: async () => {
        mkdirCalled = true;
      },
      access: async () => undefined,
    },
  });

  assert.equal(mkdirCalled, false);
  assert.equal(status.state, "unavailable");
  assert.equal(status.code, "ENOENT");
});

test("creates a missing location only when creation is explicitly allowed", async () => {
  let exists = false;
  const status = await inspectDownloadStorage("/local/downloads", {
    allowCreate: true,
    fileSystem: {
      stat: async () => {
        if (!exists)
          throw Object.assign(new Error("missing"), { code: "ENOENT" });
        return directory;
      },
      mkdir: async () => {
        exists = true;
      },
      access: async () => undefined,
    },
  });

  assert.equal(status.state, "available");
});

test("reports permission failures without throwing", async () => {
  const status = await inspectDownloadStorage("/Volumes/locked/VRCD", {
    fileSystem: {
      stat: async () => directory,
      mkdir: async () => undefined,
      access: async () => {
        throw Object.assign(new Error("permission denied"), { code: "EACCES" });
      },
    },
  });

  assert.equal(status.state, "unavailable");
  assert.equal(status.code, "EACCES");
  assert.match(status.error, /permission denied/);
});
