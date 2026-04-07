Regenerate and validate tauri-specta TypeScript bindings. This ensures Rust backend types and command signatures are in sync with the frontend.

## Steps

1. **Regenerate bindings**: Run `cd src-tauri && cargo test export_specta_bindings` to regenerate `src/lib/tauri/bindings.generated.ts` from the current Rust source.

2. **Check for drift**: Run `git diff src/lib/tauri/bindings.generated.ts` to see if the generated file changed. If it changed, the Rust types or command signatures were modified without regenerating bindings.

3. **Type audit**: Compare types in `src/lib/tauri/bindings.generated.ts` (generated, source of truth) against `src/lib/tauri/types.ts` (manual, used by existing wrappers). Flag any discrepancies where the manual types diverge from generated types — these are potential type safety bugs.

4. **Missing annotations check**: Search for any `#[tauri::command]` in `src-tauri/src/commands/` that is NOT followed by `#[specta::specta]`. Search for any struct/enum with `Serialize` or `Deserialize` in `src-tauri/src/models/` that is missing `specta::Type` in its derive. Report any findings.

5. **Registration check**: Verify that commands in `collect_commands!` in `lib.rs` match the actual `#[tauri::command]` functions. Flag any command defined but not registered, or registered but not defined.

6. **Report results**: Summarize what was found — whether bindings are in sync, any type mismatches, any missing annotations.
