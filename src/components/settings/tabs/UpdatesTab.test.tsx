import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "./test-helpers.test";
import { AppSettingsPanel } from "../AppSettingsPanel";

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn().mockResolvedValue("1.4.1"),
  getName: vi.fn().mockResolvedValue("Fury"),
}));

describe("UpdatesTab - dialog close", () => {
  it("closes update dialog when CloseUpdateDialog is clicked", async () => {
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Updates"));
    fireEvent.click(screen.getByText("Check for Updates"));
    await waitFor(() => {
      expect(screen.getByTestId("update-dialog")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("CloseUpdateDialog"));
    expect(screen.queryByTestId("update-dialog")).not.toBeInTheDocument();
  });
});

describe("UpdatesTab", () => {
  const goToUpdatesTab = () => {
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Updates"));
  };

  it("shows current version", async () => {
    goToUpdatesTab();
    expect(await screen.findByText("Current version: v1.4.1")).toBeInTheDocument();
  });

  it("shows Check for Updates button", () => {
    goToUpdatesTab();
    expect(screen.getByText("Check for Updates")).toBeInTheDocument();
  });

  it("opens update dialog when button is clicked", async () => {
    goToUpdatesTab();
    fireEvent.click(screen.getByText("Check for Updates"));
    await waitFor(() => {
      expect(screen.getByText("Software Update")).toBeInTheDocument();
    });
  });

  it("shows helper text about updates", () => {
    goToUpdatesTab();
    expect(
      screen.getByText(/Updates are downloaded from GitHub Releases/),
    ).toBeInTheDocument();
  });
});
