import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockCheckForAppUpdate = vi.fn();
const mockGetAppVersion = vi.fn().mockResolvedValue("1.9.0");

vi.mock("../../lib/autoUpdate", () => ({
  checkForAppUpdate: (...args: unknown[]) => mockCheckForAppUpdate(...args),
  getAppVersion: (...args: unknown[]) => mockGetAppVersion(...args),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(),
}));

import { UpdateDialog } from "./UpdateDialog";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAppVersion.mockResolvedValue("1.9.0");
});

describe("UpdateDialog", () => {
  it("shows checking state on open", () => {
    mockCheckForAppUpdate.mockImplementation(() => new Promise(() => {}));
    render(<UpdateDialog onClose={vi.fn()} />);
    expect(screen.getByText("Checking for updates...")).toBeInTheDocument();
  });

  it("shows up-to-date when no update available", async () => {
    mockCheckForAppUpdate.mockResolvedValue(null);
    render(<UpdateDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("You're on the latest version.")).toBeInTheDocument();
    });
  });

  it("shows current version", async () => {
    mockCheckForAppUpdate.mockResolvedValue(null);
    render(<UpdateDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Current version: v1.9.0")).toBeInTheDocument();
    });
  });

  it("shows available update with install button", async () => {
    const fakeUpdate = { version: "2.0.0", downloadAndInstall: vi.fn() };
    mockCheckForAppUpdate.mockResolvedValue(fakeUpdate);
    render(<UpdateDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Version 2.0.0 is available.")).toBeInTheDocument();
    });
    expect(screen.getByText("Download & Install")).toBeInTheDocument();
  });

  it("downloads and installs update", async () => {
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined);
    const fakeUpdate = { version: "2.0.0", downloadAndInstall };
    mockCheckForAppUpdate.mockResolvedValue(fakeUpdate);
    render(<UpdateDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Download & Install")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Download & Install"));
    await waitFor(() => {
      expect(screen.getByText("Update installed. Restart to apply.")).toBeInTheDocument();
    });
    expect(downloadAndInstall).toHaveBeenCalled();
  });

  it("shows restart button after install", async () => {
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined);
    const fakeUpdate = { version: "2.0.0", downloadAndInstall };
    mockCheckForAppUpdate.mockResolvedValue(fakeUpdate);
    render(<UpdateDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Download & Install")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Download & Install"));
    await waitFor(() => {
      expect(screen.getByText("Restart Now")).toBeInTheDocument();
    });
  });

  it("shows error when check fails", async () => {
    mockCheckForAppUpdate.mockRejectedValue(new Error("Network error"));
    render(<UpdateDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Error: Network error")).toBeInTheDocument();
    });
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("shows error when install fails", async () => {
    const downloadAndInstall = vi.fn().mockRejectedValue(new Error("disk full"));
    const fakeUpdate = { version: "2.0.0", downloadAndInstall };
    mockCheckForAppUpdate.mockResolvedValue(fakeUpdate);
    render(<UpdateDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Download & Install")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Download & Install"));
    await waitFor(() => {
      expect(screen.getByText("Install failed: Error: disk full")).toBeInTheDocument();
    });
  });

  it("calls onClose when close button clicked", async () => {
    mockCheckForAppUpdate.mockResolvedValue(null);
    const onClose = vi.fn();
    render(<UpdateDialog onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByText("Close")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("retries check after error", async () => {
    mockCheckForAppUpdate.mockRejectedValueOnce(new Error("offline"));
    render(<UpdateDialog onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });
    mockCheckForAppUpdate.mockResolvedValue(null);
    fireEvent.click(screen.getByText("Retry"));
    await waitFor(() => {
      expect(screen.getByText("You're on the latest version.")).toBeInTheDocument();
    });
  });
});
