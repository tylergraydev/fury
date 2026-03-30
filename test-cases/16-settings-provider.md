# TC-16: Settings — Provider Configuration

## TC-16.01: Open settings
- **Steps:**
  1. Press **Cmd+,** or click settings icon
- **Expected:** Settings panel opens as overlay dialog.

## TC-16.02: Agent type — Claude Code (default)
- **Steps:**
  1. Go to Settings > Provider
  2. Verify Claude Code is selected
- **Expected:** Agent type shows "Claude Code" as default. Claude-specific options available.

## TC-16.03: Agent type — switch to Codex CLI
- **Steps:**
  1. Go to Settings > Provider
  2. Select "Codex CLI"
- **Expected:** Agent type changes. Model options update to Codex models. Chat behavior changes to one-shot mode.

## TC-16.04: Provider — Anthropic (default)
- **Steps:**
  1. Go to Settings > Provider
  2. Select Anthropic provider
  3. Enter ANTHROPIC_API_KEY
- **Expected:** API key saved. Agent uses Anthropic API directly.

## TC-16.05: Provider — OpenRouter
- **Steps:**
  1. Select OpenRouter provider
  2. Enter OPENROUTER_API_KEY
- **Expected:** Provider switches to OpenRouter. Requests routed through OpenRouter.

## TC-16.06: Provider — Vercel AI Gateway
- **Steps:**
  1. Select Vercel AI Gateway
  2. Enter VERCEL_API_KEY
- **Expected:** Provider switches to Vercel.

## TC-16.07: Provider — Bedrock
- **Steps:**
  1. Select Bedrock
  2. Enter AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
- **Expected:** All three credentials required. Provider switches to AWS Bedrock.

## TC-16.08: Provider — Vertex
- **Steps:**
  1. Select Vertex
  2. Enter GOOGLE_APPLICATION_CREDENTIALS, GOOGLE_PROJECT_ID
- **Expected:** Provider switches to Google Vertex AI.

## TC-16.09: Provider — Azure Foundry
- **Steps:**
  1. Select Azure Foundry
  2. Enter AZURE_API_KEY, AZURE_ENDPOINT
- **Expected:** Provider switches to Azure.

## TC-16.10: Provider — Custom
- **Steps:**
  1. Select Custom provider
  2. Add custom environment variables
- **Expected:** Custom provider configured with user-defined variables.

## TC-16.11: API key — show/hide toggle
- **Steps:**
  1. Enter an API key
  2. Click the show/hide eye icon
- **Expected:** Key toggles between masked (dots) and visible text.

## TC-16.12: Additional environment variables
- **Steps:**
  1. Add a custom env var (e.g., `MY_VAR=myvalue`)
  2. Save settings
- **Expected:** Custom env var saved. Available to agent processes.

## TC-16.13: Codex CLI — OpenAI API key
- **Precondition:** Agent type set to Codex CLI
- **Steps:**
  1. Enter OPENAI_API_KEY
  2. Send a message
- **Expected:** Codex CLI uses the OpenAI key for API calls.

## TC-16.14: Provider settings persist across restart
- **Steps:**
  1. Configure provider and API key
  2. Restart app
  3. Check settings
- **Expected:** Provider type and API key preserved.

## TC-16.15: Repository-level provider override
- **Steps:**
  1. Go to Repository Settings
  2. Set a provider override (different from global)
  3. Send a message in that repo's workspace
- **Expected:** Workspace uses the repo-level provider override instead of global settings.
