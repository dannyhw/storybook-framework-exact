// The app's sources when it runs on its own: the same in-memory store of the stub data the stories use, kept
// for as long as the app runs. Mealdrop asks a remote API and keeps the cart in redux; neither is needed here.
import type { Answer, Sources } from './app.contract.d.ts';
import { createStore } from './data/store';

export const grants = '';

const store = createStore().sources;

const sources: Sources = {
  loadRestaurants: () => store.loadRestaurants(),
  loadCategories: () => store.loadCategories(),
  loadCart: () => store.loadCart(),
  loadOrder: () => store.loadOrder(),
  saveCartItem: ([id, name, description, price, quantity]) => store.saveCartItem(id, name, description, price, quantity),
  removeCartItem: ([id]) => store.removeCartItem(id),
  placeOrder: ([firstName, lastName, email, phone, address, postcode, city]) =>
    store.placeOrder(firstName, lastName, email, phone, address, postcode, city),
};
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
