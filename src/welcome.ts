/**
 * welcome.ts
 * Logic for the onboarding page.
 */

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

    // Load saved theme
    chrome.storage.sync.get(['theme'], (result) => {
        const savedTheme = result.theme || 'system';
        applyTheme(savedTheme);

        // Update radio button
        const radioToSelect = document.querySelector(`input[name="theme"][value="${savedTheme}"]`) as HTMLInputElement;
        if (radioToSelect) {
            radioToSelect.checked = true;
        }
    });

    // Listen for changes
    themeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            if (target.checked) {
                const newTheme = target.value;
                applyTheme(newTheme);
                // Save to global 'theme' key — content.ts will migrate to account-scoped on init
                chrome.storage.sync.set({ theme: newTheme });
            }
        });
    });

    // --- Existing Logic ---

    if (openGmailBtn) {
        openGmailBtn.addEventListener('click', () => {
            // Check for existing Gmail tabs
            chrome.tabs.query({ url: "https://mail.google.com/*" }, (tabs) => {
                if (tabs && tabs.length > 0) {
                    // Activate the first one found
                    const tab = tabs[0];
                    if (tab.id) {
                        chrome.tabs.update(tab.id, { active: true });
                        chrome.tabs.reload(tab.id);
                        // Optional: Close the welcome tab if you want, but keeping it open is fine too
                        // window.close(); 
                    }
                } else {
                    // No tab found, open a new one
                    chrome.tabs.create({ url: 'https://mail.google.com/' });
                }
            });
        });
    }
});
