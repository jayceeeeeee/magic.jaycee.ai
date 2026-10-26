# Public Master content for magic-dev

`masters.dev.json` is the public-content snapshot of Buddha, Jesus and Yogananda
copied from production on 2026-10-26. It contains their profile presentation,
lore, karma/manna values, three game definitions and fifteen skills. The UUIDs in
this snapshot are source identifiers; they must not be treated as dev Auth IDs.

The one-time import linked the following accounts already created and confirmed
in `magic-dev`:

| Master | Source profile ID | Development profile ID |
| --- | --- | --- |
| Buddha | `5dd4e584-2f03-4a94-b442-528ca19492e1` | `59008ad4-5675-4d25-bdad-ebeea9cd8419` |
| Jesus | `7abd58ec-1289-403d-932c-dc2df233d079` | `50edc493-a776-41f6-b5e3-0e2d78eff070` |
| Yogananda | `b7a38b31-100f-4e03-b3e8-9357c635ecf8` | `0ad611ab-73ad-4ece-a11c-09b13bf5db5d` |

New UUIDs were generated for every game and skill. Source game slots were mapped
to the corresponding new skill IDs. Target accounts had no existing game, skills
or named profile; the import refused to overwrite populated targets. The import
was first tested in a transaction with rollback, then committed after verification.
Existing dev account credentials and permissions were preserved.

Their three avatar files were copied into the dev `users` bucket under each new
profile ID. Downloaded source and destination bytes had matching SHA-256 hashes:

| Master | Bytes | SHA-256 |
| --- | --- | --- |
| Buddha | 48640 | `8c110c66f7548f7baac693d68eec8e39e557d4bfeb0f482d56f1ed2ea484e5ec` |
| Jesus | 186574 | `174bc1d5746e4b111adec33705aae8dd8ba34d6421307fa113b196fa5ebb19e0` |
| Yogananda | 91275 | `03e947811eac4b803a707860fdb6c8a465ac7475050ed9b06c54cf4d366bc654` |

A temporary fixed-scope `seed-master-avatars` Edge Function performed this Storage
copy using a one-time authorization token. It was immediately replaced with an
inactive implementation returning HTTP 410, with gateway JWT verification enabled.
No import credentials were committed to this repository.

Verification: all three profiles satisfy `is_public_master`, are readable by the
anonymous website role, and have five correctly ordered skills whose labels and
descriptions match production. `app-config.js` maps the featured Master IDs to
their dev equivalents so the carousel preserves its existing display/link rules.
Jesus and Buddha remain locked in the carousel, as in production.

This is not a complete account export. Auth passwords/sessions, private personal
details, prayers, practice history, notification receipts and other users'
participations were not copied. Automatic approval review rejected broad account
exports; the completed import used only the explicitly listed public fields.
Production was read-only throughout.

This JSON is an audit snapshot, not an automatically executed migration. Future
imports must resolve target accounts and map IDs again rather than replaying
production identifiers or overwriting existing dev content.
