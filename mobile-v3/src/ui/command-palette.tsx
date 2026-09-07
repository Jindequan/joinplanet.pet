// ⌘K / Ctrl+K 命令面板 —— 桌面专属(精确指针+悬停,或 ≥961px 视口)。
// 弹层一律 createPortal 到 body:祖先 backdrop-filter 会劫持 fixed 定位。
// 风格对标 Linear:克制、无花哨动效、150–250ms 过渡。
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, Home, PawPrint, PenLine, Search, Settings, TrendingUp, Users } from "lucide-react";
import { useSession } from "../core/auth/session-context";
import { useFamilies, usePets } from "../app/shared";
import { useT } from "../core/i18n";
import { PetAvatar } from "./pet-avatar";

/** 「记一笔」意图经 sessionStorage 传递;timeline 页读到后自动展开 composer 并清除。 */
export const COMPOSER_INTENT_KEY = "planet.open-composer";

/** 仅在桌面能力下生效:精确指针 + 悬停,或 ≥961px;移动端(粗指针窄屏)绝不触发。
 *  只在键盘事件发生时求值(渲染/挂载期不碰 matchMedia,jsdom 测试安全)。 */
function paletteCapable(): boolean {
  if (typeof window.matchMedia !== "function") return false;
  return (
    window.matchMedia("(pointer: fine) and (hover: hover)").matches ||
    window.matchMedia("(min-width: 961px)").matches
  );
}

type Command = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
};

export function CommandPalette() {
  const t = useT();
  const navigate = useNavigate();
  const { token } = useSession();
  const pets = usePets(Boolean(token));
  const families = useFamilies(Boolean(token));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (!paletteCapable()) return;
        event.preventDefault();
        // 打开即重置过滤与选择(关闭时重置无副作用)
        setQuery("");
        setActive(0);
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 每次打开:聚焦输入框(DOM 副作用)
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => navigate(path);
    const compose: Command = {
      id: "compose",
      group: t("记录", "Record"),
      label: t("记一笔", "Add a record"),
      hint: t("时间线", "Timeline"),
      icon: <PenLine size={17} />,
      run: () => {
        try {
          sessionStorage.setItem(COMPOSER_INTENT_KEY, "1");
        } catch {
          // storage 不可用(隐私模式):意图丢弃,仅跳转
        }
        navigate("/timeline");
      },
    };
    const jumps: Command[] = (
      [
        { path: "/today", label: t("今天", "Today"), icon: <Home size={17} /> },
        { path: "/timeline", label: t("时间线", "Timeline"), icon: <CalendarDays size={17} /> },
        { path: "/trends", label: t("趋势", "Trends"), icon: <TrendingUp size={17} /> },
        { path: "/pets", label: t("宠物管理", "Manage Pets"), icon: <PawPrint size={17} /> },
        { path: "/families", label: t("家庭", "Families"), icon: <Users size={17} /> },
        { path: "/settings", label: t("设置", "Settings"), icon: <Settings size={17} /> },
      ] as const
    ).map((item) => ({
      id: `go${item.path.replace(/\//g, "-")}`,
      group: t("跳转", "Go to"),
      label: item.label,
      icon: item.icon,
      run: go(item.path),
    }));
    const petCommands: Command[] = (pets.data?.pets ?? []).map((pet) => ({
      id: `pet-${pet.id}`,
      group: t("宠物", "Pets"),
      label: pet.name,
      hint: pet.archived_at ? t("纪念", "Memorial") : undefined,
      icon: <PetAvatar petId={pet.id} species={pet.species} size={22} decorative />,
      run: go(`/pets/${pet.id}`),
    }));
    const familyCommands: Command[] = (families.data?.families ?? []).map((family) => ({
      id: `family-${family.id}`,
      group: t("家庭", "Families"),
      label: family.name,
      icon: <Home size={17} />,
      run: go(`/families/${family.id}`),
    }));
    return [compose, ...jumps, ...petCommands, ...familyCommands];
  }, [families.data?.families, navigate, pets.data?.pets, t]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return commands;
    return commands.filter(
      (command) =>
        command.label.toLowerCase().includes(keyword) ||
        command.group.toLowerCase().includes(keyword),
    );
  }, [commands, query]);

  const activeIndex = Math.min(active, filtered.length - 1);
  const activeCommand = filtered[activeIndex];

  // 键盘选择滚动跟随:激活项始终可见
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function close() {
    setOpen(false);
  }

  function runCommand(command: Command) {
    close();
    command.run();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const count = filtered.length;
      if (!count) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + delta + count) % count);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeCommand) runCommand(activeCommand);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  if (!open) return null;
  return createPortal(
    <div
      className="cmdk-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <section
        className="cmdk-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t("命令面板", "Command Palette")}
      >
        <div className="cmdk-input-row">
          <Search size={17} aria-hidden />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-autocomplete="list"
            aria-activedescendant={activeCommand ? `cmdk-option-${activeCommand.id}` : undefined}
            aria-label={t("搜索命令", "Search commands")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={t("搜索命令、宠物或家庭…", "Search commands, pets, or families…")}
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="cmdk-kbd">Esc</kbd>
        </div>
        <div className="cmdk-list" id="cmdk-list" role="listbox" ref={listRef}>
          {filtered.length === 0 ? (
            <p className="cmdk-empty">{t("没有匹配的结果", "No matching results")}</p>
          ) : (
            filtered.map((command, index) => (
              <Fragment key={command.id}>
                {(index === 0 || filtered[index - 1].group !== command.group) && (
                  <div className="cmdk-group-label" role="presentation">
                    {command.group}
                  </div>
                )}
                <button
                  type="button"
                  id={`cmdk-option-${command.id}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  data-index={index}
                  className={`cmdk-option ${index === activeIndex ? "active" : ""}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => runCommand(command)}
                  tabIndex={-1}
                >
                  <span className="cmdk-option-icon" aria-hidden>{command.icon}</span>
                  <span className="cmdk-option-label">{command.label}</span>
                  {command.hint && (
                    <span className="cmdk-option-hint">{command.hint}</span>
                  )}
                </button>
              </Fragment>
            ))
          )}
        </div>
        <footer className="cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd>{t("选择", "Select")}</span>
          <span><kbd>↵</kbd>{t("执行", "Run")}</span>
          <span><kbd>Esc</kbd>{t("关闭", "Close")}</span>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

/** timeline 页消费「记一笔」意图:挂载或路由进入时读取并清除,随即展开 composer。
 *  依赖 location.key:同一路由内的重复 PUSH 也能触发。
 *  参数直接收 setState(如 setComposerOpen),引用稳定,不引发 effect 重跑。 */
export function useComposerIntent(onIntent: (open: boolean) => void) {
  const location = useLocation();
  useEffect(() => {
    const consume = (): boolean => {
      try {
        if (sessionStorage.getItem(COMPOSER_INTENT_KEY) !== "1") return false;
        sessionStorage.removeItem(COMPOSER_INTENT_KEY);
        return true;
      } catch {
        return false;
      }
    };
    if (consume()) onIntent(true);
  }, [location.key, onIntent]);
}
