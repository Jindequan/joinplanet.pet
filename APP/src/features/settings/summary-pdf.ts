import type { ShareViewResponse } from '../../core/api/planet-api';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function displayValue(value: unknown, empty = '未记录'): string {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => {
        if (item && typeof item === 'object') {
          return Object.values(item as Record<string, unknown>).filter(Boolean).join(' · ');
        }
        return String(item ?? '').trim();
      })
      .filter(Boolean);
    return items.length ? items.map(escapeHtml).join('<br />') : empty;
  }
  if (value && typeof value === 'object') {
    const text = Object.values(value as Record<string, unknown>).filter(Boolean).join(' · ');
    return text ? escapeHtml(text) : empty;
  }
  const text = String(value ?? '').trim();
  return text ? escapeHtml(text) : empty;
}

function dateLabel(value: unknown): string {
  if (typeof value !== 'string') return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return escapeHtml(new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date));
}

function eventText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '已记录';
  const values = Object.values(payload as Record<string, unknown>)
    .filter((item) => typeof item === 'string' || typeof item === 'number')
    .map(String)
    .filter(Boolean);
  return values.length ? values.map(escapeHtml).join(' · ') : '已记录';
}

function safeImageSrc(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!/^data:image\/(?:png|jpeg|jpg|webp);base64,[a-z0-9+/=]+$/i.test(value) && !/^https:\/\//i.test(value)) {
    return null;
  }
  return value;
}

export function buildSummaryPdfHtml(view: ShareViewResponse): string {
  const data = view.data as Record<string, unknown>;
  const pet = data.pet && typeof data.pet === 'object' ? data.pet as Record<string, unknown> : {};
  const medications = Array.isArray(data.medications) ? data.medications : [];
  const events = Array.isArray(data.events) ? data.events : [];
  const name = escapeHtml(pet.name || '宠物');
  const species = [pet.species, pet.breed].filter(Boolean).map(escapeHtml).join(' · ');
  const medicationRows = medications.length
    ? medications.map((item, index) => {
      const med = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return `<div class="med-row" key="med-${index}"><strong>${displayValue(med.name, '药物')}</strong><span>${displayValue([med.dose, med.schedule].filter(Boolean), '')}</span></div>`;
    }).join('')
    : '<p class="muted">未记录当前用药</p>';
  const eventRows = events.length
    ? events.map((item, index) => {
      const event = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const payload = event.payload;
      const photo = payload && typeof payload === 'object'
        ? safeImageSrc((payload as Record<string, unknown>).photo_data)
        : null;
      return `<div class="event-row" key="event-${index}"><div class="event-head"><strong>${displayValue(event.type, '记录')}</strong><span>${dateLabel(event.occurred_at)}</span></div><p>${eventText(payload)}</p>${photo ? `<img src="${escapeHtml(photo)}" alt="记录照片" />` : ''}</div>`;
    }).join('')
    : '<p class="muted">选定时间范围内没有记录</p>';
  const weightRows = events
    .filter((item) => item && typeof item === 'object' && (item as Record<string, unknown>).type === 'weight')
    .map((item) => item as Record<string, unknown>)
    .filter((item) => item.payload && typeof item.payload === 'object' && typeof (item.payload as Record<string, unknown>).weight_g === 'number')
    .slice(0, 6)
    .map((item) => {
      const payload = item.payload as Record<string, unknown>;
      const grams = Number(payload.weight_g);
      return `<div class="med-row"><strong>${(grams / 1000).toFixed(2)} kg</strong><span>${dateLabel(item.occurred_at)}</span></div>`;
    }).join('');
  const vaccineRows = events
    .filter((item) => item && typeof item === 'object' && ['vaccine', 'deworm'].includes(String((item as Record<string, unknown>).type)))
    .map((item) => item as Record<string, unknown>)
    .slice(0, 6)
    .map((item) => `<div class="med-row"><strong>${displayValue((item.payload as Record<string, unknown> | undefined)?.name, '疫苗 / 驱虫')}</strong><span>${dateLabel(item.occurred_at)}</span></div>`)
    .join('');
  const visitRows = events
    .filter((item) => item && typeof item === 'object' && (item as Record<string, unknown>).type === 'vet_visit')
    .map((item) => item as Record<string, unknown>)
    .slice(0, 6)
    .map((item) => `<div class="med-row"><strong>${displayValue((item.payload as Record<string, unknown> | undefined)?.title, '就诊记录')}</strong><span>${dateLabel(item.occurred_at)}</span></div>`)
    .join('');

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${name} · PLANET 健康摘要</title>
<style>
  @page { size: A4; margin: 16mm; }
  :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans CJK SC", sans-serif; color: #27332d; background: #fffdf8; }
  * { box-sizing: border-box; }
  body { margin: 0; font-size: 11pt; line-height: 1.55; }
  header { border-bottom: 2px solid #dce7df; padding-bottom: 14px; margin-bottom: 18px; }
  .brand { color: #1c654e; font-size: 10pt; letter-spacing: .16em; font-weight: 800; }
  h1 { margin: 8px 0 2px; font-size: 25pt; line-height: 1.15; }
  .subtitle, .muted { color: #65726b; }
  .subtitle { margin: 0; }
  .alert { background: #fff1df; border-left: 4px solid #d8754d; padding: 10px 12px; margin: 16px 0; }
  .allergy-alert { background: #fff0df; border: 2px solid #d8754d; border-radius: 8px; padding: 11px 13px; margin: 16px 0; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 14px 0; }
  section { break-inside: avoid; margin: 16px 0; }
  h2 { color: #1c654e; font-size: 14pt; border-bottom: 1px solid #dce7df; padding-bottom: 5px; margin: 0 0 8px; }
  .field { background: #f4f7f2; border-radius: 7px; padding: 9px 11px; min-height: 46px; }
  .field label { display: block; color: #65726b; font-size: 9pt; margin-bottom: 3px; }
  .med-row, .event-head { display: flex; justify-content: space-between; gap: 12px; }
  .med-row { padding: 7px 0; border-bottom: 1px solid #edf1ed; }
  .med-row span { color: #65726b; text-align: right; }
  .event-row { border-top: 1px solid #edf1ed; padding: 8px 0; }
  .event-row:first-child { border-top: 0; }
  .event-head span { color: #65726b; font-size: 9pt; }
  .event-row p { margin: 3px 0 0; }
  .event-row img { max-width: 100%; max-height: 130px; margin-top: 6px; border-radius: 6px; }
  footer { border-top: 1px solid #dce7df; margin-top: 20px; padding-top: 10px; color: #65726b; font-size: 9pt; }
  @media screen { body { max-width: 760px; margin: 32px auto; padding: 0 24px; } }
</style></head><body>
<header><div class="brand">PLANET · VET-READY SUMMARY</div><h1>${name}</h1><p class="subtitle">${species || '宠物健康记录'} · 生成于 ${dateLabel(new Date().toISOString())}</p></header>
<div class="alert"><strong>本次就诊主诉 / Why now</strong><br />${displayValue(data.reason, '未填写；请在就诊前补充这次最想和兽医讨论的问题。')}</div>
<div class="allergy-alert"><strong>过敏（请先告知兽医）</strong><br />${displayValue(data.allergies, '未记录过敏信息')}</div>
<section><h2>基本信息</h2><div class="grid"><div class="field"><label>物种 / 品种</label>${species || '未记录'}</div><div class="field"><label>性别 / 绝育</label>${displayValue([pet.sex, pet.neutered ? '已绝育' : '未绝育'].filter(Boolean), '')}</div><div class="field"><label>生日</label>${dateLabel(pet.birth_date) || '未记录'}</div><div class="field"><label>体重</label>${typeof pet.weight_g === 'number' ? `${pet.weight_g} g` : '未记录'}</div></div></section>
<section><h2>体重趋势</h2>${weightRows || '<p class="muted">选定时间范围内没有体重记录</p>'}</section>
<section><h2>过敏与既往病史</h2><div class="grid"><div class="field"><label>过敏</label>${displayValue(data.allergies)}</div><div class="field"><label>慢性病 / 病史</label>${displayValue(data.conditions)}</div></div></section>
<section><h2>当前用药</h2>${medicationRows}</section>
<section><h2>疫苗与驱虫</h2><div class="grid"><div class="field"><label>疫苗 / 驱虫记录</label>${vaccineRows || '<span class="muted">未记录</span>'}</div><div class="field"><label>就诊记录</label>${visitRows || '<span class="muted">未记录</span>'}</div></div></section>
<section><h2>近期记录（近 ${escapeHtml(data.event_days || 90)} 天）</h2>${eventRows}</section>
${data.notes ? `<section><h2>家人备注</h2><p>${displayValue(data.notes)}</p></section>` : ''}
<footer>以上内容来自家庭成员在 PLANET 中记录的事实，仅供就诊沟通整理，不构成诊断或医疗建议。PDF 末尾：如需完整照护记录，请向分享人索取最新的 PLANET 链接。</footer>
</body></html>`;
}
