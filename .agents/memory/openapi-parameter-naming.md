---
name: OpenAPI parameter naming
description: Avoid generated TypeScript export collisions between path parameters and optional query parameters.
---

When an OpenAPI operation combines a path parameter with optional query parameters, Orval can generate same-name parameter exports for its Zod and TypeScript outputs. The generated barrel then fails with a duplicate-export TypeScript error.

**Why:** The generators name the path-parameter schema and the query-parameter type from the same operation ID, so both become public under one identifier.

**How to apply:** Keep operations path-only or query-only when practical, or change the generator's export strategy. Re-run API code generation and library typechecking after changing the contract.
