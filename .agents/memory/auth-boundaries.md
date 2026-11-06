---
name: Authentication privacy boundaries
description: Why sign-out requires discarding mounted private state, not only clearing a cache.
---
Treat every authentication change as a privacy boundary: private results must disappear immediately from mounted screens, and public and signed-in dashboard requests must not share an identity.

**Why:** A real browser check showed a signed-out navigation could retain personal dashboard results despite the cache having been cleared. Private-route gating alone did not protect the public dashboard.

**How to apply:** Check the visible dashboard after sign-out and account switching whenever authentication or dashboard caching changes. Do not consider a successful logout response sufficient evidence.
