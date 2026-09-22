/**
 * themeBoot.ts
 *
 * Paint the right colour on the first frame.
 *
 * Loaded synchronously as the first thing inside <body> on every extension
 * page, before any content is parsed. It exists because the real theme lives
 * in `chrome.storage.local` and cannot be read without yielding, so a page
 * that waits for it has already painted something by the time it knows what
 * to paint. The options page painted its dark base tokens and then turned
 * light, which is what a user sees as a black flash.
 *
 * Two rules, both of them "do not guess":
 *
 *  - If this browser has painted a theme before, open in that one. It is what
 *    the user last saw, and is right unless they changed it elsewhere since.
 *  - If it never has, open in light. That is not a guess about the user, it is
 *    the extension's stored default: `getGlobalTheme()` returns 'light' when
 *    nothing is stored. Asking the OS here would reintroduce exactly the bug
 *    1.6.1 fixed, because the OS says nothing about the theme this extension
 *    is set to.
 *
 * The page's own script corrects this a few milliseconds later if the cache
 * was stale. Nothing here is authoritative; it only decides the first frame.
 *
 * Kept tiny and dependency-free on purpose: it blocks parsing.
 */

import { readMirroredTheme, stampResolvedTheme } from './modules/themeMirror';

stampResolvedTheme(readMirroredTheme() ?? 'light');
