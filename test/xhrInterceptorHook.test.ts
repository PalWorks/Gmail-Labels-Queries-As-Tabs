export {};
/**
 * xhrInterceptorHook.test.ts
 *
 * The page-world script is injected again every time the content script
 * arrives, which on a Gmail tab left open across updates is once per update.
 * These tests load the real module twice into one page and count what a
 * single Gmail response produces.
 */

class FakeXHR extends EventTarget {
    responseText = '';
    open(_method: string, _url: string): void {}
    send(_body?: unknown): void {}
}

function loadInterceptor(): void {
    jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../src/xhrInterceptor');
    });
}

/** Run one Gmail sync response through whatever wrappers the page holds. */
function gmailResponds(body: string): void {
    const xhr = new (window as any).XMLHttpRequest();
    xhr.open('POST', 'https://mail.google.com/sync/u/0/i/s');
    xhr.send();
    xhr.responseText = body;
    xhr.dispatchEvent(new Event('load'));
}

beforeEach(() => {
    (window as any).XMLHttpRequest = class extends FakeXHR {};
    delete (window as any).__gmailTabsXhrHook;
});

test('a response is reported once, however many copies have loaded', () => {
    const reports = jest.fn();
    document.addEventListener('gmailTabs:unreadUpdate', reports);

    loadInterceptor();
    loadInterceptor();
    loadInterceptor();
    gmailResponds(JSON.stringify([['Clients', 4]]));

    expect(reports).toHaveBeenCalledTimes(1);
    document.removeEventListener('gmailTabs:unreadUpdate', reports);
});

test('the newest copy parses, so an update brings its parser with it', () => {
    loadInterceptor();
    const hook = (window as any).__gmailTabsXhrHook;
    const first = hook.process;

    loadInterceptor();

    expect(hook.process).not.toBe(first);
    expect((window as any).__gmailTabsXhrHook).toBe(hook);
});
