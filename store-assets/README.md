# Store assets

Graphics for the Chrome Web Store listing. Every one is generated from the real extension
by [scripts/store-assets/build.mjs](../scripts/store-assets/build.mjs), so they can be
regenerated whenever the UI changes rather than drifting away from the product.

## What is here

| File | Size | Used for |
|---|---|---|
| `promo-small-440x280.png` | 440x280 | Required small promo tile |
| `promo-marquee-1400x560.png` | 1400x560 | Marquee tile, for featured placement |
| `screenshot-1-tabs-in-gmail.png` | 1280x800 | Tabs in Gmail |
| `screenshot-2-colors.png` | 1280x800 | Colour picker and palette |
| `screenshot-3-automation.png` | 1280x800 | Rule starter templates |
| `screenshot-4-dark-mode.png` | 1280x800 | Dark theme |
| `screenshot-5-privacy.png` | 1280x800 | Privacy page |
| `raw/` | various | Unframed source captures |

Captions to paste alongside them are in [STORE_LISTING.md](../STORE_LISTING.md).

## Privacy

The Gmail captures are real, which means the page behind the tab bar is a real inbox. The
generator blurs the message list, the label sidebar and the header before taking the shot,
and seeds the bar with demo labels (Clients, Invoices, Newsletters), so no subject, sender,
address or personal label name appears in any asset. The account's own settings are backed
up before the capture and restored afterwards, including when a capture fails.

Check any new asset for readable personal content before uploading. It is the one mistake
in this directory that cannot be taken back once the listing is live.

## Honesty

The screenshots show the real product. Two choices are worth recording:

- The dark-theme screenshot is the options page, not Gmail. Forcing the dark tab bar over
  a light Gmail would show precisely the mismatch that v1.4.0 fixed, so it would be
  advertising a bug.
- The previous tiles in `src/icons/` were AI-generated mockups with invented Gmail text
  ("Budgeriaves", "Showned"). They are superseded by these.
- Those superseded tiles were also **shipping inside the extension** until v1.5.0, because
  `copy-assets` globbed `src/icons/*.png`. 398 KB, 44% of the package, downloaded by every
  user, named by no manifest entry and loaded by no page. The copy step now lists the four
  declared icons, and CI fails if `dist/icons` gains anything else. The tiles here, in
  `store-assets/`, are the ones to upload; nothing in this directory ships to a user.
- The privacy screenshot's caption used to read "Nothing leaves your browser unless you
  press Send Feedback". That stopped being true when the uninstall URL came back in v1.5.0
  (ADR-014), so it now points at the policy rather than summarising it. A caption is a
  claim; it goes stale like any other.

## Regenerating

```bash
google-chrome --remote-debugging-port=9222     # sign in to Gmail in this profile
# load dist/ as an unpacked extension, copy its id
NODE_PATH=$(npm root -g) node scripts/store-assets/build.mjs <extension-id> 9222 you@gmail.com
```

Omit the account argument to skip the Gmail captures and recompose from `raw/`. The script
fails if any output is the wrong size or if a frame would show a blank band.
