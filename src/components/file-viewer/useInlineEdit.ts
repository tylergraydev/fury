import { useEffect, useRef, useCallback, type MutableRefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import type * as Monaco from "monaco-editor";
import type { FileTab } from "../../stores/fileViewerStore";
import { useFileViewerStore } from "../../stores/fileViewerStore";
import { useInlineEditStore } from "../../stores/inlineEditStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { InlineEditWidget } from "./InlineEditWidget";

/**
 * Hook that integrates Cmd+K inline editing into a Monaco editor instance.
 *
 * Registers a Monaco action for Cmd+K, manages ViewZone + ContentWidget lifecycle,
 * and applies diff decorations when previewing generated edits.
 */
export function useInlineEdit(
  editorRef: MutableRefObject<Monaco.editor.IStandaloneCodeEditor | null>,
  monacoRef: MutableRefObject<typeof Monaco | null>,
  tab: FileTab,
) {
  const widgetRef = useRef<Monaco.editor.IContentWidget | null>(null);
  const zoneIdRef = useRef<string | null>(null);
  const reactRootRef = useRef<Root | null>(null);
  const decorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
  const originalContentRef = useRef<string | null>(null);

  // Register Cmd+K action on editor mount
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    // Guard: Monaco KeyMod/KeyCode may not exist in test environments
    if (!monaco.KeyMod?.CtrlCmd || !monaco.KeyCode?.KeyK) return;

    const disposable = editor.addAction({
      id: "fury.inline-edit",
      label: "Inline Edit (Cmd+K)",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK],
      precondition: undefined,
      run: (ed) => {
        const selection = ed.getSelection();
        if (!selection) return;

        const model = ed.getModel();
        if (!model) return;

        // If empty selection, select the current line
        let effectiveSelection = selection;
        if (selection.isEmpty()) {
          const line = selection.startLineNumber;
          effectiveSelection = new monaco.Selection(
            line,
            1,
            line,
            model.getLineMaxColumn(line),
          );
          ed.setSelection(effectiveSelection);
        }

        const selectedText = model.getValueInRange(effectiveSelection);
        if (!selectedText.trim()) return;

        const editId = crypto.randomUUID();

        useInlineEditStore.getState().startSession({
          editId,
          tabId: tab.id,
          filePath: tab.filePath,
          language: tab.language,
          originalText: selectedText,
          selectionRange: {
            startLineNumber: effectiveSelection.startLineNumber,
            startColumn: effectiveSelection.startColumn,
            endLineNumber: effectiveSelection.endLineNumber,
            endColumn: effectiveSelection.endColumn,
          },
        });
      },
    });

    return () => disposable.dispose();
  }, [editorRef, monacoRef, tab.id, tab.filePath, tab.language]);

  // Manage ViewZone + ContentWidget based on session state
  const session = useInlineEditStore((s) => s.session);

  const cleanup = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // Remove content widget
    if (widgetRef.current) {
      editor.removeContentWidget(widgetRef.current);
      widgetRef.current = null;
    }

    // Remove view zone
    if (zoneIdRef.current) {
      editor.changeViewZones((accessor) => {
        if (zoneIdRef.current) {
          accessor.removeZone(zoneIdRef.current);
          zoneIdRef.current = null;
        }
      });
    }

    // Unmount React root
    if (reactRootRef.current) {
      reactRootRef.current.unmount();
      reactRootRef.current = null;
    }

    // Clear decorations
    if (decorationsRef.current) {
      decorationsRef.current.clear();
      decorationsRef.current = null;
    }
  }, [editorRef]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;

    // Not our tab or no session — bail out
    if (!editor || !monaco || !session || session.tabId !== tab.id) {
      return;
    }

    // Create widget if not yet created
    if (!widgetRef.current && (session.status === "prompting" || session.status === "generating")) {
      const domNode = document.createElement("div");
      domNode.style.zIndex = "100";

      const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? "";
      const fullFileContent = tab.editedContent ?? tab.content ?? "";

      const root = createRoot(domNode);
      reactRootRef.current = root;
      root.render(
        createElement(InlineEditWidget, { workspaceId, fullFileContent }),
      );

      // Add ViewZone to push content down
      editor.changeViewZones((accessor) => {
        const zone: Monaco.editor.IViewZone = {
          afterLineNumber: session.selectionRange.startLineNumber - 1,
          heightInLines: 1.5,
          domNode: document.createElement("div"),
        };
        zoneIdRef.current = accessor.addZone(zone);
      });

      // Add ContentWidget at selection start
      const widget: Monaco.editor.IContentWidget = {
        getId: () => "fury.inline-edit-widget",
        getDomNode: () => domNode,
        getPosition: () => ({
          position: {
            lineNumber: session.selectionRange.startLineNumber,
            column: session.selectionRange.startColumn,
          },
          preference: [
            monaco.editor.ContentWidgetPositionPreference.ABOVE,
          ],
        }),
      };

      widgetRef.current = widget;
      editor.addContentWidget(widget);

      // Store original content for potential revert
      originalContentRef.current = tab.editedContent ?? tab.content ?? "";
    }

    // Handle previewing state — apply diff decorations
    if (session.status === "previewing" && session.generatedText !== null) {
      const model = editor.getModel();
      if (!model) return;

      // Store the original full content before replacing
      if (originalContentRef.current === null) {
        originalContentRef.current = model.getValue();
      }

      // Replace selection with generated text
      const range = new monaco.Range(
        session.selectionRange.startLineNumber,
        session.selectionRange.startColumn,
        session.selectionRange.endLineNumber,
        session.selectionRange.endColumn,
      );

      editor.executeEdits("inline-edit", [
        { range, text: session.generatedText },
      ]);

      // Compute the range of the newly inserted text
      const newLines = session.generatedText.split("\n");
      const newEndLine =
        session.selectionRange.startLineNumber + newLines.length - 1;
      const newEndCol =
        newLines.length === 1
          ? session.selectionRange.startColumn + newLines[0].length
          : newLines[newLines.length - 1].length + 1;

      // Apply green highlight decorations on the new text
      const decos: Monaco.editor.IModelDeltaDecoration[] = [
        {
          range: new monaco.Range(
            session.selectionRange.startLineNumber,
            session.selectionRange.startColumn,
            newEndLine,
            newEndCol,
          ),
          options: {
            className: "inline-edit-inserted",
            isWholeLine: false,
          },
        },
      ];
      decorationsRef.current = editor.createDecorationsCollection(decos);
    }
  }, [session, tab.id, tab.content, tab.editedContent, editorRef, monacoRef, cleanup]);

  // Handle accept/reject — when session clears, decide whether to keep or revert
  useEffect(() => {
    const unsub = useInlineEditStore.subscribe((state, prevState) => {
      const prev = prevState.session;
      const curr = state.session;

      // Session just cleared
      if (prev && !curr && prev.tabId === tab.id) {
        const editor = editorRef.current;

        // On reject: undo the edit we applied via executeEdits
        if (
          state.lastAction === "rejected" &&
          prev.status === "previewing" &&
          prev.generatedText !== null &&
          editor
        ) {
          editor.trigger("inline-edit", "undo", null);
        }

        // On accept: update the fileViewerStore's content tracking
        if (state.lastAction === "accepted" && editor) {
          const model = editor.getModel();
          if (model) {
            useFileViewerStore
              .getState()
              .updateContent(tab.id, model.getValue());
          }
        }

        originalContentRef.current = null;
        cleanup();
      }
    });
    return unsub;
  }, [tab.id, editorRef, cleanup]);

  // Cancel session if tab changes
  useEffect(() => {
    return () => {
      const session = useInlineEditStore.getState().session;
      if (session?.tabId === tab.id) {
        useInlineEditStore.getState().cancelSession();
      }
      cleanup();
    };
  }, [tab.id, cleanup]);
}
