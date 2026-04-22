// /js/state.js

const CART_STORAGE_KEY = 'celestial_comics_cart_v1';

const initialState = {
  currentUser: null,
  profile: null,
  isAdmin: false,

  voteBalance: 0,
  bonusVoteBalance: 0,

  ownedStoryIds: [],
  ownedStoryAccess: [],

  cart: [],

  stories: [],
  products: [],

  votingPeriod: null,
  votingStatus: 'none',

  selectedStoryId: null,
  lastOrder: null
};

let state = createInitialState();
const listeners = new Set();

function createInitialState() {
  return {
    ...initialState,
    ownedStoryIds: [],
    ownedStoryAccess: [],
    cart: loadCartFromStorage(),
    stories: [],
    products: []
  };
}

function clone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function emit(reason = 'state:update') {
  const snapshot = getState();

  listeners.forEach((listener) => {
    try {
      listener(snapshot, reason);
    } catch (error) {
      console.error('state.js listener error:', error);
    }
  });
}

function saveCartToStorage(cart) {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch (error) {
    console.error('Failed to save cart to localStorage:', error);
  }
}

function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to load cart from localStorage:', error);
    return [];
  }
}

function normalizeQuantity(quantity) {
  const parsed = Number(quantity);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

function normalizeCents(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed);
}

function deriveVotingStatus(period) {
  if (!period) return 'none';
  if (period.finalized_at) return 'finalized';
  if (period.closed_at) return 'closed';

  const now = new Date();
  const start = new Date(period.start_time);
  const end = new Date(period.end_time);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'unknown';
  }

  if (now < start) return 'upcoming';
  if (now >= start && now <= end) return 'open';
  return 'closed';
}

function toOwnedStoryIds(accessRows) {
  const ids = new Set();

  (Array.isArray(accessRows) ? accessRows : []).forEach((row) => {
    if (row?.story_id) {
      ids.add(String(row.story_id));
    }
  });

  return [...ids];
}

function getCartItemKey(item) {
  const productId = item?.product_id || item?.id || 'unknown-product';
  const storyId = item?.story_id || 'no-story';
  const productType = item?.product_type || 'merch';
  return `${productId}::${storyId}::${productType}`;
}

function syncCartPersistence() {
  saveCartToStorage(state.cart);
}

export function getState() {
  return clone(state);
}

export function subscribe(listener) {
  if (typeof listener !== 'function') {
    throw new Error('subscribe requires a function');
  }

  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function setState(partial, reason = 'state:set') {
  if (!partial || typeof partial !== 'object') {
    throw new Error('setState requires an object');
  }

  state = {
    ...state,
    ...partial
  };

  if (Object.prototype.hasOwnProperty.call(partial, 'cart')) {
    syncCartPersistence();
  }

  emit(reason);
}

export function updateState(updater, reason = 'state:update') {
  if (typeof updater !== 'function') {
    throw new Error('updateState requires a function');
  }

  const nextPartial = updater(getState());

  if (!nextPartial || typeof nextPartial !== 'object') {
    throw new Error('updateState updater must return an object');
  }

  setState(nextPartial, reason);
}

export function resetState(options = {}) {
  const { preserveCart = true } = options;
  const preservedCart = preserveCart ? loadCartFromStorage() : [];

  state = {
    ...createInitialState(),
    cart: preservedCart
  };

  if (!preserveCart) {
    syncCartPersistence();
  }

  emit('state:reset');
}

export function hydrateCartFromStorage() {
  state = {
    ...state,
    cart: loadCartFromStorage()
  };

  emit('cart:hydrate');
}

export function setCurrentUser(user) {
  setState(
    {
      currentUser: user || null
    },
    'auth:user'
  );
}

export function setProfile(profile) {
  setState(
    {
      profile: profile || null,
      isAdmin: profile?.role === 'admin',
      voteBalance: Number(profile?.vote_balance) || 0,
      bonusVoteBalance: Number(profile?.bonus_vote_balance) || 0
    },
    'auth:profile'
  );
}

export function clearAuthState() {
  setState(
    {
      currentUser: null,
      profile: null,
      isAdmin: false,
      voteBalance: 0,
      bonusVoteBalance: 0,
      ownedStoryIds: [],
      ownedStoryAccess: []
    },
    'auth:clear'
  );
}

export function setVoteBalances({ voteBalance = 0, bonusVoteBalance = 0 } = {}) {
  setState(
    {
      voteBalance: Number(voteBalance) || 0,
      bonusVoteBalance: Number(bonusVoteBalance) || 0
    },
    'votes:set'
  );
}

export function setOwnedStoryAccess(accessRows = []) {
  const safeRows = Array.isArray(accessRows) ? accessRows : [];

  setState(
    {
      ownedStoryAccess: safeRows,
      ownedStoryIds: toOwnedStoryIds(safeRows)
    },
    'stories:owned-access'
  );
}

export function setOwnedStoryIds(storyIds = []) {
  const normalizedIds = [...new Set((Array.isArray(storyIds) ? storyIds : []).map(String))];

  setState(
    {
      ownedStoryIds: normalizedIds
    },
    'stories:owned-ids'
  );
}

export function hasStoryAccess(storyId) {
  if (!storyId) return false;
  return state.ownedStoryIds.includes(String(storyId));
}

export function setStories(stories = []) {
  setState(
    {
      stories: Array.isArray(stories) ? stories : []
    },
    'stories:set'
  );
}

export function setProducts(products = []) {
  setState(
    {
      products: Array.isArray(products) ? products : []
    },
    'products:set'
  );
}

export function setSelectedStoryId(storyId) {
  setState(
    {
      selectedStoryId: storyId ? String(storyId) : null
    },
    'stories:selected'
  );
}

export function setVotingPeriod(period) {
  setState(
    {
      votingPeriod: period || null,
      votingStatus: deriveVotingStatus(period || null)
    },
    'voting:set-period'
  );
}

export function clearVotingPeriod() {
  setState(
    {
      votingPeriod: null,
      votingStatus: 'none'
    },
    'voting:clear'
  );
}

export function setLastOrder(order) {
  setState(
    {
      lastOrder: order || null
    },
    'orders:last'
  );
}

export function clearLastOrder() {
  setState(
    {
      lastOrder: null
    },
    'orders:clear-last'
  );
}

export function getCart() {
  return clone(state.cart);
}

export function setCart(cartItems = []) {
  const safeItems = Array.isArray(cartItems) ? cartItems : [];

  const normalized = safeItems.map((item) => ({
    ...item,
    quantity: normalizeQuantity(item.quantity),
    price_cents: normalizeCents(item.price_cents)
  }));

  setState(
    {
      cart: normalized
    },
    'cart:set'
  );
}

export function addToCart(item) {
  if (!item || typeof item !== 'object') {
    throw new Error('addToCart requires an item object');
  }

  const normalizedItem = {
    ...item,
    quantity: normalizeQuantity(item.quantity),
    price_cents: normalizeCents(item.price_cents)
  };

  const newKey = getCartItemKey(normalizedItem);
  const existingIndex = state.cart.findIndex((cartItem) => getCartItemKey(cartItem) === newKey);

  let nextCart;

  if (existingIndex >= 0) {
    nextCart = state.cart.map((cartItem, index) => {
      if (index !== existingIndex) return cartItem;

      return {
        ...cartItem,
        quantity: normalizeQuantity(cartItem.quantity + normalizedItem.quantity)
      };
    });
  } else {
    nextCart = [...state.cart, normalizedItem];
  }

  setState(
    {
      cart: nextCart
    },
    'cart:add'
  );
}

export function updateCartItemQuantity(itemKey, quantity) {
  const normalizedQuantity = normalizeQuantity(quantity);

  const nextCart = state.cart.map((item) => {
    if (getCartItemKey(item) !== itemKey) return item;
    return {
      ...item,
      quantity: normalizedQuantity
    };
  });

  setState(
    {
      cart: nextCart
    },
    'cart:update-quantity'
  );
}

export function removeFromCart(itemKey) {
  const nextCart = state.cart.filter((item) => getCartItemKey(item) !== itemKey);

  setState(
    {
      cart: nextCart
    },
    'cart:remove'
  );
}

export function clearCart() {
  setState(
    {
      cart: []
    },
    'cart:clear'
  );
}

export function getCartCount() {
  return state.cart.reduce((sum, item) => sum + normalizeQuantity(item.quantity), 0);
}

export function getCartSubtotalCents() {
  return state.cart.reduce((sum, item) => {
    const quantity = normalizeQuantity(item.quantity);
    const price = normalizeCents(item.price_cents);
    return sum + (quantity * price);
  }, 0);
}

export function getCartSubtotalFormatted() {
  return `$${(getCartSubtotalCents() / 100).toFixed(2)}`;
}

export function isLoggedIn() {
  return !!state.currentUser;
}

export function isAdminUser() {
  return !!state.isAdmin;
}

export function getOwnedStoryIds() {
  return [...state.ownedStoryIds];
}

export function getVotingStatus() {
  return state.votingStatus;
}

export function getCartItemIdentifier(item) {
  return getCartItemKey(item);
}