import { useState, useMemo, useCallback, useRef } from "react";
import type { SlashCommand } from "../lib/tauri";
import { useSlashCommandStore } from "../stores/slashCommandStore";
import { usePromptLibraryStore } from "../stores/promptLibraryStore";
import { BUILTIN_COMMANDS, type BuiltinCommand } from "../lib/builtinCommands";
import { extractVariables, isAutoFillVariable, substituteVariables } from "../lib/promptVariables";

const EMPTY_COMMANDS: SlashCommand[] = [];

export function useSlashCommandAutocomplete(
  contextId: string,
  getText: () => string,
  setText: (value: string) => void,
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  setPendingCommandName: (name: string | null) => void,
  setPendingCommandContent: (content: string | null) => void,
  openPromptLibrary: () => void,
) {
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);

  const fileCommands = useSlashCommandStore((s) =>
    s.commands[contextId] ?? EMPTY_COMMANDS,
  );
  const discoveredSkills = useSlashCommandStore((s) =>
    s.discoveredSkills[contextId] ?? EMPTY_COMMANDS,
  );
  const libraryPrompts = usePromptLibraryStore((s) => s.prompts);
  const promptCommands: SlashCommand[] = useMemo(() => {
    return libraryPrompts.map((p) => ({
      name: `prompt:${p.name}`,
      source: "built-in" as const,
      /* v8 ignore start -- defensive fallback; prompts always have description */
      description: p.description ?? `Prompt: ${p.name}`,
      /* v8 ignore stop */
      content: p.content,
    }));
  }, [libraryPrompts]);

  const allCommands: SlashCommand[] = useMemo(() => {
    const knownNames = new Set(fileCommands.map((c) => c.name));
    const uniqueSkills = discoveredSkills.filter((s) => !knownNames.has(s.name));
    return [...BUILTIN_COMMANDS, ...promptCommands, ...fileCommands, ...uniqueSkills];
  }, [fileCommands, discoveredSkills, promptCommands]);

  const matchingCommands = useMemo(() => {
    if (!slashFilter) return allCommands;
    const lower = slashFilter.toLowerCase();
    return allCommands.filter((c) => c.name.toLowerCase().startsWith(lower));
  }, [allCommands, slashFilter]);

  // Use a ref to always have latest text for the callback without re-creating it on every keystroke
  const textRef = useRef(getText);
  textRef.current = getText;

  const selectSlashCommand = useCallback(
    (cmd: SlashCommand) => {
      const text = textRef.current();
      const ta = textareaRef.current;
      /* v8 ignore next -- @preserve */
      const cursorPos = ta?.selectionStart ?? text.length;
      const textBeforeCursor = text.substring(0, cursorPos);
      const lastNewline = textBeforeCursor.lastIndexOf("\n");
      const lineStart = lastNewline + 1;
      const textAfterCursor = text.substring(cursorPos);
      const textBeforeLine = text.substring(0, lineStart);

      const asBuiltin = cmd as BuiltinCommand;
      if (asBuiltin.action) {
        asBuiltin.action();
        setText(textBeforeLine + textAfterCursor);
        setShowSlashMenu(false);
        return;
      }

      if (cmd.name.startsWith("prompt:") && cmd.content) {
        const variables = extractVariables(cmd.content);
        const hasCustomVars = variables.some((v) => !isAutoFillVariable(v));
        if (hasCustomVars) {
          setText(textBeforeLine + textAfterCursor);
          setShowSlashMenu(false);
          openPromptLibrary();
          return;
        }
        const values: Record<string, string> = {};
        const resolved = substituteVariables(cmd.content, values);
        setText(textBeforeLine + textAfterCursor);
        setPendingCommandName(`/${cmd.name}`);
        setPendingCommandContent(resolved);
        setShowSlashMenu(false);
        return;
      }

      setText(textBeforeLine + `/${cmd.name}` + textAfterCursor);
      setPendingCommandName(`/${cmd.name}`);
      setPendingCommandContent(cmd.content);
      setShowSlashMenu(false);
    },
    [textareaRef, setText, setPendingCommandName, setPendingCommandContent, openPromptLibrary],
  );

  const handleSlashInput = useCallback((currentLine: string) => {
    if (currentLine.startsWith("/")) {
      setShowSlashMenu(true);
      setSlashFilter(currentLine.substring(1));
      setSelectedSlashIndex(0);
    } else {
      setShowSlashMenu(false);
    }
  }, []);

  const handleSlashKeyDown = useCallback((e: React.KeyboardEvent): boolean => {
    if (!showSlashMenu || matchingCommands.length === 0) return false;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSlashIndex((prev) =>
        Math.min(prev + 1, matchingCommands.length - 1),
      );
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSlashIndex((prev) => Math.max(prev - 1, 0));
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      selectSlashCommand(matchingCommands[selectedSlashIndex]);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setShowSlashMenu(false);
      return true;
    }
    return false;
  }, [showSlashMenu, matchingCommands, selectedSlashIndex, selectSlashCommand]);

  return {
    showSlashMenu,
    setShowSlashMenu,
    slashFilter,
    selectedSlashIndex,
    matchingCommands,
    selectSlashCommand,
    handleSlashInput,
    handleSlashKeyDown,
  };
}
