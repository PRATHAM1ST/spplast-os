# Simple entry

- Enter the device passphrase once per local calendar day. Reloading or reopening the same browser restores the unlock until midnight. Signing out removes it immediately. Online identity checks and the existing offline-session expiry still apply.
- The device remembers a non-exportable Web Crypto key in IndexedDB, never the passphrase. Treat a device remembered for the day as unlocked. Clearing browser data removes the remembered key and local drafts.
- Production quick entry hides administrative fields; Advanced details exposes them. A sole machine or shift is preselected. Optional recipe and bag sections can be expanded when needed.
- Choose **Add photo & identify colour**, attach a close-up, and tap a suggestion or the material in the image. Common swatches and custom colours are also available. Suggestions are approximate visual references, not calibrated colour measurements or polymer/grade identification.
- The chosen colour is saved in production notes and attached-photo captions. Production drafts preserve their photos and colour while offline. Recipe photos are attached on save. Existing private photo storage handles uploads.
- Optional fields in other entry forms are under **Add optional details**. Recipe names can be generated from colour and polymer; selecting an inventory ingredient fills its name.

Colour extraction uses [fast-average-color](https://github.com/fast-average-color/fast-average-color), MIT licensed, entirely in the browser. No external AI service or additional environment variables are needed. UI work used the installed Apache-2.0 [frontend-design skill](https://github.com/anthropics/skills/tree/main/skills/frontend-design).
