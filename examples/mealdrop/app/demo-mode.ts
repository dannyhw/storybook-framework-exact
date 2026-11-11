import { userEvent } from 'storybook/test';

/**
 * Mealdrop's demo mode, for showing a flow to people: a pointer glides to each element before it is clicked, and
 * text is typed at a readable pace (each field takes about half a second). It wraps a play function's
 * `userEvent`; everything else passes through.
 */
export function demoUserEvent<T>(base: T, { delay = 1000 } = {}): T {
  const pointer = () => {
    let element = document.querySelector<HTMLElement>('#demo-pointer');
    if (!element) {
      element = document.createElement('div');
      element.id = 'demo-pointer';
      element.setAttribute('aria-hidden', 'true');
      Object.assign(element.style, {
        position: 'fixed',
        zIndex: '9999',
        top: '50%',
        left: '50%',
        width: '28px',
        height: '28px',
        margin: '-14px 0 0 -14px',
        borderRadius: '50%',
        background: 'rgb(0 0 0 / 45%)',
        border: '2px solid rgb(255 255 255 / 80%)',
        boxShadow: '0 2px 8px rgb(0 0 0 / 30%)',
        pointerEvents: 'none',
        transitionProperty: 'top, left, transform',
        transitionTimingFunction: 'cubic-bezier(0.2, 1, 0.2, 1)',
      });
      document.body.append(element);
    }
    return element;
  };

  const moveTo = async (target: Element) => {
    const rect = target.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) target.scrollIntoView({ block: 'center' });
    // Let a sliding panel settle before measuring where the target is.
    await new Promise((done) => setTimeout(done, 300));
    const { left, top, width, height } = target.getBoundingClientRect();
    const element = pointer();
    element.style.transitionDuration = `${Math.round(delay * 0.9)}ms`;
    element.style.top = `${Math.round(top + Math.min(height / 2, 50))}px`;
    element.style.left = `${Math.round(left + Math.min(width / 2, 50))}px`;
    await new Promise((done) => setTimeout(done, delay));
    // A press: the pointer dips as it clicks.
    element.style.transform = 'scale(0.7)';
    setTimeout(() => (element.style.transform = ''), 200);
  };

  const events = base as typeof userEvent;
  return {
    ...events,
    click: async (target: Element, options?: Parameters<typeof userEvent.click>[1]) => {
      await moveTo(target);
      return events.click(target, options);
    },
    type: async (target: Element, text: string, options?: Parameters<typeof userEvent.type>[2]) => {
      await moveTo(target);
      return userEvent.setup({ delay: Math.floor(500 / Math.max(text.length, 1)) }).type(target, text, options);
    },
  } as T;
}
