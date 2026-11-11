// Records the Mealdrop example's walkthrough: `node scripts/record-mealdrop.mjs [--url http://localhost:6117]`.
//
// It drives the example's Storybook (start it first with `npm run example:mealdrop`) in headless Chrome, with
// a caption for each step, and writes docs/mealdrop.mp4 and docs/mealdrop.gif (see recording.mjs for what it
// needs). The photographs are loaded from the web as it records.
import { option, record } from './recording.mjs';

const base = option('--url', 'http://localhost:6117');

await record('mealdrop', async ({ page, canvas, pause, overlay, say, click, open }) => {
  /** The toolbar's scheme item: a button named by what it is for and the scheme it is on, and its list. */
  const scheme = async (to) => {
    await click(page.getByRole('button', { name: /^Colour scheme/ }));
    await click(page.getByRole('listbox', { name: 'Colour scheme' }).getByText(to, { exact: true }));
  };
  const panel = (name) => click(page.getByRole('tab', { name: new RegExp(`^${name}`) }));

  await page.goto(`${base}/?path=/story/components-restaurantcard--default`, { waitUntil: 'domcontentloaded' });
  await canvas.getByText('Burger Kingdom').waitFor({ timeout: 120_000 });
  await page.getByRole('button', { name: /dismiss|close/i }).last().click({ timeout: 1500 }).catch(() => {});
  await overlay();
  await pause(600);

  await say("Mealdrop's design system, rebuilt in Contract with its tokens");
  await pause(2000);

  await say('The toolbar sets the colour scheme, and every token follows');
  await scheme('Dark');
  await pause(1700);
  await scheme('Light');
  await pause(900);

  await say('A page is a component: a restaurant and a cart go in as args');
  await open('pages-restaurantdetailpage--with-items-in-the-cart', ['pages-restaurantdetailpage']);
  await canvas.getByText('To eat').waitFor();
  await pause(1800);

  await say('What the reader does comes out as actions');
  await panel('Actions');
  await click(canvas.getByText('Fries', { exact: true }).first());
  await click(canvas.getByLabel('increase quantity by one'));
  await pause(400);
  await click(canvas.getByLabel('confirm'));
  await pause(2000);

  await say('The whole app is a story too: its routes, its cart, and sources the story answers');
  await open('userflows-app--home', ['userflows-app']);
  await canvas.getByText('View all restaurants').waitFor();
  await pause(1500);
  await click(canvas.getByText('View all restaurants'));
  await pause(900);
  await click(canvas.getByTestId('Burgers'));
  await pause(900);
  await click(canvas.getByTestId('restaurant-card').first());
  await pause(900);
  await click(canvas.getByText(/Cheeseburger/).first());
  await click(canvas.getByLabel('confirm'));
  await pause(600);
  await click(canvas.getByLabel('food cart'));
  await pause(1300);
  await click(canvas.getByText(/checkout/i).last());
  await canvas.getByText('Contact details').waitFor();
  await pause(1800);

  await say('A play function walks the same way to a confirmed order, and checks each step');
  await open('userflows-app--to-success-page', ['userflows-app']);
  await canvas.getByText('Order confirmed!').waitFor({ timeout: 60_000 });
  await pause(600);
  await panel('Interactions');
  await pause(2400);

  await say('A story starts the app wherever it says: parameters.exact.location');
  await open('userflows-app--at-checkout-with-a-cart', ['userflows-app']);
  await canvas.getByText('Contact details').waitFor();
  await pause(2400);
  await say('');
  await pause(500);
}, { height: 900, gifWidth: 880 });
