import React from 'react';
import { History } from 'lucide-react';

// Mirrors CHANGELOG.md in the extension repository, trimmed to what a user
// would care about. When a release ships, add an entry here too: the store
// listing links to this page.
type Release = {
  version: string;
  date: string;
  tag: string;
  tagClass: string;
  summary: string;
  points: { title: string; body: string }[];
};

const RELEASES: Release[] = [
  {
    version: 'v1.5.0',
    date: '21 September 2026',
    tag: 'Hardening',
    tagClass: 'bg-[#FCE8E6] text-[#C5221F]',
    summary:
      'No new features. This release is about correctness and safety, and about the tests that stop each problem coming back.',
    points: [
      {
        title: 'Automation rules could act on the wrong mail',
        body:
          'A label whose name contains a space was put into the Gmail search unquoted, so a rule on "Old Stuff" searched for Old AND Stuff and could match threads that were never in that label. With a trash rule, unattended. The label is now quoted, each run is capped at 200 threads, and every thread is re-checked for the exact label before anything touches it. If you already generated a script, regenerate it: the old copy on your account keeps the old query until you replace it.',
      },
      {
        title: 'Settings could be lost when two windows wrote at once',
        body:
          'Changing tabs in Gmail while the options page was open could silently overwrite one of the two. All changes now go through a single writer and are applied as operations, not as whole-list overwrites, so a reorder made against a stale list no longer drops a tab somebody else just added.',
      },
      {
        title: 'The options page follows changes made elsewhere',
        body:
          'It used to go stale the moment anything changed in a Gmail tab and stay stale. It now updates live, keeps your cursor where it was, and waits if you are mid-drag.',
      },
      {
        title: 'Unread counts no longer read as zero after a dropped request',
        body:
          'A failed check kept showing nothing for half a minute. It now keeps the last known count and retries with a growing delay.',
      },
      {
        title: 'The tab bar picks the right theme on a slow connection',
        body:
          "Gmail's own styling can arrive after the extension has already drawn. The bar now notices and corrects itself.",
      },
      {
        title: 'Safer imports, and two accessibility fixes',
        body:
          'A crafted backup file can no longer inject anything into the options page, and two remaining colours now meet WCAG AA contrast.',
      },
    ],
  },
  {
    version: 'v1.4.0',
    date: '21 September 2026',
    tag: 'Feedback',
    tagClass: 'bg-[#E8F0FE] text-[#1967D2]',
    summary: 'A way to reach us without leaving the extension.',
    points: [
      {
        title: 'Support & Feedback form, built in',
        body:
          'Pick a category, write a message, add a reply address if you want one, and send. Diagnostics (version, browser build, and how many tabs, rules and accounts you have) are attached only if you leave the tick box on, and never include label names, tab names, addresses or mail.',
      },
    ],
  },
  {
    version: 'v1.3.0',
    date: '9 July 2026',
    tag: 'Colours & rules',
    tagClass: 'bg-[#E6F4EA] text-[#188038]',
    summary: 'Make the bar yours, and automate the boring parts.',
    points: [
      {
        title: 'Custom tab colours',
        body:
          'Eight theme-safe colours, shown as a dot on the bar and a swatch in your lists. Colour is decorative, never the only way to tell tabs apart.',
      },
      {
        title: 'Automation rule templates',
        body:
          'One-click presets: Clean Promotions, Tidy Newsletters, Quiet Social, Archive Receipts, Clear Updates. Applying one creates the tab and the rule together.',
      },
      {
        title: 'System theme now follows Gmail, not your desktop',
        body:
          'Gmail\'s theme is an account setting, so a dark desktop with a light Gmail used to give you a dark bar over a light inbox. It now reads Gmail itself and keeps up when you switch.',
      },
    ],
  },
  {
    version: 'v1.2.1',
    date: '7 July 2026',
    tag: 'Fixes',
    tagClass: 'bg-[#F1F3F4] text-[#444746]',
    summary: 'Accessibility and multi-account polish.',
    points: [
      {
        title: 'Theme and counts across several accounts',
        body:
          'Theme changes now propagate across multiple Gmail accounts open in one window, and unread counts work for search-query tabs.',
      },
    ],
  },
  {
    version: 'v1.1.0 and v1.2.0',
    date: '2025 to 2026',
    tag: 'Foundations',
    tagClass: 'bg-[#F1F3F4] text-[#444746]',
    summary: 'Rebuilt internals, a real test suite and a real build pipeline.',
    points: [
      {
        title: 'Modular rewrite',
        body:
          'The extension was split into focused modules with continuous integration, which is what made everything after it possible.',
      },
    ],
  },
  {
    version: 'v1.0.0',
    date: '2025',
    tag: 'Initial release',
    tagClass: 'bg-[#E8F0FE] text-[#1967D2]',
    summary: 'The first version, with the core idea intact.',
    points: [
      {
        title: 'Pin labels and searches as tabs',
        body:
          'Per-account tabs, unread counts, drag-and-drop reordering, automation rules with generated Apps Script, onboarding and data export.',
      },
    ],
  },
];

export const Changelog: React.FC = () => {
  return (
    <div className="bg-[#F6F8FC] min-h-screen pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-3xl shadow-sm p-8 md:p-12 border border-[#E1E3E1]">
          <div className="flex items-center space-x-3 mb-8">
            <div className="p-3 bg-[#E8F0FE] rounded-full">
              <History className="w-6 h-6 text-[#1A73E8]" />
            </div>
            <h1 className="text-3xl font-normal text-[#1F1F1F]">Changelog</h1>
          </div>

          <div className="space-y-12">
            {RELEASES.map((release) => (
              <div key={release.version} className="relative border-l-2 border-[#E1E3E1] pl-8 pb-4">
                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-[#0B57D0] border-4 border-white shadow-sm"></div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2">
                  <h2 className="text-2xl font-medium text-[#1F1F1F]">{release.version}</h2>
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium mt-2 sm:mt-0 ${release.tagClass}`}
                  >
                    {release.tag}
                  </span>
                </div>
                <p className="text-sm text-[#5F6368] mb-4">{release.date}</p>
                <div className="prose prose-slate prose-lg text-[#444746]">
                  <p>{release.summary}</p>
                  <ul className="list-disc pl-5 mt-4 space-y-2">
                    {release.points.map((point) => (
                      <li key={point.title}>
                        <strong>{point.title}:</strong> {point.body}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-12 text-sm text-[#5F6368]">
            The full technical changelog, including every fix and the reasoning behind each
            decision, is in the{' '}
            <a
              className="text-[#0B57D0] hover:underline"
              href="https://github.com/PalWorks/Gmail-Labels-Queries-As-Tabs/blob/main/CHANGELOG.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              repository
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
};
