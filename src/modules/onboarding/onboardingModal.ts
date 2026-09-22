/**
 * onboardingModal.ts
 *
 * The onboarding wizard as a modal over Gmail.
 *
 * This is the surface people actually get, because anyone installing a Gmail
 * extension almost always has Gmail open. The standalone welcome page exists
 * for the case where they do not, and both run the same
 * [wizardView](./wizardView.ts); the only difference is what surrounds it.
 *
 * Being over Gmail buys one thing the page cannot offer: choosing a theme on
 * the last slide retints the user's real tab bar behind the modal, because the
 * write goes through `setGlobalTheme` and every open Gmail tab is already
 * listening for that key.
 */

import { getGlobalTheme, setGlobalTheme, Theme } from '../../utils/storage';
import { applyTheme } from '../theme';
import { isExtensionContextAlive, isContextInvalidatedError } from '../extensionContext';
import { renderContextInvalidatedNotice } from '../modals/contextNotice';
import { createWizard, WizardHandle } from './wizardView';
export { SHOW_ONBOARDING_ACTION } from '../messages';

/** Id of the scrim, so a second trigger re-uses the open tour. */
export const ONBOARDING_MODAL_ID = 'gmail-labels-onboarding';


let wizard: WizardHandle | null = null;

/** True while the tour is on screen. */
export function isOnboardingOpen(): boolean {
    return document.getElementById(ONBOARDING_MODAL_ID) !== null;
}

/**
 * Show the tour, or bring it back to the first slide if it is already up.
 *
 * Re-entry restarts rather than doing nothing: someone who picks "Show me
 * around" while the tour is already open means they want to see it again.
 */
export function showOnboarding(): void {
    const existing = document.getElementById(ONBOARDING_MODAL_ID);
    if (existing && wizard) {
        wizard.goTo(0);
        return;
    }

    const scrim = document.createElement('div');
    scrim.id = ONBOARDING_MODAL_ID;
    scrim.className = 'glt-ob-scrim';

    const close = (): void => {
        document.removeEventListener('keydown', onKeyDown);
        wizard?.destroy();
        wizard = null;
        scrim.remove();
    };

    const onKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') close();
    };

    document.addEventListener('keydown', onKeyDown);

    // Clicking the backdrop dismisses; clicking the panel must not.
    scrim.addEventListener('click', (e) => {
        if (e.target === scrim) close();
    });

    wizard = createWizard({
        loadTheme: () => getGlobalTheme(),
        saveTheme: (theme: Theme) => setGlobalTheme(theme),
        applyTheme: (theme: Theme) => applyTheme(theme),
        onFinish: close,
        showClose: true,
        onError: (error: unknown) => reportFailure(scrim, close, error),
    });

    scrim.appendChild(wizard.element);
    document.body.appendChild(scrim);

    // Checked after the panel is mounted so Escape still dismisses an orphaned
    // tour rather than trapping the user behind a scrim that cannot close.
    if (!isExtensionContextAlive()) {
        showDeadContextNotice(scrim, close);
        return;
    }

    // Move focus in, so the tour is operable from the keyboard immediately.
    const first = wizard.element.querySelector<HTMLElement>('.glt-ob-next');
    first?.focus();
}

/** Dismiss the tour if it is open. Used when the page is being torn down. */
export function hideOnboarding(): void {
    document.getElementById(ONBOARDING_MODAL_ID)?.remove();
    wizard?.destroy();
    wizard = null;
}

/**
 * An orphaned tab cannot save a theme, so the last slide would silently do
 * nothing. Saying so beats a wizard that looks fine and remembers nothing.
 */
function showDeadContextNotice(scrim: HTMLElement, close: () => void): void {
    const panel = scrim.querySelector('.glt-ob');
    if (!panel) return;
    panel.classList.add('modal-content');
    renderContextInvalidatedNotice(panel, close);
}

function reportFailure(scrim: HTMLElement, close: () => void, error: unknown): void {
    if (isContextInvalidatedError(error)) {
        showDeadContextNotice(scrim, close);
        return;
    }
    // Anything else is a real bug. The tour is still readable, and telling
    // someone to reload when reloading will not help is worse than saying
    // nothing.
    console.error('Gmail Tabs: the tour could not save a setting', error);
}
