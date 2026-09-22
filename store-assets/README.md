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
| `screenshot-6-tour.png` | 1280x800 | The guided tour, open over a real inbox |
| `raw/` | various | Unframed source captures |

The store has no caption field, so each image carries its own headline and subhead. They
are listed in [STORE_LISTING.md](../STORE_LISTING.md) alongside the upload order.

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
google-chrome --remote-debugging-port=9222     # sign in to Gmail in this profile
# load dist/ as an unpacked extension, copy its id
NODE_PATH=$(npm root -g) node scripts/store-assets/build.mjs <extension-id> 9222 you@gmail.com
```

Omit the account argument to skip the Gmail captures and recompose from `raw/`. The script
fails if any output is the wrong size, if a frame would show a blank band, if the colour
palette is outside the crop, or if the tour does not open.

### Shooting without taking over the desktop

The captures open tabs and bring them to the front, which is disruptive if the browser
being driven is the one somebody is using. A throwaway copy of a signed-in profile avoids
that entirely:

```bash
rsync -a --exclude 'OptGuideOnDeviceModel' --exclude 'Default/Service Worker' \
      --exclude 'Default/IndexedDB' --exclude 'Default/Cache' --exclude 'SingletonLock' \
      ~/.config/<profile>/ /tmp/shootprof/
google-chrome --headless=new --remote-debugging-port=9333 \
      --user-data-dir=/tmp/shootprof --disable-sync
```

`--disable-sync` matters: the script writes demo tabs into `chrome.storage.sync` before it
restores the real ones, and a signed-in clone would push those to the account.

**Chrome 137 and later ignore `--load-extension`.** Load it over the protocol instead,
which returns the same id the path would have produced:

```js
const session = await browser.newBrowserCDPSession();
await session.send('Extensions.loadUnpacked', { path: '<repo>/dist' });
```
