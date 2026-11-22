# Store assets

Graphics for the Chrome Web Store listing. Every one is generated from the real extension
by [scripts/store-assets/build.mjs](../scripts/store-assets/build.mjs), so they can be
regenerated whenever the UI changes rather than drifting away from the product.

## What is here

| File | Size | Used for |
|---|---|---|
| `promo-small-440x280.png` | 440x280 | Required small promo tile |
| `promo-marquee-1400x560.png` | 1400x560 | Marquee tile, for featured placement |
| `screenshot-1-tabs-in-gmail.png` | 1280x800 | The tab bar over the inbox |
| `screenshot-2-sender-icons.png` | 1280x800 | Sender icons |
| `screenshot-3-label-menu.png` | 1280x800 | "Show as Tabs" in Gmail's own label menu |
| `screenshot-4-cleanup-rules.png` | 1280x800 | Cleanup rule starter templates |
| `screenshot-5-privacy.png` | 1280x800 | Privacy page |
| `raw/` | various | Unframed source captures |

The product video, its thumbnail and its YouTube metadata are in [video/](video/README.md).

The store has no caption field, so each image carries its own headline and subhead. They
are listed in [STORE_LISTING.md](../STORE_LISTING.md) section 4 alongside the upload order.

## Privacy

The Gmail captures are the real product in a real Gmail, so the page behind the tab bar is
a real inbox. Nothing of it reaches an image:

- The extension runs in a throwaway headless copy of a signed-in profile with sync off,
  deleted afterwards, so the account's own settings and synced storage are never written.
- The inbox rows and the sidebar's label names are replaced, in the page and only for the
  shot, with invented senders, subjects and labels. Sublabels and labels beyond the demo
  list are hidden. The account avatar and side panel stay blurred.
- Before a shot is kept, every row must read as demo text and nothing else, and every
  visible label must carry a demo name; otherwise the run stops before writing anything.
  `GLT_DEBUG=1` says where leftover text sits (element classes and lengths, never the text).
- The label menu shot also checks that nothing but the sidebar and our menu covers the
  label column. A pointer crossing the left rail opens Chat's hover panel, which lists real
  contacts with their photos; a first run on 2026-11-22 caught exactly that in a raw
  capture (deleted, never committed), which is why the pointer now starts from the message
  list and the check exists.
- The options pages show a demo account in the picker, and the run fails if they show any
  other.

Check any new asset for readable personal content before uploading. It is the one mistake
in this directory that cannot be taken back once the listing is live.

## Honesty

The screenshots show the real product. Choices worth recording, including some about
earlier sets (the colour, dark mode and tour stills were retired on 2026-11-22):

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
- The colour screenshot shipped for three versions without a colour picker in it. The
  palette opens beside its row, low in the tab list, and the fixed crop cut it off, so the
  one asset about colour showed the Theme and Add Tab cards instead. The capture now
  centres the row before clicking and throws if the palette is not inside the frame. A
  generated asset can be wrong in a way a hand-made one cannot: nobody looked at it again
  after the first time.
- The tour screenshot is the running tour, opened by sending the content script the same
  `SHOW_ONBOARDING` message the toolbar menu sends. Its crop is tighter than the other
  Gmail shot so the real tab bar stays in frame above the panel; without it the image
  would be a dialog on a blurred page, which is not what the tour is.

## Regenerating

```bash
npm run build
NODE_PATH=$(npm root -g) node scripts/store-assets/build.mjs [--profile <dir>] [--account <address>]
```

`--profile` defaults to the first profile in `CANARY_SOURCE_PROFILE`, and `--account` to the
first `CANARY_ACCOUNT` in `~/.config/gmail-labels-as-tabs/alerts.env`: the account the drift
canary watches (scripts/canary/README.md). It must have user labels, or there is no label
menu to shoot. Gmail is opened with `authuser`, and the run stops if a different account
opens. Nothing opens on the desktop.

The script fails if any output is the wrong size, if a frame would show a blank band, or if
any privacy check above refuses a shot. Gmail redraws its own rows now and then, so it
dresses them again and checks once more just before each shutter.
