---
"dotai": patch
---

Search git and local skill sources in additional repository locations before reporting no installable skills. The CLI now checks the repository root, `skills/`, `skills/.curated/`, `skills/.experimental/`, `skills/.system/`, and `.agents/skills/` when discovering installable skills.
