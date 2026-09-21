import React from 'react';
import { Shield } from 'lucide-react';
import { Link } from 'react-router-dom';

// Keep this in step with the extension. Every claim below is checked against
// SECURITY.md and DECISIONS.md in the extension repository, and the version
// and date are updated by hand so the page never claims to be fresher than
// the last time somebody actually read it.
const LAST_UPDATED = '21 September 2026';
const COVERS_VERSION = '1.5.0';

const H2: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-xl font-medium text-[#1F1F1F] mt-8 mb-4">{children}</h2>
);

export const Privacy: React.FC = () => {
  return (
    <div className="bg-[#F6F8FC] min-h-screen pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-3xl shadow-sm p-8 md:p-12 border border-[#E1E3E1]">
          <div className="flex flex-col items-start mb-8">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Logo" className="w-12 h-12 mb-6 rounded-xl" />
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-[#E6F4EA] rounded-full">
                <Shield className="w-6 h-6 text-[#188038]" />
              </div>
              <h1 className="text-3xl font-normal text-[#1F1F1F]">Privacy Policy</h1>
            </div>
          </div>

          <div className="prose prose-slate prose-lg text-[#444746]">
            <p className="mb-6">
              Last updated: {LAST_UPDATED}. Covers extension version {COVERS_VERSION}.
            </p>

            <H2>1. The short version</H2>
            <p className="mb-4">
              Gmail Labels &amp; Queries as Tabs ("the extension") reads your Gmail page to draw a
              tab bar and to count unread messages. It does that entirely inside your browser. It
              has no server, no database, no account, no analytics and no advertising, and it never
              sends your mail, your contacts, your label names or your tab names anywhere.
            </p>
            <p className="mb-4">
              Exactly two things ever leave your browser, and both are listed in full in section 4.
              One happens only when you press a button. The other happens only after you have
              already uninstalled.
            </p>

            <H2>2. What the extension stores, and where</H2>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>
                <strong>Your tabs and automation rules</strong> are stored in
                {' '}<code>chrome.storage.sync</code>, keyed per Gmail account. Chrome syncs that
                between your own signed-in Chrome browsers, the same way it syncs your bookmarks.
                It goes to Google, under your own Google account, and never to us.
              </li>
              <li>
                <strong>Your theme preference</strong> is stored in <code>chrome.storage.local</code>,
                which stays on the one device.
              </li>
              <li>
                <strong>Nothing else is stored.</strong> No message, subject, sender, address or
                attachment is written to storage at any point.
              </li>
            </ul>
            <p className="mb-4">
              You can see everything the extension holds, export it as a JSON file, or delete it,
              from the extension's own Settings page. Removing the extension removes its storage.
            </p>

            <H2>3. What the extension reads from Gmail</H2>
            <p className="mb-4">
              To draw the bar and keep unread counts current, the extension reads Gmail's page, its
              own unread Atom feed and the responses to Gmail's own network requests, all on
              <code> mail.google.com</code>. This is how it learns your label list and how many
              unread messages each label has.
            </p>
            <p className="mb-4">
              That reading happens in your browser and stops there. It is not logged, not stored and
              not transmitted. The extension has no Gmail API access, no OAuth token and no API key.
            </p>

            <H2>4. The two things that leave your browser</H2>
            <p className="mb-4">
              <strong>a. Feedback you choose to send.</strong> If you fill in the Support &amp;
              Feedback form inside the extension and press Send, we receive your message, the
              category you picked, and the reply address only if you typed one. A tick box, on by
              default and clearly labelled, also attaches the extension version, your browser build,
              and the number of tabs, rules and accounts you have. Never label names, tab names,
              contacts or mail. It is sent to our own relay at
              {' '}<code>gmail-tabs-feedback.sunmooncal.workers.dev</code>, which forwards it to our
              support mailbox and stores nothing. Nothing is sent if you do not press Send.
            </p>
            <p className="mb-4">
              <strong>b. A page that opens after you uninstall.</strong> When you remove the
              extension, Chrome opens a short feedback form hosted by Tally at
              {' '}<code>tally.so</code>, so we can learn why people leave. The extension sends
              nothing itself: Chrome navigates you to a plain form link that carries no email
              address, no settings and no identifier, so Tally learns only that somebody
              uninstalled, never who. Answering is optional and closing the tab sends nothing. If
              you do fill it in, Tally processes it under
              {' '}<a className="text-[#0B57D0] hover:underline" href="https://tally.so/help/privacy-policy" target="_blank" rel="noopener noreferrer">their privacy policy</a>.
            </p>

            <H2>5. Permissions, and why each one exists</H2>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><code>storage</code> — save your tabs, rules and theme.</li>
              <li><code>downloads</code> — write the JSON backup file when you press Export.</li>
              <li><code>management</code> — let the Uninstall button in Settings remove the extension.</li>
              <li><code>host permission for https://mail.google.com/*</code> — run inside Gmail, which is the whole point.</li>
            </ul>
            <p className="mb-4">
              There is no <code>&lt;all_urls&gt;</code>, no access to any other site, and no
              {' '}<code>scripting</code> permission. The extension cannot run on any page other
              than Gmail.
            </p>

            <H2>6. Automation rules run under your account, not ours</H2>
            <p className="mb-4">
              The automation feature generates Google Apps Script code and shows it to you. You
              choose whether to paste it into your own Google account and run it. It executes as
              you, on Google's infrastructure, and we never see it run, never receive its output,
              and cannot trigger it.
            </p>

            <H2>7. This website</H2>
            <p className="mb-4">
              This marketing site, unlike the extension, uses Google Analytics to count visits, and
              embeds a Tally form on the contact section. That is ordinary website measurement and
              is entirely separate from the extension, which contains no analytics of any kind.
            </p>

            <H2>8. Children</H2>
            <p className="mb-4">
              The extension is not directed at children under 13 and we knowingly collect nothing
              from them. Since we collect no personal data at all except feedback you deliberately
              send us, there is nothing held about any user to request or delete.
            </p>

            <H2>9. Changes to this policy</H2>
            <p className="mb-4">
              If what the extension does changes, this page changes with it, and the date and
              version at the top move. Material changes are also recorded in the
              {' '}<Link to="/changelog" className="text-[#0B57D0] hover:underline">changelog</Link>.
            </p>

            <H2>Contact</H2>
            <p>
              Questions, corrections or a deletion request: use the Support &amp; Feedback page
              inside the extension, write to <a className="text-[#0B57D0] hover:underline" href="mailto:support@palworks.ai">support@palworks.ai</a>,
              or get in touch <Link to="/#contact" className="text-[#0B57D0] hover:underline">here</Link>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
