# TC-32: Performance Monitoring

## TC-32.01: IPC instrumentation — automatic tracking
- **Steps:**
  1. Use the app normally (open files, send messages, etc.)
  2. Check performance metrics
- **Expected:** All Tauri IPC calls tracked with latency measurements. Data batched every 2 seconds.

## TC-32.02: Frame monitoring
- **Steps:**
  1. Enable performance monitoring
  2. Perform UI-heavy operations (resize panels, scroll long lists)
- **Expected:** Frame rate tracked. Performance issues detected if frame rate drops.

## TC-32.03: Agent turn metrics
- **Steps:**
  1. Send messages to agent
  2. Check agent turn metrics
- **Expected:** Per-turn metrics recorded: duration, tokens, cost.

## TC-32.04: Toggle performance monitor on/off
- **Steps:**
  1. Enable performance monitoring
  2. Verify metrics are collected
  3. Disable monitoring
  4. Verify collection stops
- **Expected:** Metrics only collected when monitoring is enabled. No overhead when disabled.

## TC-32.05: Get performance status
- **Steps:**
  1. Query performance metrics
- **Expected:** Returns collected IPC latency, frame metrics, and agent metrics summary.
