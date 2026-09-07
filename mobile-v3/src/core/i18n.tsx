// 界面语言:中文默认,English 可切换。零依赖,两个 API:
//   useT() — 组件内用(订阅语言切换,切换即重渲染):const t = useT(); t("今天", "Today")
//   tt()   — 非组件模块用(core/display.ts 等,读模块镜像,随 Provider 更新)
// 约定:t(中文, English) 第一个参数永远是现有中文原文,保证 zh 模式零回归。
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "zh" | "en";

const STORAGE_KEY = "planet_lang";

// 模块级镜像:让 display.ts 这类非组件助手在渲染期间拿到当前语言。
let currentLang: Lang = "zh";

export function getLang(): Lang {
  return currentLang;
}

function detectInitialLang(): Lang {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "zh") return stored;
  } catch {
    // storage 不可用时走浏览器语言探测。
  }
  const nav =
    typeof navigator !== "undefined" ? (navigator.language ?? "zh-CN") : "zh-CN";
  return nav.toLowerCase().startsWith("en") ? "en" : "zh";
}

type LangContextValue = { lang: Lang; setLang: (next: Lang) => void };

const LangContext = createContext<LangContextValue>({
  lang: "zh",
  setLang: () => {},
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectInitialLang());
  // 渲染期间同步镜像(赋值幂等),保证 tt() 与 useT() 同帧一致。
  currentLang = lang;
  useEffect(() => {
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  }, [lang]);
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 隐私模式等场景下仅本次会话生效。
    }
  }, []);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
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
