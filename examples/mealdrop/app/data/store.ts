// An in-memory stand-in for Mealdrop's API and its redux store: the sources `app.contract` asks, answered from
// the stub data. The stories give one to the app (`parameters.exact.sources`), and `app.ts` gives one to the
// app run on its own. Each source takes the arguments the app sends and answers in the shape it declared.
import { type CartItem, categories, type Category, type Restaurant, restaurants } from './stub';

export interface StoreOptions {
  /** What the cart holds at the start. */
  cart?: CartItem[];
  /** How long the restaurants take to arrive, in milliseconds (a slow kitchen). */
  restaurantsDelay?: number;
}

/** What a write to the cart or an order answers. */
export interface Reply {
  ok: boolean;
}

const copy = <T>(value: T): T => structuredClone(value);
const later = <T>(ms: number, value: T): Promise<T> | T =>
  ms > 0 ? new Promise((done) => setTimeout(() => done(value), ms)) : value;

/** The store's state and the sources that read and change it. `reset` puts it back as it started. */
export function createStore(options: StoreOptions = {}) {
  let cart: CartItem[] = [];
  let order: CartItem[] = [];
  const reset = () => {
    cart = copy(options.cart ?? []);
    order = [];
  };
  reset();

  const sources = {
    loadRestaurants: (): Promise<Restaurant[]> | Restaurant[] => later(options.restaurantsDelay ?? 0, copy(restaurants)),
    loadCategories: (): Category[] => copy(categories),
    loadCart: (): CartItem[] => copy(cart),
    loadOrder: (): CartItem[] => copy(order),
    // Mealdrop's `saveItemAction`: a dish already in the cart takes the new quantity, another is added.
    saveCartItem: (id: number, name: string, description: string, price: number, quantity: number): Reply => {
      cart = cart.some((item) => item.id === id)
        ? cart.map((item) => (item.id === id ? { ...item, quantity } : item))
        : [...cart, { id, name, description, price, quantity }];
      return { ok: true };
    },
    // Mealdrop's `clearItemAction`.
    removeCartItem: (id: number): Reply => {
      cart = cart.filter((item) => item.id !== id);
      return { ok: true };
    },
    // Mealdrop's `saveOrderAction` then `clearCartAction`: the cart becomes the order. The contact and delivery
    // details are not kept, as Mealdrop keeps none.
    placeOrder: (
      _firstName: string,
      _lastName: string,
      _email: string,
      _phone: string,
      _address: string,
      _postcode: string,
      _city: string,
    ): Reply => {
      if (cart.length === 0) return { ok: false };
      order = cart;
      cart = [];
      return { ok: true };
    },
  };
  return { sources, reset };
}

export type Sources = ReturnType<typeof createStore>['sources'];
