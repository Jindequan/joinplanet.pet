/* 手绘风宠物头像：与品牌插画（sage/奶油/陶土）同一套平面语言。
 * 同一只宠物按 id 哈希取固定配色，在任何页面渲染一致；
 * 它是明确的插画形象，不冒充用户上传的照片。 */
/* eslint-disable react-refresh/only-export-components -- 同文件导出配色助手，供英雄区背景复用 */
import "./pet-avatar.css";

type Fur = {
  fur: string;
  shade: string;
  patch: string;
  blob: string;
  ring: string;
};

const DOG_FURS: Fur[] = [
  { fur: "#E5AE77", shade: "#D19259", patch: "#F8ECD8", blob: "#F6E9D4", ring: "#EBCF9F" },
  { fur: "#CD9667", shade: "#B37B4C", patch: "#F1E2CB", blob: "#F3E4CE", ring: "#E0BE93" },
  { fur: "#EDE7DC", shade: "#CFC6B6", patch: "#FFFDF8", blob: "#F1EEE5", ring: "#DDD4C2" },
  { fur: "#A98A6F", shade: "#8F704F", patch: "#EBDFCC", blob: "#EEE5D6", ring: "#D8C3A5" },
];

const CAT_FURS: Fur[] = [
  { fur: "#EDB271", shade: "#D89952", patch: "#FBF0DD", blob: "#F8ECDA", ring: "#EFCB96" },
  { fur: "#B9BEC9", shade: "#9AA0AE", patch: "#F5F7FA", blob: "#EFF1F5", ring: "#CFD5DE" },
  { fur: "#C9A389", shade: "#AC8264", patch: "#F2E6D8", blob: "#F2E8DB", ring: "#DEC0A5" },
  { fur: "#90839B", shade: "#75677F", patch: "#EFEBF2", blob: "#EEEAF2", ring: "#CDC3D6" },
];

const OTHER_BLOBS = ["#EAF1E4", "#F7EADF", "#EDF0F4", "#F4EBE1"];

function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash;
}

function paletteFor(petId: string, species?: string): { kind: "dog" | "cat" | "paw"; index: number } {
  const normalized = (species ?? "").toLowerCase();
  const kind = normalized === "cat" ? "cat" : normalized === "dog" ? "dog" : "paw";
  const poolSize = kind === "paw" ? OTHER_BLOBS.length : kind === "cat" ? CAT_FURS.length : DOG_FURS.length;
  return { kind, index: hashId(petId) % poolSize };
}

/** 头像底色的柔和底色，用于工作区英雄区等大面积背景。 */
export function petAvatarBlob(petId: string, species?: string): string {
  const { kind, index } = paletteFor(petId, species);
  return kind === "dog"
    ? DOG_FURS[index].blob
    : kind === "cat"
      ? CAT_FURS[index].blob
      : OTHER_BLOBS[index];
}

export function PetAvatar({
  petId,
  species,
  size = 48,
  className = "",
  decorative = false,
}: {
  petId: string;
  species?: string;
  size?: number;
  className?: string;
  /** 纯装饰场景（如英雄区水印）不向读屏暴露。 */
  decorative?: boolean;
}) {
  const { kind, index } = paletteFor(petId, species);
  const blob =
    kind === "dog"
      ? DOG_FURS[index].blob
      : kind === "cat"
        ? CAT_FURS[index].blob
        : OTHER_BLOBS[index];
  return (
    <span
      className={`pet-mascot ${className}`}
      style={{ width: size, height: size, background: `radial-gradient(120% 120% at 30% 18%, #ffffffd9 0%, ${blob} 62%)` }}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "宠物头像"}
      aria-hidden={decorative || undefined}
    >
      <svg width={size * 0.78} height={size * 0.78} viewBox="0 0 48 48" aria-hidden>
        {kind === "dog" && <DogFace colors={DOG_FURS[index]} variant={index} />}
        {kind === "cat" && <CatFace colors={CAT_FURS[index]} />}
        {kind === "paw" && <PawMark />}
      </svg>
    </span>
  );
}

function DogFace({ colors, variant }: { colors: Fur; variant: number }) {
  return (
    <g>
      {/* 耳朵 */}
      <ellipse cx="11.5" cy="24" rx="4.6" ry="9" fill={colors.shade} transform="rotate(-16 11.5 24)" />
      <ellipse cx="36.5" cy="24" rx="4.6" ry="9" fill={colors.shade} transform="rotate(16 36.5 24)" />
      {/* 头 */}
      <rect x="10" y="12" width="28" height="27" rx="13.5" fill={colors.fur} />
      {/* 头顶色块 */}
      <path
        d={`M${variant % 2 === 0 ? "14" : "30"} 13.4 q6 -3.4 12 0 l-.8 5.6 q-5.2 -2.6 -10.4 0 Z`}
        fill={colors.patch}
        opacity=".85"
      />
      {/* 眼睛 */}
      <circle cx="18.4" cy="25.4" r="1.75" fill="#33302B" />
      <circle cx="29.6" cy="25.4" r="1.75" fill="#33302B" />
      <circle cx="19" cy="24.9" r=".55" fill="#fff" />
      <circle cx="30.2" cy="24.9" r=".55" fill="#fff" />
      {/* 口鼻 */}
      <ellipse cx="24" cy="32" rx="6.6" ry="5" fill={colors.patch} />
      <ellipse cx="24" cy="29.6" rx="2.5" ry="2" fill="#33302B" />
      <path d="M24 31.4 v2.2 M24 33.6 q-1.9 1.8 -3.6 .5 M24 33.6 q1.9 1.8 3.6 .5"
        fill="none" stroke="#33302B" strokeWidth="1.15" strokeLinecap="round" />
      {/* 腮红 */}
      <ellipse cx="14.6" cy="30.6" rx="2.3" ry="1.35" fill="#F0AE97" opacity=".85" />
      <ellipse cx="33.4" cy="30.6" rx="2.3" ry="1.35" fill="#F0AE97" opacity=".85" />
    </g>
  );
}

function CatFace({ colors }: { colors: Fur }) {
  return (
    <g>
      {/* 耳朵 */}
      <path d="M12.6 20.5 L10 9.8 L20.4 14.9 Z" fill={colors.fur} />
      <path d="M13.5 17.8 L12.1 12.6 L17.6 15.3 Z" fill={colors.patch} />
      <path d="M35.4 20.5 L38 9.8 L27.6 14.9 Z" fill={colors.fur} />
      <path d="M34.5 17.8 L35.9 12.6 L30.4 15.3 Z" fill={colors.patch} />
      {/* 头 */}
      <rect x="10.5" y="13.5" width="27" height="25" rx="12.5" fill={colors.fur} />
      {/* 额纹 */}
      <rect x="21.4" y="13.6" width="1.9" height="4.4" rx=".95" fill={colors.shade} opacity=".9" />
      <rect x="16.4" y="14.4" width="1.9" height="3.6" rx=".95" fill={colors.shade} opacity=".7" transform="rotate(-14 17.4 16)" />
      <rect x="29.7" y="14.4" width="1.9" height="3.6" rx=".95" fill={colors.shade} opacity=".7" transform="rotate(14 30.6 16)" />
      {/* 眼睛 */}
      <circle cx="18.4" cy="25.6" r="1.75" fill="#33302B" />
      <circle cx="29.6" cy="25.6" r="1.75" fill="#33302B" />
      <circle cx="19" cy="25.1" r=".55" fill="#fff" />
      <circle cx="30.2" cy="25.1" r=".55" fill="#fff" />
      {/* 鼻嘴 */}
      <path d="M22.5 29.6 h3 L24 31.6 Z" fill="#D98A73" />
      <path d="M24 31.6 v1.6 M24 33.2 q-1.7 1.6 -3.3 .4 M24 33.2 q1.7 1.6 3.3 .4"
        fill="none" stroke="#33302B" strokeWidth="1.05" strokeLinecap="round" />
      {/* 胡须 */}
      <g stroke={colors.shade} strokeWidth="1" strokeLinecap="round" opacity=".85">
        <path d="M12 27.5 h-4.2 M12.6 30 8.7 31.4" />
        <path d="M36 27.5 h4.2 M35.4 30 39.3 31.4" />
      </g>
      {/* 腮红 */}
      <ellipse cx="15" cy="30.4" rx="2.2" ry="1.3" fill="#F0AE97" opacity=".85" />
      <ellipse cx="33" cy="30.4" rx="2.2" ry="1.3" fill="#F0AE97" opacity=".85" />
    </g>
  );
}

function PawMark() {
  return (
    <g fill="#7FA184">
      <ellipse cx="24" cy="30.5" rx="8.2" ry="6.8" />
      <circle cx="14.6" cy="21.5" r="3.5" />
      <circle cx="21" cy="17.6" r="3.7" />
      <circle cx="28.4" cy="18" r="3.5" />
      <circle cx="34" cy="22.4" r="3.2" />
      <circle cx="36" cy="12" r="1.6" fill="#E7C978" />
    </g>
  );
}
