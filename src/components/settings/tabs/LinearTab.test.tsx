import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "./test-helpers.test";
import { fullSettings } from "./test-helpers.test";
import { AppSettingsPanel } from "../AppSettingsPanel";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useUIStore } from "../../../stores/uiStore";

describe("LinearTab", () => {
  function goToLinearTab() {
    render(<AppSettingsPanel />);
    fireEvent.click(screen.getByText("Linear"));
  }

  it("shows Linear API Key label", async () => {
    goToLinearTab();
    await waitFor(() => {
      expect(screen.getByText("Linear API Key")).toBeInTheDocument();
    });
  });

  it("shows API key input with placeholder", async () => {
    goToLinearTab();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("lin_api_...")).toBeInTheDocument();
    });
  });

  it("shows helper text about creating a personal API key", async () => {
    goToLinearTab();
    await waitFor(() => {
      expect(screen.getByText(/Create a personal API key/)).toBeInTheDocument();
    });
  });

  it("toggles password visibility", async () => {
    goToLinearTab();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("lin_api_...")).toBeInTheDocument();
    });
    const input = screen.getByPlaceholderText("lin_api_...");
    expect(input).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByText("Show"));
    expect(input).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByText("Hide"));
    expect(input).toHaveAttribute("type", "password");
  });

  it("types in API key input", async () => {
    goToLinearTab();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("lin_api_...")).toBeInTheDocument();
    });
    const input = screen.getByPlaceholderText("lin_api_...");
    fireEvent.change(input, { target: { value: "lin_api_test_key" } });
    expect(input).toHaveValue("lin_api_test_key");
  });

  it("saves API key and closes settings", async () => {
    const mockSave = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({ appSettings: fullSettings, saveSettings: mockSave });
    goToLinearTab();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("lin_api_...")).toBeInTheDocument();
    });
    const input = screen.getByPlaceholderText("lin_api_...");
    fireEvent.change(input, { target: { value: "lin_api_key123" } });
    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        linear: { apiKey: "lin_api_key123" },
      }),
    );
  });

  it("saves null when API key is empty", async () => {
    const mockSave = vi.fn().mockResolvedValue(undefined);
    useSettingsStore.setState({ appSettings: fullSettings, saveSettings: mockSave });
    goToLinearTab();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("lin_api_...")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        linear: { apiKey: null },
      }),
    );
  });

  it("shows Cancel button that closes settings", async () => {
    goToLinearTab();
    await waitFor(() => {
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });
  });

  it("shows error when save fails", async () => {
    const mockSave = vi.fn().mockRejectedValue(new Error("Network error"));
    useSettingsStore.setState({ appSettings: fullSettings, saveSettings: mockSave });
    goToLinearTab();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("lin_api_...")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });
    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument();
    });
  });

  it("shows Loading... when appSettings is null", async () => {
    useSettingsStore.setState({ appSettings: null });
    goToLinearTab();
    await waitFor(() => {
      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });
  });

  it("clicking Cancel closes settings view tab", async () => {
    const mockCloseViewTab = vi.fn();
    useUIStore.setState({ closeViewTab: mockCloseViewTab } as any);
    goToLinearTab();
    await waitFor(() => {
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Cancel"));
    expect(mockCloseViewTab).toHaveBeenCalledWith("settings");
  });

  it("populates API key input from saved appSettings", async () => {
    useSettingsStore.setState({
      appSettings: {
        ...fullSettings,
        linear: { apiKey: "lin_api_saved_key" },
      },
    });
    goToLinearTab();
    await waitFor(() => {
      const input = screen.getByPlaceholderText("lin_api_...");
      expect(input).toHaveValue("lin_api_saved_key");
    });
  });
});
