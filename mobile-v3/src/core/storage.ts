// 安全存储：隐私模式 / Cookie 全禁 / JSON 损坏时降级为内存，绝不抛错。
const memory = new Map<string, string>();

function local(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  try {
    const store = window.localStorage;
    store.getItem("__planet_probe__");
    return store;
  } catch {
    return {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, value),
      removeItem: (key: string) => void memory.delete(key),
    };
  }
}

function session(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  try {
    const store = window.sessionStorage;
    store.getItem("__planet_probe__");
    return store;
  } catch {
    return {
      getItem: (key: string) => memory.get(`s:${key}`) ?? null,
      setItem: (key: string, value: string) => void memory.set(`s:${key}`, value),
      removeItem: (key: string) => void memory.delete(`s:${key}`),
    };
  }
}

export const safeStorage = {
  get: (key: string) => {
    try {
      return local().getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string) => {
    try {
      local().setItem(key, value);
    } catch {
      /* 忽略写入失败（配额等） */
    }
  },
  remove: (key: string) => {
    try {
      local().removeItem(key);
    } catch {
      /* 忽略 */
    }
  },
  getSession: (key: string) => {
    try {
      return session().getItem(key);
    } catch {
      return null;
    }
  },
  setSession: (key: string, value: string) => {
    try {
      session().setItem(key, value);
    } catch {
      /* 忽略 */
    }
  },
  removeSession: (key: string) => {
    try {
      session().removeItem(key);
    } catch {
      /* 忽略 */
    }
  },
  /** 读取并解析 JSON；损坏时清除并返回 null。 */
  getJSON: <T,>(key: string): T | null => {
    const raw = safeStorage.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      safeStorage.remove(key);
      return null;
    }
  },
  keysWithPrefix: (prefix: string): string[] => {
    try {
      return Object.keys(window.localStorage).filter((key) =>
        key.startsWith(prefix),
      );
    } catch {
      return [...memory.keys()].filter((key) => key.startsWith(prefix));
    }
  },
};
