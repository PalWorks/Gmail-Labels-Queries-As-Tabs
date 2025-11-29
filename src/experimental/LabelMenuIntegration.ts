/*
 * ARCHIVED FEATURE: Label Menu Integration
 * 
 * This file contains the code for adding "Add to tabs" options to the native Gmail label dropdown menu.
 * It includes the "Capture Click" strategy to fix the "sticky label" bug.
 * 
 * REASON FOR ARCHIVE:
 * The feature was disabled per user request to ensure stability. The DOM manipulation required
 * to make this work reliably (specifically handling Gmail's menu reuse) was deemed too risky/complex
 * for the current version.
 * 
 * DEPENDENCIES:
 * This code relies on the following variables and functions from `content.ts`:
 * - `currentUserEmail`: string | null
 * - `getSettings(email)`: Promise<Settings>
 * - `updateTabOrder(email, tabs)`: Promise<void>
 * - `renderTabs()`: void
 * - `currentSettings`: Settings
 * - `Tab`: interface
 * - `normalizeLabel(name)`: function
 * 
 * TO RESTORE:
 * 1. Uncomment this code.
 * 2. Resolve the dependencies (either export them from content.ts or pass them as context).
 * 3. Call `initLabelMenuObserver()` in `content.ts`.
 */

/*
let lastClickedLabelName: string | null = null;

function initLabelClickListener() {
    document.body.addEventListener('mousedown', (event) => {
        const target = event.target as HTMLElement;
        // Look for the 3-dots menu button (or any button with popup) inside a label row
        const triggerButton = target.closest('.aim [role="button"][aria-haspopup], .TO [role="button"][aria-haspopup]');
        
        if (triggerButton) {
            const row = triggerButton.closest('.aim, .TO');
            if (row) {
                const link = row.querySelector('a[href*="#label/"], a[href*="#category/"]');
                if (link) {
                    const href = link.getAttribute('href');
                    if (href) {
                        const rawLabel = href.split(/#(label|category)\//)[2];
                        if (rawLabel) {
                            lastClickedLabelName = decodeURIComponent(rawLabel).replace(/\+/g, ' ');
                            // console.log('GmailTabs: Captured click on label:', lastClickedLabelName);
                        }
                    }
                }
            }
        }
    }, true); // Use capture phase to ensure we get it before Gmail handles it
}

function initLabelMenuObserver() {
    initLabelClickListener(); // Initialize the click listener

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node instanceof HTMLElement) {
                    // Check if it's a menu
                    if (node.getAttribute('role') === 'menu' || node.classList.contains('J-M')) {
                        handleLabelMenu(node);
                    }
                    // Check if it's content added to an existing menu (Gmail reuses menus)
                    else {
                        const parentMenu = node.closest('[role="menu"], .J-M');
                        if (parentMenu) {
                            handleLabelMenu(parentMenu as HTMLElement);
                        }
                    }
                }
            });
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

function handleLabelMenu(menu: HTMLElement) {
    // Debounce to prevent multiple calls when multiple children are added
    const existingTimeout = menu.getAttribute('data-gmail-tabs-timeout');
    if (existingTimeout) {
        clearTimeout(parseInt(existingTimeout, 10));
    }

    const timeoutId = window.setTimeout(() => {
        menu.removeAttribute('data-gmail-tabs-timeout');
        
        const textContent = menu.textContent || '';
        // Check for characteristic menu items to ensure it's a label menu
        if (textContent.includes('Label color') || textContent.includes('Label colour') ||
            (textContent.includes('Show') && textContent.includes('Hide') && textContent.includes('Remove label'))) {

            // Use captured label name if available and fresh (clicked recently)
            // For now, we assume if the menu opens right after a click, it's the one.
            // We could add a timestamp check if needed, but this should be safe enough for now.
            let labelName = lastClickedLabelName;

            // Fallback to DOM scraping if capture failed (e.g. keyboard nav)
            if (!labelName) {
                labelName = getLabelFromMenu(menu);
            }

            if (labelName) {
                injectLabelMenuOptions(menu, labelName);
                // Reset captured label to avoid it sticking for non-click interactions
                // But wait a bit to ensure we don't clear it before other observers might need it (though we are the main consumer)
                // Actually, clearing it here is safe because we've passed it to injectLabelMenuOptions
                lastClickedLabelName = null;
            }
        }
    }, 50);

    menu.setAttribute('data-gmail-tabs-timeout', timeoutId.toString());
}

function getLabelFromMenu(menu: HTMLElement): string | null {
    // Strategy 1: Aria-LabelledBy (Standard Accessibility Link)
    // The menu usually has aria-labelledby="ID_OF_BUTTON"
    const labelledBy = menu.getAttribute('aria-labelledby');
    if (labelledBy) {
        const triggerButton = document.getElementById(labelledBy);
        if (triggerButton) {
            // Traverse up to the row container (usually .aim or .TO)
            const row = triggerButton.closest('.aim, .TO');
            if (row) {
                const link = row.querySelector('a[href*="#label/"], a[href*="#category/"]');
                if (link) {
                    const href = link.getAttribute('href');
                    if (href) {
                        // Handle #label/ and #category/
                        const rawLabel = href.split(/#(label|category)\//)[2];
                        if (rawLabel) {
                            return decodeURIComponent(rawLabel).replace(/\+/g, ' ');
                        }
                    }
                }
            }
        }
    }

    // Strategy 2: Check for Color Palette Title (Fallback)
    const colorItems = menu.querySelectorAll('div[title*="Color for"]');
    if (colorItems.length > 0) {
        const title = colorItems[0].getAttribute('title');
        if (title) {
            return title.replace('Color for ', '').trim();
        }
    }

    // Strategy 3: Active Menu Button Class (.aj1) - Only if visible
    // This is less reliable as the class might stick, but we check for visibility
    const activeMenuButtons = document.querySelectorAll('.aj1');
    for (const btn of Array.from(activeMenuButtons)) {
        if (btn.getBoundingClientRect().height > 0) { // Check if visible
            const row = btn.closest('.aim, .TO');
            if (row) {
                const link = row.querySelector('a[href*="#label/"], a[href*="#category/"]');
                if (link) {
                    const href = link.getAttribute('href');
                    if (href) {
                        const rawLabel = href.split(/#(label|category)\//)[2];
                        if (rawLabel) {
                            return decodeURIComponent(rawLabel).replace(/\+/g, ' ');
                        }
                    }
                }
            }
        }
    }

    return null;
}

function injectLabelMenuOptions(menu: HTMLElement, labelName: string) {
    // Clean up existing items to ensure we update the label closure
    const existingItems = menu.querySelectorAll('.gmail-tabs-menu-item, .gmail-tabs-menu-header, .gmail-tabs-separator');
    existingItems.forEach(item => item.remove());

    const separator = document.createElement('div');
    separator.className = 'J-Kh gmail-tabs-separator'; // Added class for identification
    separator.style.borderTop = '1px solid #e0e0e0';
    separator.style.margin = '6px 0';

    // Header "Gmail Tabs" - Match "In label list" style
    const header = document.createElement('div');
    header.className = 'gmail-tabs-menu-header';
    header.textContent = 'Gmail Tabs';
    header.style.padding = '6px 28px'; // Increased padding to match Gmail headers
    header.style.fontSize = '12px'; // Standard header size
    header.style.color = '#5f6368'; // Standard header color
    header.style.fontWeight = '500'; // Standard header weight
    header.style.textTransform = 'uppercase'; // Often uppercase
    header.style.letterSpacing = '0.5px';

    // Helper for items
    const createItem = (text: string, onClick: () => void) => {
        const item = document.createElement('div');
        item.className = 'gmail-tabs-menu-item J-N';
        item.setAttribute('role', 'menuitem');
        item.style.cursor = 'pointer';
        item.style.padding = '6px 28px 6px 48px'; // Indented to match sub-items (like Show/Hide)
        item.style.fontSize = '14px';
        item.style.color = '#202124';
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.textContent = text;

        item.addEventListener('mouseenter', () => item.style.backgroundColor = '#f1f3f4');
        item.addEventListener('mouseleave', () => item.style.backgroundColor = 'transparent');
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
        });
        return item;
    };

    const addItem = createItem('Add to tabs', async () => {
        if (currentUserEmail) {
            const settings = await getSettings(currentUserEmail);
            if (!settings.tabs.some(t => t.value === labelName)) {
                const newTab: Tab = {
                    id: `label-${Date.now()}`,
                    title: labelName,
                    type: 'label',
                    value: labelName
                };
                const newTabs = [...settings.tabs, newTab];
                await updateTabOrder(currentUserEmail, newTabs);
                currentSettings = await getSettings(currentUserEmail);
                renderTabs();
            } else {
                alert(`"${labelName}" is already a tab.`);
            }
            menu.style.display = 'none';
        }
    });

    const addSubItem = createItem('Add to tabs (including sublabels)', async () => {
        if (currentUserEmail) {
            const parentPrefix = labelName + '/';
            // Fetch all label links from the sidebar to find sublabels
            const allLabelLinks = Array.from(document.querySelectorAll('a[href*="#label/"]'));
            const subLabels = allLabelLinks
                .map(link => {
                    const href = link.getAttribute('href');
                    if (href) {
                        return decodeURIComponent(href.split('#label/')[1]).replace(/\+/g, ' ');
                    }
                    return '';
                })
                .filter(name => name.startsWith(parentPrefix));

            const uniqueSubLabels = [...new Set(subLabels)];
            const quote = (s: string) => s.includes(' ') ? `"${s}"` : s;
            const queryParts = [quote(labelName), ...uniqueSubLabels.map(quote)];
            const query = queryParts.map(p => `label:${p}`).join(' OR ');

            const settings = await getSettings(currentUserEmail);
            const newTab: Tab = {
                id: `query-${Date.now()}`,
                title: labelName + ' + Subs',
                type: 'hash',
                value: `#search/${encodeURIComponent(query).replace(/%20/g, '+')}`
            };
            const newTabs = [...settings.tabs, newTab];

            await updateTabOrder(currentUserEmail, newTabs);
            currentSettings = await getSettings(currentUserEmail);
            renderTabs();
            menu.style.display = 'none';
        }
    });

    // Insert Order: Header -> Item 1 -> Item 2 -> Separator
    menu.insertBefore(separator, menu.firstChild);
    menu.insertBefore(addSubItem, menu.firstChild);
    menu.insertBefore(addItem, menu.firstChild);
    menu.insertBefore(header, menu.firstChild);
}

function createMenuItem(text: string, onClick: () => void): HTMLElement {
    const item = document.createElement('div');
    item.className = 'gmail-tabs-menu-item J-N'; // J-N is standard menu item class
    item.setAttribute('role', 'menuitem');
    item.style.cursor = 'pointer';
    item.style.padding = '6px 16px';
    item.style.fontSize = '14px';
    item.style.color = '#202124';
    item.style.display = 'flex';
    item.style.alignItems = 'center';

    item.textContent = text;

    item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = '#f1f3f4';
    });
    item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = 'transparent';
    });

    item.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
    });

    return item;
}
*/
