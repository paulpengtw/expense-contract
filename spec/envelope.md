# Signing envelope (normative)

A request is a JSON object with `ts`, `nonce`, `payload`, and `sig`. The signer serializes its payload value with JSON.stringify, encodes the resulting UTF-8 bytes as unpadded base64url, and signs the literal UTF-8 string `ts + "." + nonce + "." + payloadB64` with HMAC-SHA256 and the UTF-8 secret. `sig` is the unpadded base64url encoding of the HMAC bytes. Verification authenticates the received `payload` text before decoding or parsing it. Two different valid JSON serializations of the same value may each be signed and accepted; canonical JSON is not required.

| Model key | Normative value | Rule |
| --- | ---: | --- |
| `maxSkewSeconds` | 300 | Absolute clock difference is accepted inclusively at both boundaries. |
| `nonceCacheSeconds` | 600 | Existing response-cache lifetime; cache is not the durable duplicate record. |
| `lockWaitMilliseconds` | 30000 | Existing script-lock wait limit for protected writes. |

The extracted verifier is the current production behavior. It calls `Number(envelope.ts)` and `String(value || '')` for the other fields. A missing or non-finite timestamp yields `missing ts`; an empty nonce, payload or signature yields the corresponding `missing ...` error. A nonobject yields `invalid envelope`. A clock difference greater than the inclusive limit yields `request timestamp outside allowed window`. A wrong signature yields `bad signature`. A correctly signed but invalid payload encoding or JSON fails during decode/parse. `doPost` wraps these errors in `{ok:false,error}`. Incoming types and base64 padding are currently permissive because of coercion and the existing decoder; stronger validation requires a deliberate protocol change and consumer adoption.

Protected writes require a duplicate key, a serialized lock covering the durable check and effect, and a permanent record of that key. The intended durable record is the spreadsheet `txn_id` column; a cache holds only responses and may disappear. The existing `create_transaction` and `settle` paths check `findTxnRow_` while holding the script lock. Duplicate reporting as `already` is valid only when an actual prior record/result exists. A lock or durable-storage failure must refuse the operation; failure before a write leaves no success record. Read-only actions may repeat.

Current production gaps remain: both ledgers' `reverse_transaction` paths do not scan their own idempotency key after cache loss, so the same key against another target can append a second reversal. Solo `checkConsistency_({repair:true})` writes derived status without a durable duplicate key. Solo `health` and `get_options` may install formulas or update a script property without a nonce/lock; they are not proven read-only exemptions. These require ledger changes and real-storage conformance before a full replay-protection claim. This repository's adapter tests define required behavior but do not prove deployed spreadsheet behavior.
