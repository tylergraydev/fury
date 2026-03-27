# Known Bugs

## 1. Double-speak in chat responses
**Status:** Open
**Description:** Claude occasionally sends duplicate responses to a single message. The same answer appears twice in the chat.
**Repro:** Ask a simple question — sometimes the response is duplicated.

## 2. Plan mode toggle doesn't actually enable plan mode
**Status:** Fixed (branch: `tylergraydev/native-plan-mode`)
**Description:** The plan mode toggle in the Composer defaults to ON and visually shows as active. Previously the `disable_plan_mode` flag was extracted but never used — `permissionMode` was hardcoded to `"default"`.
**Fix:** `permissionMode` is now set to `"plan"` when plan mode is enabled, using the SDK's native plan mode. Plan approval sends with `permissionMode: "default"` to transition to execution.
