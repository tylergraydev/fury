# TC-15: Dev Containers

## TC-15.01: Detect devcontainer.json
- **Precondition:** Repository has `.devcontainer/devcontainer.json`
- **Steps:**
  1. Add or open repository
  2. Check repository settings > Dev Container
- **Expected:** Dev container path auto-detected and displayed.

## TC-15.02: Enable dev container for workspace
- **Steps:**
  1. Open repository settings > Dev Container
  2. Enable dev container toggle
  3. Create a new workspace
- **Expected:** New workspace created with dev container support. Container build begins.

## TC-15.03: Container status — Building
- **Steps:**
  1. Create a workspace with dev container enabled
  2. Observe container status panel
- **Expected:** Status shows "Building". Build logs stream in real-time.

## TC-15.04: Container status — Running
- **Steps:**
  1. Wait for container build to complete
- **Expected:** Status changes to "Running". Container ID displayed (first 12 chars). Start/Stop/Rebuild buttons available.

## TC-15.05: Container status — Stopped
- **Steps:**
  1. Click "Stop" on a running container
- **Expected:** Status changes to "Stopped". Start button available to restart.

## TC-15.06: Container status — Error
- **Steps:**
  1. Trigger a container error (e.g., invalid Dockerfile)
- **Expected:** Status shows "Error" with error message displayed. Rebuild button available.

## TC-15.07: Start container
- **Precondition:** Container in Stopped state
- **Steps:**
  1. Click "Start"
- **Expected:** Container starts. Status changes to Running. Services available.

## TC-15.08: Stop container
- **Steps:**
  1. Click "Stop" on running container
- **Expected:** Container stops gracefully. Status changes to Stopped.

## TC-15.09: Rebuild container
- **Steps:**
  1. Click "Rebuild"
- **Expected:** Container image rebuilt from scratch. Status goes through Building → Running. Fresh environment.

## TC-15.10: Container logs
- **Steps:**
  1. View container logs section
- **Expected:** Shows last 100 lines of container logs. Auto-scrolls for new entries. Real-time streaming.

## TC-15.11: Backend — devcontainer CLI
- **Precondition:** Container backend set to `devcontainerCli`
- **Steps:**
  1. Build and start container
- **Expected:** Uses `devcontainer` CLI commands for lifecycle management.

## TC-15.12: Backend — raw Docker
- **Precondition:** Container backend set to `rawDocker`
- **Steps:**
  1. Set Docker image (e.g., `node:20`)
  2. Build and start container
- **Expected:** Uses raw `docker` commands. Specified image pulled and used.

## TC-15.13: Agent execution — host mode
- **Precondition:** Agent exec mode set to `host`
- **Steps:**
  1. Send a message to agent in containerized workspace
- **Expected:** Agent runs on host machine, not inside container. Agent can still interact with container files.

## TC-15.14: Agent execution — container mode
- **Precondition:** Agent exec mode set to `container`
- **Steps:**
  1. Send a message to agent
- **Expected:** Agent execution wrapped in `docker exec`. Agent runs inside the container.

## TC-15.15: Docker Compose configuration
- **Steps:**
  1. Set compose file and service name in dev container config
  2. Start container
- **Expected:** Docker Compose used for multi-container setup. Specified service is the primary workspace container.

## TC-15.16: Extra Docker arguments
- **Steps:**
  1. Add extra Docker args (e.g., `["--gpus=all"]`)
  2. Rebuild container
- **Expected:** Extra arguments passed to Docker run command.

## TC-15.17: Container environment variables
- **Steps:**
  1. Add env vars to container config (e.g., `NODE_ENV=development`)
  2. Rebuild container
  3. Open terminal in container
  4. Run `echo $NODE_ENV`
- **Expected:** Environment variables available inside container.

## TC-15.18: Containerize repository
- **Precondition:** Repository without a devcontainer.json
- **Steps:**
  1. Select "Containerize" option
- **Expected:** AI-generated `devcontainer.json` proposed. Review before applying. Can apply to workspace or commit to repo.

## TC-15.19: Update devcontainer config
- **Steps:**
  1. Edit devcontainer configuration
  2. Apply changes
- **Expected:** Configuration updated without full rebuild (if possible). Changes take effect.

## TC-15.20: Container workspace path
- **Steps:**
  1. Set container workspace path (e.g., `/workspaces/myapp`)
  2. Open terminal in container
  3. Check `pwd`
- **Expected:** Terminal and agent use the configured workspace path inside the container.
