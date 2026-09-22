# Workspace Agent Rules & Constraints

## Testing & Verification Guidelines

- **No In-Browser Testing by Default**: Do **NOT** perform in-browser testing, invoke `browser_subagent`, or record browser sessions to verify code or UI changes.
- **Quota Conservation**: In-browser testing consumes significant API token quota. In-browser testing must ONLY be conducted when explicitly and specifically requested by the user.
- **Primary Verification Methods**:
  - Run `npm run build` to verify type safety and bundle integrity.
  - Run targeted test/validation scripts via terminal commands.
  - Run `npm run lint` for code style and formatting checks.
