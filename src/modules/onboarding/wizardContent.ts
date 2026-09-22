/**
 * wizardContent.ts
 *
 * What the onboarding wizard says, separated from how it is drawn.
 *
 * Copy lives here as structured segments rather than HTML strings. Two reasons,
 * and neither is style: the view can render every segment with `textContent`,
 * so no onboarding copy can ever reach `innerHTML` (see
 * [test/htmlSinks.test.ts]); and the wording can be reviewed, translated or
 * changed without opening the file that owns the animation.
 */

import { Theme } from '../../utils/storage';

/**
 * A run of copy. `code` is rendered in the monospace face, for things the user
 * would literally type into Gmail's search box.
 */
export type CopySegment = { readonly text: string } | { readonly code: string };

/** One slide: what it says, and what the miniature is doing while it says it. */
export interface Slide {
    /** Heading. */
    readonly title: string;
    /** Body copy, as segments. */
    readonly body: readonly CopySegment[];
    /**
     * Names what the miniature is demonstrating.
     *
     * This is not a caption in the decorative sense. It is the fallback for
     * every case where the motion does not land: the user skipped ahead, the
     * tab was in the background, or `prefers-reduced-motion` switched the
     * animation off entirely. The point has to survive without the movement.
     */
    readonly caption: string;
}

/** The final slide is the theme chooser and is built by the view, not from here. */
export const SLIDES: readonly Slide[] = [
    {
        title: 'Your labels, across the top',
        body: [
            {
                text:
                    'Gmail keeps labels in a sidebar you scan every time you switch. This puts the ' +
                    'ones you use all day in a bar above your inbox, one click each.',
            },
        ],
        caption: 'Clients, Invoices and Team move up into a bar',
    },
    {
        title: 'Pin a label, or a whole search',
        body: [
            { text: 'Any label becomes a tab. So does any Gmail search: ' },
            { code: 'is:unread has:attachment' },
            {
                text:
                    ' stops being something you retype and becomes a button that is always ' +
                    'there.',
            },
        ],
        caption: 'Search, then press + to keep it',
    },
    {
        title: 'Counts from Gmail, colour where it earns its place',
        body: [
            {
                text:
                    'Unread counts are read from Gmail itself and keep up as mail arrives. Give ' +
                    'the views that matter a colour so they stand out — colour is never the ' +
                    'only signal, so the tabs still read without it.',
            },
        ],
        caption: 'Counts fill in; colour marks the ones that matter',
    },
    {
        title: 'Drag to reorder. It follows you.',
        body: [
            {
                text:
                    'Hold a tab and drop it where you want it. Your order syncs to every Chrome ' +
                    'you sign in to, and each account keeps its own tabs, colours and rules.',
            },
        ],
        caption: 'Team is dragged to second place',
    },
    {
        title: 'Cleanup rules that run in your account, not ours',
        body: [
            {
                text:
                    'Archive newsletters after 14 days, clear Promotions after 30. The extension ' +
                    'writes a Google Apps Script — you read every line, you paste it, you ' +
                    'schedule it. Mail goes to Trash, where Gmail keeps it for 30 days.',
            },
        ],
        caption: 'One rule, and the script it generates',
    },
    {
        title: 'Pick your look',
        body: [
            {
                text:
                    'The bar follows Gmail’s own theme, not just your operating system. ' +
                    'Choose one and watch it change here, and everywhere else you have Gmail open.',
            },
        ],
        caption: 'The bar, in the theme you choose',
    },
];

/** Index of the slide that carries the theme chooser. */
export const THEME_SLIDE_INDEX = SLIDES.length - 1;

/** Label on the button that closes the wizard. */
export const FINISH_LABEL = 'Start using with Gmail';

/** Theme options, in the order they are shown. */
export interface ThemeOption {
    readonly id: Theme;
    readonly label: string;
    /** Material icon path, drawn in a 0 0 24 24 viewBox. */
    readonly path: string;
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
    {
        id: 'light',
        label: 'Light',
        path:
            'M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 ' +
            '0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 ' +
            '.55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 ' +
            '.45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 ' +
            '0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 ' +
            '1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 ' +
            '0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 ' +
            '0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z',
    },
    {
        id: 'dark',
        label: 'Dark',
        path:
            'M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 ' +
            '2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z',
    },
    {
        id: 'system',
        label: 'System',
        path: 'M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z',
    },
];

/**
 * Tabs shown in the miniature. `pending` arrives during slide 2, when the
 * search is saved; the rest are there from the start.
 */
export interface DemoTab {
    readonly key: string;
    readonly label: string;
    /** A token from src/utils/colors.ts, or undefined for no colour. */
    readonly color?: string;
    readonly count: number;
    readonly active?: boolean;
    readonly pending?: boolean;
}

export const DEMO_TABS: readonly DemoTab[] = [
    { key: 'inbox', label: 'Inbox', count: 24, active: true },
    { key: 'clients', label: 'Clients', color: 'orange', count: 6 },
    { key: 'invoices', label: 'Invoices', color: 'green', count: 3 },
    { key: 'team', label: 'Team', color: 'purple', count: 11 },
    { key: 'saved', label: 'Unpaid', color: 'teal', count: 2, pending: true },
];

/** Sidebar entries in the miniature. `lifts` ones rise into the bar on slide 1. */
export const DEMO_RAIL: readonly { readonly label: string; readonly lifts?: boolean; readonly on?: boolean }[] = [
    { label: 'Inbox', on: true },
    { label: 'Starred' },
    { label: 'Clients', lifts: true },
    { label: 'Invoices', lifts: true },
    { label: 'Team', lifts: true },
];

/** Message rows in the miniature. Plausible mail, never a real address. */
export const DEMO_ROWS: readonly {
    readonly from: string;
    readonly subject: string;
    readonly chip?: string;
    readonly unread?: boolean;
}[] = [
    { from: 'Priya Raman', subject: 'Re: March retainer — approved', chip: 'orange', unread: true },
    { from: 'billing@nor…', subject: 'Invoice 2291 is 14 days overdue', chip: 'green', unread: true },
    { from: 'Dev standup', subject: 'Notes — Thursday', chip: 'purple' },
    { from: 'Stripe', subject: 'Your payout is on the way', chip: 'green' },
];

/** The query typed into the miniature's search box on slide 2. */
export const DEMO_QUERY = 'is:unread has:attachment';

/**
 * The rule and script shown on slide 5.
 *
 * Kept close to what `generateAppsScript` actually emits: the quoted label, the
 * 200-thread cap. A demo that promised something the generator does not do
 * would be the worst kind of onboarding.
 */
export const DEMO_RULE = { label: 'Newsletters', action: 'Archive after 14 days' } as const;

export const DEMO_SCRIPT_LINES: readonly { readonly text: string; readonly kind?: 'comment' | 'keyword' }[] = [
    { text: '// You paste this into your own account.', kind: 'comment' },
    { text: "var q = 'label:\"Newsletters\" older_than:14d';", kind: 'keyword' },
    { text: 'var t = GmailApp.search(q, 0, 200);', kind: 'keyword' },
    { text: 'GmailApp.moveThreadsToArchive(t);' },
];
