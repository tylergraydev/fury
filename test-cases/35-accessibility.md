# TC-35: Accessibility

## TC-35.01: Keyboard navigation — main panels
- **Steps:**
  1. Use Tab key to navigate between left sidebar, main panel, and right sidebar
- **Expected:** Focus moves logically between panels. Focus indicators visible.

## TC-35.02: Keyboard navigation — sidebar items
- **Steps:**
  1. Tab into left sidebar
  2. Use arrow keys to navigate workspaces
  3. Press Enter to select
- **Expected:** Arrow keys move between items. Enter activates selection. Focus ring visible.

## TC-35.03: Keyboard navigation — dialogs
- **Steps:**
  1. Open a dialog (e.g., Settings)
  2. Tab through form fields and buttons
- **Expected:** Focus cycles within the dialog. Tab order is logical. Can close with Escape.

## TC-35.04: Focus management — modal trapping
- **Steps:**
  1. Open a modal dialog
  2. Tab repeatedly
- **Expected:** Focus stays trapped within the modal. Does not escape to background content.

## TC-35.05: ARIA labels
- **Steps:**
  1. Inspect interactive elements with browser dev tools or screen reader
- **Expected:** Buttons, inputs, and controls have appropriate `aria-label` or `aria-labelledby` attributes.

## TC-35.06: Semantic HTML
- **Steps:**
  1. Inspect page structure
- **Expected:** Proper use of `<nav>`, `<main>`, `<aside>`, `<button>`, `<input>`, `<h1>`-`<h6>` elements.

## TC-35.07: Screen reader — status announcements
- **Steps:**
  1. Enable screen reader (VoiceOver on Mac)
  2. Send a message and wait for response
- **Expected:** Agent status changes announced via `aria-live` regions (e.g., "Agent running", "Agent complete").

## TC-35.08: Contrast ratios
- **Steps:**
  1. Use a contrast checker on text elements against their backgrounds
- **Expected:** Meets WCAG AA standards (4.5:1 for normal text, 3:1 for large text).

## TC-35.09: prefers-reduced-motion
- **Steps:**
  1. Enable "Reduce motion" in system accessibility settings
  2. Observe UI animations
- **Expected:** Pulse animations, transitions, and motion effects are reduced or removed.

## TC-35.10: Alt text for images
- **Steps:**
  1. View chat messages with images
  2. Inspect image elements
- **Expected:** Images have appropriate alt text for screen readers.
