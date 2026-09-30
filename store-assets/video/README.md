# Product video

`gmail-labels-as-tabs-demo-1080p.mp4`: 1920x1080, 30 fps, H.264, 91 seconds, no audio.
Recorded 2026-09-30 by [scripts/store-assets/record-video.mjs](../../scripts/store-assets/record-video.mjs)
from the 1.8.0 build in a real, signed-in Gmail. Message rows, the label sidebar, the
account avatar, the search box's suggestions and the options page's account picker are
blurred before the first frame; the tab bar holds demo tabs. Every frame was checked for
readable personal content before it was kept.

`thumbnail-1280x720.png`: the title card, for YouTube's custom thumbnail.

It shows only what 1.6.2 already does, plus nothing that is 1.8.0 only, so it stays true
whichever version the store is serving. The one exception is the privacy page at the end,
which is 1.8.0's and mentions website icons.

## Where it goes

1. **YouTube**, on the palworks-ai channel, with the title, description, chapters and tags
   below.
2. **Chrome Web Store**: the listing takes a YouTube link, not a file. Paste the video's URL
   into the dashboard's Store listing tab, "YouTube video", at the next submission.
3. **The website** can embed it on the homepage and on `/gmail-custom-tabs/`, with
   VideoObject structured data, once it has a YouTube id.

## YouTube metadata

**Title** (under 70 characters, the query first):

```
Gmail labels and searches as tabs: Chrome extension demo
```

**Description:**

```
Gmail Labels and Search Queries as Tabs is a free, open source Chrome extension that puts your Gmail labels and saved searches in a tab bar above the inbox, one click per view, with live unread counts.

In this 90 second demo:
0:00 Your labels and searches, as tabs
0:04 One click opens the view
0:20 Run any Gmail search, press +, and it stays as a tab
0:38 Colour the views that matter, and drag tabs into your order
0:56 The one-minute tour
1:14 Cleanup rules in your own Google account, and privacy

It never reads, stores or sends your mail. No analytics, no account, no paid tier. Each Gmail account keeps its own tabs, and they sync through Chrome.

Install (free): https://chromewebstore.google.com/detail/gmail-labels-and-search-q/jemjnjlplglfoiipcjhoacneigdgfmde?utm_source=youtube&utm_medium=video
Website: https://palworks.github.io/Gmail-Labels-As-Tabs/
How to add custom tabs to Gmail, every option compared: https://palworks.github.io/Gmail-Labels-As-Tabs/gmail-custom-tabs/
Every Gmail search operator, with examples: https://palworks.github.io/Gmail-Labels-As-Tabs/gmail-search-operators/
Source code: https://github.com/PalWorks/Gmail-Labels-Queries-As-Tabs

Inbox content is blurred for privacy. Not affiliated with Google. Gmail and Chrome are trademarks of Google LLC.
```

**Tags:** `gmail tabs, gmail labels, gmail custom tabs, gmail search operators, gmail extension, chrome extension, gmail productivity, gmail organize inbox, saved searches gmail, gmail multiple inboxes alternative`

**Category:** Science & Technology. **Audience:** not made for kids. **Visibility:** public
once checked. **Language:** English.
