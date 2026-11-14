# Catalog credential exposure and short-lived tokens

Status: proposal. No runtime behavior changes yet.

## Current model

Official builds embed a shared vrSrc catalog key at build time. Requests to
the protected catalog send it as `X-API-Key`. The key is shared by every
installation of a build, has no expiry, and cannot be revoked per installation.
The build pipeline obfuscates it so a plain string search does not reveal it,
but the decoder ships in the app and the source is public.

## What obfuscation can and cannot do

Obfuscation raises the cost of the cheapest extraction path:

- a released bundle contains no plaintext key;
- a per-build envelope means one decoded payload does not decode every build;
- authenticated encryption makes tampering fail closed.

It cannot stop a determined user. The decoded key exists in the main process,
and the lookup table is on the wire. Anyone willing to read the source, attach
a debugger, read process memory, or proxy HTTPS can recover the value. Treat
any embedded key as public and design what happens after it leaks.

## Short-lived token exchange

The server issues short-lived catalog tokens; the client keeps its build
credential only long enough to mint them.

```
POST /v1/catalog/token
X-Client-Credential: <embedded build credential>
X-Client-Build: <release channel + version, e.g. win-x64-1.9.0>
Content-Type: application/json

{ "installationId": "<random UUID stored at first run>" }

200 OK
{
  "token": "<opaque short-lived token>",
  "expiresAt": "2026-11-14T18:30:00Z",
  "scope": "catalog:read"
}
```

Catalog requests then send `Authorization: Bearer <token>`. A `401` or an
expired token triggers one re-mint and one retry; repeated failures surface a
clear error instead of a retry loop.

Why this changes the outcome:

- A leaked extractable credential mints tokens, but the server can rate-limit,
  attribute and revoke it per build channel without breaking every release.
- Tokens expire quickly, so a captured token has a small window and a narrow
  scope.
- The server can require an installation id, apply per-installation quotas, and
  detect one credential used by thousands of installations at once.

It does not make the embedded credential secret. It makes the credential's
abuse visible, bounded and revocable, which is the property a shipped client
can actually provide.

## Server contract

- Mint endpoint accepts the build credential over TLS only.
- Tokens are opaque, scoped to `catalog:read`, and expire in 15 minutes or less.
- The mint endpoint is rate-limited per credential and per installation id.
- The server records `X-Client-Build` so a leaked channel can be revoked
  independently.
- Revocation returns `403` with a stable error code; the app falls back to
  local-only mode instead of looping.
- Token metadata is never logged; the existing redaction of `X-API-Key` is
  extended to `Authorization` and token values.

## Client implementation sketch

- Keep the credential in the main process only, as today.
- Add a token cache keyed by server origin, with a small safety margin before
  expiry.
- Send `X-Client-Build` on mint and `Authorization: Bearer` on catalog calls.
- Persist only a random installation id, not the credential or tokens.
- On `401`, refresh once; on repeated failure, disable catalog sync and leave
  local sideloading untouched.
- Cover mint, refresh, expiry, revocation and redaction with unit tests.
- Make the feature optional: servers without the mint endpoint keep using the
  existing header until they add it.

## Rollout

1. Server adds the mint endpoint and accepts bearer tokens alongside
   `X-API-Key`.
2. One release channel uses token exchange; the shared key keeps working.
3. Once every supported server accepts tokens, stop shipping a reusable shared
   key and issue per-channel credentials.

Until step 3, the embedded credential remains extractable. That is expected;
the goal is to make extraction less valuable, not to pretend it is impossible.

## Non-goals

- Preventing a user from reading their own process memory.
- Client-side attestation strong enough to prove "this is really our binary";
  desktop platforms do not provide it.
- Hiding the token exchange protocol; it is documented here.
