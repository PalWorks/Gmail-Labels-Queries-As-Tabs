/**
 * welcome.ts
 * Logic for the onboarding page.
 */

import { getGlobalTheme, setGlobalTheme, Theme } from './utils/storage';
import { catchChromeError } from './modules/extensionContext';

document.addEventListener('DOMContentLoaded', () => {
    const openGmailBtn = document.getElementById('open-gmail-btn');
    const themeRadios = document.querySelectorAll('input[name="theme"]') as NodeListOf<HTMLInputElement>;

    // --- Theme Logic ---

    // Function to apply theme
    function applyTheme(theme: string) {
        if (theme === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
        } else if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            // System
            document.documentElement.removeAttribute('data-theme');
        }
    }

    // Load saved theme (browser-wide, shared by all accounts)
    getGlobalTheme()
        .then((savedTheme) => {
            applyTheme(savedTheme);

            // Update radio button
            const radioToSelect = document.querySelector(
                `input[name="theme"][value="${savedTheme}"]`
            ) as HTMLInputElement;
            if (radioToSelect) {
                radioToSelect.checked = true;
            }
        })
        .catch((e) => {
            // The page stays usable on its default theme.
            console.error('Welcome: could not read the saved theme', e);
        });

    // Listen for changes
    themeRadios.forEach((radio) => {
        radio.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            if (target.checked) {
                const newTheme = target.value as Theme;
                applyTheme(newTheme);
                // Persist to the browser-wide theme so all Gmail tabs pick it up.
                setGlobalTheme(newTheme).catch((e) => {
                    // The radio already moved, so say the choice did not stick.
                    console.error('Welcome: could not save the theme', e);
                    target.checked = false;
                });
            }
        });
    });

    // --- Existing Logic ---

    if (openGmailBtn) {
        openGmailBtn.addEventListener('click', () => {
            // Check for existing Gmail tabs
            chrome.tabs.query({ url: 'https://mail.google.com/*' }, (tabs) => {
                if (tabs && tabs.length > 0) {
                    // Activate the first one found
                    const tab = tabs[0];
                    if (tab.id) {
                        const report = (e: unknown): void =>
                            console.error('Welcome: could not switch to the Gmail tab', e);
                        catchChromeError(chrome.tabs.update(tab.id, { active: true }), report);
                        catchChromeError(chrome.tabs.reload(tab.id), report);
                        // Optional: Close the welcome tab if you want, but keeping it open is fine too
                        // window.close();
                    }
                } else {
                    // No tab found, open a new one
                    catchChromeError(chrome.tabs.create({ url: 'https://mail.google.com/' }), (e) =>
                        console.error('Welcome: could not open Gmail', e)
                    );
                }
            });
        });
    }
});
