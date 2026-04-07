import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, RotateCw, Globe } from "lucide-react";
import { useBrowserStore } from "../../stores/browserStore";
import { useUIStore } from "../../stores/uiStore";
import { getRepoSettings } from "../../lib/tauri";

interface BrowserPanelProps {
  repoId?: string | null;
}

export function BrowserPanel({ repoId }: BrowserPanelProps = {}) {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState("");
  const boundsUpdateRef = useRef<number>(0);

  const webviewId = useBrowserStore((s) => s.webviewId);
  const url = useBrowserStore((s) => s.url);
  const isLoading = useBrowserStore((s) => s.isLoading);
  const error = useBrowserStore((s) => s.error);
  const createBrowser = useBrowserStore((s) => s.create);
  const navigateTo = useBrowserStore((s) => s.navigate);
  const updateBounds = useBrowserStore((s) => s.updateBounds);
  const showBrowser = useBrowserStore((s) => s.show);
  const hideBrowser = useBrowserStore((s) => s.hide);
  const closeBrowser = useBrowserStore((s) => s.close);

  const activeViewTabId = useUIStore((s) => s.activeViewTabId);
  const splitBrowserActive = useUIStore((s) => s.splitBrowserActive);
  const isActive = activeViewTabId === "browser" || splitBrowserActive;

  // Load default browser URL from repo settings
  useEffect(() => {
    if (!repoId) return;
    getRepoSettings(repoId).then((settings) => {
      if (settings.browserUrl) {
        useBrowserStore.setState({ url: settings.browserUrl });
      }
    }).catch(() => {
      // Ignore — use default URL
    });
  }, [repoId]);

  // Sync URL input with store URL
  useEffect(() => {
    setUrlInput(url);
  }, [url]);

  // Create or show/hide webview based on tab visibility
  useEffect(() => {
    if (!isActive) {
      hideBrowser();
      return;
    }

    if (webviewId) {
      showBrowser();
      return;
    }

    // Create the webview when first activated
    const el = placeholderRef.current;
    if (!el) return;

    const raf = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        createBrowser(url, rect.x, rect.y, rect.width, rect.height);
      }
    });

    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, webviewId]);

  // ResizeObserver to keep webview in sync with placeholder
  useEffect(() => {
    if (!webviewId || !isActive) return;
    const el = placeholderRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(boundsUpdateRef.current);
      boundsUpdateRef.current = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        updateBounds(rect.x, rect.y, rect.width, rect.height);
      });
    });

    observer.observe(el);

    // Initial bounds sync
    const rect = el.getBoundingClientRect();
    updateBounds(rect.x, rect.y, rect.width, rect.height);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(boundsUpdateRef.current);
    };
  }, [webviewId, isActive, updateBounds]);

  // Clean up webview on unmount
  useEffect(() => {
    return () => {
      closeBrowser();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNavigate = useCallback(() => {
    let targetUrl = urlInput.trim();
    if (!targetUrl) return;

    // Auto-prepend http:// if no protocol
    if (!/^https?:\/\//.test(targetUrl)) {
      targetUrl = `http://${targetUrl}`;
    }

    navigateTo(targetUrl);
  }, [urlInput, navigateTo]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleNavigate();
      }
    },
    [handleNavigate],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-[var(--border)] px-2 py-1">
        <button
          className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
          title="Back"
          onClick={() => {
            if (webviewId) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (window as any).__TAURI__?.invoke("eval_browser_js", {
                browserId: webviewId,
                script: "history.back()",
              });
            }
          }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <button
          className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
          title="Forward"
          onClick={() => {
            if (webviewId) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (window as any).__TAURI__?.invoke("eval_browser_js", {
                browserId: webviewId,
                script: "history.forward()",
              });
            }
          }}
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
        <button
          className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
          title="Reload"
          onClick={() => {
            if (webviewId) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (window as any).__TAURI__?.invoke("eval_browser_js", {
                browserId: webviewId,
                script: "location.reload()",
              });
            }
          }}
        >
          <RotateCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
        </button>

        {/* URL bar */}
        <div className="flex flex-1 items-center rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-0.5">
          <Globe className="mr-1.5 h-3 w-3 flex-shrink-0 text-[var(--text-tertiary)]" />
          <input
            ref={urlInputRef}
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="http://localhost:3000"
            className="w-full bg-transparent text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Browser content area (placeholder for native webview overlay) */}
      <div ref={placeholderRef} className="relative flex-1">
        {!webviewId && !isLoading && !error && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--text-tertiary)]">
            <Globe className="h-12 w-12 opacity-30" />
            <p className="text-sm">Enter a URL to preview your app</p>
          </div>
        )}
        {isLoading && !webviewId && (
          <div className="flex h-full items-center justify-center text-[var(--text-tertiary)]">
            <RotateCw className="h-5 w-5 animate-spin" />
          </div>
        )}
        {error && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-tertiary)]">
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={() => {
                useBrowserStore.getState().setError(null);
                const el = placeholderRef.current;
                if (el) {
                  const rect = el.getBoundingClientRect();
                  createBrowser(url, rect.x, rect.y, rect.width, rect.height);
                }
              }}
              className="rounded border border-[var(--border)] px-3 py-1 text-xs hover:bg-[var(--bg-tertiary)]"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
