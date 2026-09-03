const ACCOUNTS_KEY = "magicAccounts";
const CURRENT_ACCOUNT_ID_KEY = "magicCurrentAccountId";

const getStoredAccounts = () => JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "{}");

const saveStoredAccounts = (accounts) => {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
};

const normalizeEmail = (email) => email.trim().toLowerCase();

const getPublicAccount = (account) =>
  account
    ? {
        id: account.id,
        email: account.email,
        name: account.name,
      }
    : null;

const getPasswordHash = async (password, salt) => {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure login is unavailable in this browser.");
  }

  const encodedPassword = new TextEncoder().encode(`${salt}:${password}`);
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", encodedPassword);

  return [...new Uint8Array(hashBuffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const createSalt = () => {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Secure signup is unavailable in this browser.");
  }

  const bytes = new Uint8Array(16);

  globalThis.crypto.getRandomValues(bytes);

  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const createAccountId = () => globalThis.crypto?.randomUUID?.() || `account-${Date.now()}`;

export const loadCurrentAccount = () => {
  const currentAccountId = localStorage.getItem(CURRENT_ACCOUNT_ID_KEY);

  if (!currentAccountId) {
    return null;
  }

  const account = Object.values(getStoredAccounts()).find((candidate) => candidate.id === currentAccountId);

  return getPublicAccount(account);
};

export const signUp = async ({ name, email, password }) => {
  const normalizedEmail = normalizeEmail(email);
  const accounts = getStoredAccounts();

  if (!name.trim() || !normalizedEmail || password.length < 6) {
    throw new Error("Enter a name, email, and 6+ character password.");
  }

  if (accounts[normalizedEmail]) {
    throw new Error("This email already has an account.");
  }

  const salt = createSalt();
  const account = {
    id: createAccountId(),
    name: name.trim(),
    email: normalizedEmail,
    passwordSalt: salt,
    passwordHash: await getPasswordHash(password, salt),
    createdAt: new Date().toISOString(),
  };

  accounts[normalizedEmail] = account;
  saveStoredAccounts(accounts);
  localStorage.setItem(CURRENT_ACCOUNT_ID_KEY, account.id);

  return getPublicAccount(account);
};

export const logIn = async ({ email, password }) => {
  const normalizedEmail = normalizeEmail(email);
  const account = getStoredAccounts()[normalizedEmail];

  if (!normalizedEmail || !password || !account) {
    throw new Error("Invalid email or password.");
  }

  const passwordMatches = account.passwordHash === (await getPasswordHash(password, account.passwordSalt));

  if (!passwordMatches) {
    throw new Error("Invalid email or password.");
  }

  localStorage.setItem(CURRENT_ACCOUNT_ID_KEY, account.id);

  return getPublicAccount(account);
};

export const logOut = () => {
  localStorage.removeItem(CURRENT_ACCOUNT_ID_KEY);
};
