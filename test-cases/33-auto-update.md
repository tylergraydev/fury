# TC-33: Auto-Update

## TC-33.01: Display current version
- **Steps:**
  1. Go to Settings > Updates (or About)
- **Expected:** Current app version displayed (e.g., "1.2.3"). Fallback to "unknown" if unavailable.

## TC-33.02: Check for updates — up to date
- **Steps:**
  1. Click "Check for Updates"
- **Expected:** Message indicates app is up to date. No update available.

## TC-33.03: Check for updates — update available
- **Precondition:** Newer version exists on GitHub Releases
- **Steps:**
  1. Click "Check for Updates"
- **Expected:** Update found. New version number displayed. Option to download/install.

## TC-33.04: Download and install update
- **Precondition:** Update available
- **Steps:**
  1. Click "Install Update" or "Download"
  2. Wait for download
  3. Restart app
- **Expected:** Update downloads. App restarts with new version. Version number reflects update.

## TC-33.05: Update check — network error
- **Precondition:** No internet connection
- **Steps:**
  1. Click "Check for Updates"
- **Expected:** Error message about network connectivity. No crash. Can retry later.
