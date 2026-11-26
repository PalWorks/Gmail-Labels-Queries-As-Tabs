// SPDX-License-Identifier: AGPL-3.0-only
/**
 * gmailHash.ts
 *
 * Reading the parts of a Gmail address hash (`#label/...`, `#search/...`).
 *
 * Gmail writes a space as `+` and escapes everything else, a literal `+`
 * included (`C++` is `C%2B%2B`). So `+` must become a space BEFORE the
 * escapes are decoded; decoding first turns `C%2B%2B` into `C++` and then
 * into `C  `. Several call sites did it in that wrong order, and several
 * let a malformed escape (`100%`) throw and take the caller down with it
 * (found by the 2026-11-26 audit). Every decode of a hash goes through here.
 */

/** One hash segment as Gmail writes it, decoded. Never throws. */
export function decodeGmailHashSegment(segment: string): string {
    const spaced = segment.replace(/\+/g, ' ');
    try {
        return decodeURIComponent(spaced);
    } catch {
        // A malformed escape is better shown as it is than not at all.
        return spaced;
    }
}
