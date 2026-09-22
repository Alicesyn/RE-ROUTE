# Testing & Verification Constraints

- **No In-Browser Testing by Default**: Do **NOT** perform in-browser testing, launch `browser_subagent`, or record browser walkthrough videos to confirm code or UI changes.
- **Quota Protection**: In-browser testing and browser sessions consume excessive token and model quota. Only perform in-browser testing when the user explicitly and specifically requests it.
- **Allowed Verification**: Confirm all code, state, and UI changes using fast, quota-free methods:
  - `npm run build` (TypeScript compilation & bundling checks)
  - Unit/integration verification scripts run via terminal
  - Linting (`npm run lint`)
