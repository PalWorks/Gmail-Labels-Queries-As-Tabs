export {};
/**
 * wizardView.test.ts
 *
 * The shared wizard. Both onboarding surfaces mount this, so a failure here is
 * a failure in two places at once.
 *
 * The emphasis is on the parts that are easy to get wrong and invisible when
 * they are: that the caption always says what the animation is showing, that
 * the theme chooser only appears where it belongs, and that a failed save is
 * reported rather than swallowed.
 */

import { createWizard, WizardHandle } from '../../src/modules/onboarding/wizardView';
import { SLIDES, FINISH_LABEL, THEME_SLIDE_INDEX } from '../../src/modules/onboarding/wizardContent';
import { Theme } from '../../src/utils/storage';

function makeHost(overrides: Record<string, unknown> = {}) {
    return {
        loadTheme: jest.fn().mockResolvedValue('light' as Theme),
        saveTheme: jest.fn().mockResolvedValue(undefined),
        applyTheme: jest.fn(),
        onFinish: jest.fn(),
        onError: jest.fn(),
        ...overrides,
    };
}

async function settle(): Promise<void> {
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

let wizard: WizardHandle | null = null;

function mount(host: ReturnType<typeof makeHost>): HTMLElement {
    wizard = createWizard(host);
    document.body.appendChild(wizard.element);
    return wizard.element;
}

beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
});

afterEach(() => {
    wizard?.destroy();
    wizard = null;
});

describe('slides', () => {
    test('opens on the first slide', () => {
        const root = mount(makeHost());
        expect(root.querySelector('.glt-ob-title')?.textContent).toBe(SLIDES[0].title);
        expect(root.querySelector('.glt-ob-step')?.textContent).toBe('Step 1 of ' + SLIDES.length);
    });

    test('Next walks forward and Back walks back', () => {
        const root = mount(makeHost());
        const next = root.querySelector('.glt-ob-next') as HTMLElement;

        next.click();
        expect(root.querySelector('.glt-ob-title')?.textContent).toBe(SLIDES[1].title);

        (root.querySelector('.glt-ob-back') as HTMLElement).click();
        expect(root.querySelector('.glt-ob-title')?.textContent).toBe(SLIDES[0].title);
    });

    test('Back is hidden on the first slide, because there is nowhere to go', () => {
        const root = mount(makeHost());
        expect((root.querySelector('.glt-ob-back') as HTMLElement).hidden).toBe(true);

        (root.querySelector('.glt-ob-next') as HTMLElement).click();
        expect((root.querySelector('.glt-ob-back') as HTMLElement).hidden).toBe(false);
    });

    test('every slide names what the demo is doing', () => {
        // The caption is the fallback for every case where the motion does not
        // land: skipped ahead, background tab, reduced motion. A slide without
        // one is a slide that can say nothing at all.
        const root = mount(makeHost());
        for (let i = 0; i < SLIDES.length; i++) {
            wizard!.goTo(i);
            const text = root.querySelector('.glt-ob-caption')?.textContent ?? '';
            expect(text.length).toBeGreaterThan(0);
            expect(text).toBe(SLIDES[i].caption);
        }
    });

    test('the caption is announced, not just drawn', () => {
        // The demo itself is aria-hidden: it is decorative motion. Without a
        // live region the whole demonstration is silent to a screen reader.
        const root = mount(makeHost());
        const live = root.querySelector('.glt-ob-sr');
        expect(live?.getAttribute('aria-live')).toBe('polite');
        expect(live?.textContent).toBe(SLIDES[0].caption);
        expect(root.querySelector('.glt-ob-stage')?.getAttribute('aria-hidden')).toBe('true');
    });

    test('arrow keys move between slides', () => {
        const root = mount(makeHost());
        root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(wizard!.current()).toBe(1);
        root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        expect(wizard!.current()).toBe(0);
    });

    test('walking off either end does nothing rather than throwing', () => {
        mount(makeHost());
        expect(() => wizard!.goTo(-1)).not.toThrow();
        expect(wizard!.current()).toBe(0);
        wizard!.goTo(SLIDES.length - 1);
        expect(() => wizard!.goTo(SLIDES.length)).not.toThrow();
        expect(wizard!.current()).toBe(SLIDES.length - 1);
    });

    test('copy marked as code is rendered as code, not as text', () => {
        const root = mount(makeHost());
        wizard!.goTo(1);
        expect(root.querySelector('.glt-ob-bodytext code')?.textContent).toBe('is:unread has:attachment');
    });
});

describe('the theme chooser', () => {
    test('appears only on the last slide', () => {
        const root = mount(makeHost());
        const grid = root.querySelector('.glt-ob-themes') as HTMLElement;

        for (let i = 0; i < THEME_SLIDE_INDEX; i++) {
            wizard!.goTo(i);
            expect(grid.hidden).toBe(true);
        }
        wizard!.goTo(THEME_SLIDE_INDEX);
        expect(grid.hidden).toBe(false);
    });

    test('the final button says what happens next', () => {
        const root = mount(makeHost());
        wizard!.goTo(THEME_SLIDE_INDEX);
        expect(root.querySelector('.glt-ob-next')?.textContent).toBe(FINISH_LABEL);
    });

    test('opens on the theme already saved', async () => {
        const host = makeHost({ loadTheme: jest.fn().mockResolvedValue('dark' as Theme) });
        const root = mount(host);
        await settle();

        expect(root.querySelectorAll('.glt-ob-theme')[1].getAttribute('aria-pressed')).toBe('true');
        expect(root.dataset.resolved).toBe('dark');
    });

    test('choosing one retints the wizard, tells the host, and persists it', async () => {
        const host = makeHost();
        const root = mount(host);
        wizard!.goTo(THEME_SLIDE_INDEX);

        (root.querySelectorAll('.glt-ob-theme')[1] as HTMLElement).click();
        await settle();

        expect(root.dataset.resolved).toBe('dark');
        expect(host.applyTheme).toHaveBeenCalledWith('dark');
        expect(host.saveTheme).toHaveBeenCalledWith('dark');
    });

    test('exactly one card is pressed at a time', async () => {
        const root = mount(makeHost());
        wizard!.goTo(THEME_SLIDE_INDEX);
        (root.querySelectorAll('.glt-ob-theme')[1] as HTMLElement).click();
        await settle();

        const pressed = [...root.querySelectorAll('.glt-ob-theme')].filter(
            (b) => b.getAttribute('aria-pressed') === 'true'
        );
        expect(pressed.length).toBe(1);
    });

    test('a failed save is reported, not swallowed', async () => {
        const host = makeHost({ saveTheme: jest.fn().mockRejectedValue(new Error('storage is gone')) });
        const root = mount(host);
        wizard!.goTo(THEME_SLIDE_INDEX);

        (root.querySelectorAll('.glt-ob-theme')[1] as HTMLElement).click();
        await settle();

        expect(host.onError).toHaveBeenCalled();
    });

    test('the preview still repaints when the save fails', async () => {
        // Deliberate: nothing is lost by showing a theme that did not persist,
        // and reverting under the user's cursor is the more confusing failure.
        const host = makeHost({ saveTheme: jest.fn().mockRejectedValue(new Error('nope')) });
        const root = mount(host);
        wizard!.goTo(THEME_SLIDE_INDEX);

        (root.querySelectorAll('.glt-ob-theme')[1] as HTMLElement).click();
        await settle();

        expect(root.dataset.resolved).toBe('dark');
    });

    test('a failed read still opens the wizard', async () => {
        const host = makeHost({ loadTheme: jest.fn().mockRejectedValue(new Error('no storage')) });
        const root = mount(host);
        await settle();

        expect(root.querySelector('.glt-ob-title')?.textContent).toBe(SLIDES[0].title);
        expect(host.onError).toHaveBeenCalled();
    });
});

describe('finishing and dismissing', () => {
    test('the last slide finishes rather than walking off the end', () => {
        const host = makeHost();
        const root = mount(host);
        wizard!.goTo(THEME_SLIDE_INDEX);

        (root.querySelector('.glt-ob-next') as HTMLElement).click();

        expect(host.onFinish).toHaveBeenCalledTimes(1);
    });

    test('a close control appears only when the host asks for one', () => {
        const root = mount(makeHost({ showClose: true }));
        expect(root.querySelector('.glt-ob-close')).not.toBeNull();

        wizard!.destroy();
        wizard = null;

        const plain = mount(makeHost());
        expect(plain.querySelector('.glt-ob-close')).toBeNull();
    });

    test('destroy cancels pending animation steps', async () => {
        // Slide 1 schedules four staged changes. Tearing down mid-sequence
        // must not leave timers writing to a detached tree.
        const root = mount(makeHost());
        const stage = root.querySelector('.glt-ob-stage') as HTMLElement;
        wizard!.destroy();
        const after = stage.dataset.bar;

        await new Promise((r) => setTimeout(r, 60));
        expect(stage.dataset.bar).toBe(after);
        wizard = null;
    });

    test('destroy removes the wizard from the page', () => {
        mount(makeHost());
        expect(document.querySelector('.glt-ob')).not.toBeNull();
        wizard!.destroy();
        expect(document.querySelector('.glt-ob')).toBeNull();
        wizard = null;
    });
});
