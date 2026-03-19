import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImageLightbox } from "./ImageLightbox";

describe("ImageLightbox", () => {
  const defaultProps = {
    src: "https://example.com/image.png",
    alt: "Test image",
    onClose: vi.fn(),
  };

  it("renders the image with provided src and alt", () => {
    render(<ImageLightbox {...defaultProps} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", defaultProps.src);
    expect(img).toHaveAttribute("alt", "Test image");
  });

  it("renders dialog with aria-label from alt prop", () => {
    render(<ImageLightbox {...defaultProps} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Test image");
  });

  it("uses fallback aria-label when alt is undefined", () => {
    render(<ImageLightbox src={defaultProps.src} onClose={defaultProps.onClose} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-label", "Image preview");
  });

  it("uses fallback img alt when alt is undefined", () => {
    render(<ImageLightbox src={defaultProps.src} onClose={defaultProps.onClose} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("alt", "Full size preview");
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<ImageLightbox {...defaultProps} onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when image is clicked (stopPropagation)", () => {
    const onClose = vi.fn();
    render(<ImageLightbox {...defaultProps} onClose={onClose} />);
    const img = screen.getByRole("img");
    fireEvent.click(img);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(<ImageLightbox {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose for non-Escape keys", () => {
    const onClose = vi.fn();
    render(<ImageLightbox {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("removes keydown listener on unmount", () => {
    const onClose = vi.fn();
    const { unmount } = render(<ImageLightbox {...defaultProps} onClose={onClose} />);
    unmount();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("sets draggable to false on the image", () => {
    render(<ImageLightbox {...defaultProps} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("draggable", "false");
  });
});
