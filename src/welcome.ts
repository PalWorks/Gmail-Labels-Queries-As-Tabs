/**
 * welcome.ts
 * Logic for the onboarding page.
 */

document.addEventListener('DOMContentLoaded', () => {
    const openGmailBtn = document.getElementById('open-gmail-btn');

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
