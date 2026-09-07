// 界面语言:中文默认,English 可切换。零依赖,两个 API:
//   useT() — 组件内用(订阅语言切换,切换即重渲染):const t = useT(); t("今天", "Today")
//   tt()   — 非组件模块用(core/display.ts 等,读模块镜像,随 store 更新)
// 约定:t(中文, English) 第一个参数永远是现有中文原文,保证 zh 模式零回归。
// 实现为外部 store + useSyncExternalStore:渲染期不写模块变量(合规 lint),
// 且天然支持多标签页同步(storage 事件)。
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type Lang = "zh" | "en";

const STORAGE_KEY = "planet_lang";

function readStoredLang(): Lang {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "zh") return stored;
  } catch {
    // storage 不可用。
  }
  return "zh";
}

function detectBrowserLang(): Lang {
  const nav = typeof navigator !== "undefined" ? navigator.language : undefined;
  return nav && nav.toLowerCase().startsWith("en") ? "en" : "zh";
}

// 模块级镜像:让 display.ts 这类非组件助手在渲染期间拿到当前语言。
// 模块加载只认显式存储值（默认 zh，与应用挂载前的行为一致）；
// 浏览器语言探测在 Provider 首次挂载时做，避免测试/SSR 环境被
// navigator 拖走。
let currentLang: Lang = readStoredLang();

const listeners = new Set<() => void>();
function emitLangChange() {
  listeners.forEach((listener) => listener());
}
function subscribeLang(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function persistLang(next: Lang) {
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // 隐私模式等场景下仅本次会话生效。
  }
}

export function getLang(): Lang {
  return currentLang;
}

type LangContextValue = { lang: Lang; setLang: (next: Lang) => void };

const LangContext = createContext<LangContextValue>({
  lang: "zh",
  setLang: () => {},
});

export function LangProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribeLang, getLang);
  useEffect(() => {
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  }, [lang]);
  // 首次挂载做一次浏览器语言探测（仅在用户从未显式选择过语言时；
  // 探测结果不落盘，保持"显式选择优先"）。
  useEffect(() => {
    let stored: string | null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = "zh";
    }
    if (stored) return;
    const detected = detectBrowserLang();
    if (detected !== currentLang) {
      currentLang = detected;
      emitLangChange();
    }
  }, []);
  // 跨标签页同步:别的标签切换语言时跟随。
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && (event.newValue === "en" || event.newValue === "zh") && event.newValue !== currentLang) {
        currentLang = event.newValue;
        emitLangChange();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const setLang = useCallback((next: Lang) => {
    if (next === currentLang) return;
    currentLang = next;
    persistLang(next);
    emitLangChange();
  }, []);
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  return useContext(LangContext);
}

/** 组件内使用:订阅语言上下文,切换语言时触发重渲染。 */
export function useT(): (zh: string, en: string) => string {
  const { lang } = useContext(LangContext);
  return useCallback((zh: string, en: string) => (lang === "en" ? en : zh), [lang]);
}

/** 非组件模块使用:读取模块镜像。组件已通过 useT() 订阅上下文,重渲染时自然刷新。 */
export function tt(zh: string, en: string): string {
  return currentLang === "en" ? en : zh;
}
