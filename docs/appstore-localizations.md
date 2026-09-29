# App Store 商店本地化文案（zh-Hans / ja / es-ES / pt-BR）

创建：2026-09-29。**英文（`en-US`）是主语言，事实源是 `docs/APPSTORE-METADATA.md` §二。**
本文件是它的四个新增 locale，只做本地化，不改英文；任何与英文冲突的表述都以英文版为准。

**本轮只交付文案，不写入 ASC。** 写入方式（ASC 表单或 App Store Connect API）与提审流程不在范围内。
写入后仍必须按 `docs/APPSTORE-METADATA.md` §五 的待办，用脚本复核 Keywords 长度——ASC 允许超长保存，
只在提交时标 `invalid` 并阻断提交。

---

## 0. 字数统计的证据

ASC 按**字符数**计，不按字节（中文字符按 1 个计）。本文件所有"实测"数字由下面这条命令产出，
它直接读取本文件正文里各字段的值再数一遍，因此文档里的数字可以被独立复核：

```bash
node -e '
const fs=require("fs");
const doc=fs.readFileSync("docs/appstore-localizations.md","utf8");
const rows=[...doc.matchAll(/^\|\s*(Name|Subtitle|Keywords|Promotional Text)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*`([^`]*)`\s*\|$/gm)];
for(const [,field,limit,claimed,value] of rows){
  const n=[...value].length, ok=String(n)===claimed && n<=Number(limit);
  console.log(`${field.padEnd(17)} claimed=${claimed.padStart(4)} counted=${String(n).padStart(4)} limit=${limit.padStart(4)} ${ok?"OK":"MISMATCH"}`);
}
const descs=[...doc.matchAll(/^描述（Description，上限 4000）— 实测 \*\*(\d+)\*\* 字符\n\n```\n([\s\S]*?)\n```$/gm)];
for(const [,claimed,value] of descs){
  const n=[...value].length;
  console.log(`Description       claimed=${claimed.padStart(4)} counted=${String(n).padStart(4)} limit=4000 ${String(n)===claimed?"OK":"MISMATCH"}`);
}
'
```

在本仓库根目录执行后的输出（2026-09-29）：

```
Name              claimed=  16 counted=  16 limit=  30 OK
Subtitle          claimed=  14 counted=  14 limit=  30 OK
Keywords          claimed=  65 counted=  65 limit= 100 OK
Promotional Text  claimed=  42 counted=  42 limit= 170 OK
Name              claimed=  19 counted=  19 limit=  30 OK
Subtitle          claimed=  15 counted=  15 limit=  30 OK
Keywords          claimed=  74 counted=  74 limit= 100 OK
Promotional Text  claimed=  50 counted=  50 limit= 170 OK
Name              claimed=  27 counted=  27 limit=  30 OK
Subtitle          claimed=  29 counted=  29 limit=  30 OK
Keywords          claimed=  96 counted=  96 limit= 100 OK
Promotional Text  claimed= 125 counted= 125 limit= 170 OK
Name              claimed=  23 counted=  23 limit=  30 OK
Subtitle          claimed=  24 counted=  24 limit=  30 OK
Keywords          claimed=  95 counted=  95 limit= 100 OK
Promotional Text  claimed= 134 counted= 134 limit= 170 OK
Description       claimed= 549 counted= 549 limit=4000 OK
Description       claimed= 690 counted= 690 limit=4000 OK
Description       claimed=1655 counted=1655 limit=4000 OK
Description       claimed=1626 counted=1626 limit=4000 OK
```

（`www.joinplanet.pet/` 内执行同样有效，把路径换成 `messages/../docs/...` 即可；上面按仓库根目录写。）

---

## 1. zh-Hans（简体中文）

| 字段 | 上限 | 实测 | 值 |
|---|---|---|---|
| Name | 30 | 16 | `PlanET：宠物照护提醒与共享` |
| Subtitle | 30 | 14 | `全家共享的宠物用药与驱虫提醒` |
| Keywords | 100 | 65 | `宠物提醒,养猫记录,养狗记录,宠物用药,驱虫,疫苗提醒,体重记录,家庭共享,喂药提醒,复诊,猫咪,狗狗,多宠家庭,铲屎官,宠物日记` |
| Promotional Text | 170 | 42 | `全家一份照护清单。用药、散步、复诊、体重都记在一起——不会漏掉，也不会有人重复喂药。` |

描述（Description，上限 4000）— 实测 **549** 字符

```
PlanET 把宠物的照护放在一个地方，也让所有帮忙的人看到同一份进度。

为什么家庭会用它
当不止一个人照顾同一只宠物，事情就容易漏。今天喂过了吗？那颗药是早上吃的还是昨晚？PlanET 用一份共享清单替换掉便签、家庭群和猜来猜去，清楚地显示哪些已经做完、哪些还没做。

你能得到什么
• 今天——每只宠物今天要做的事，都在同一份清单里。点一下就完成，也可以改时间，或者转交给别人。
• 共享照护——邀请一起帮忙的人。所有人看到同一份清单，有人完成就立刻更新。
• 用药——记录剂量、日程和结束日期。中止一个疗程不会抹掉历史。
• 记录——就诊、疫苗、驱虫、体重、症状、备注和照片。每只宠物都有真实的历史，可以按宠物或按家庭查找。
• 趋势——体重曲线和照护完成情况随时间的变化，让小的变化在变严重之前就浮现出来。
• 提醒——今天该做的事每天推送给负责的那个人。不必再靠记性。
• 分享——给临时照看人、朋友或兽医一条会自己过期的只读链接。

为真实的家庭而做
• 多只宠物，多位照护者
• 猫和狗都适用
• 五种语言：English、中文、日本語、Español、Português
• 数据始终属于你——随时导出某只宠物的完整记录

从一只宠物、一个日常流程开始。剩下的交给 PlanET。
```

**Keywords 选词依据**（无搜索量数据可用，与 `www.joinplanet.pet/docs/keyword-research-2026-09-29.md` 同一纪律：只报信号，不编量）

| 词 | 来源 | 依据 |
|---|---|---|
| 宠物提醒 | 语区特有说法 | 中文用户把品类名前置搜索（"宠物+功能"），英文的 pet reminder 直译在此语区恰好也是自然说法 |
| 养猫记录 / 养狗记录 | 语区特有说法 | 中文搜索习惯是"养X+记录"，英文只有 cat/dog + log 两个独立词，没有这个句式 |
| 宠物用药 / 喂药提醒 | 直译自英文词 medication | 英文关键词里的 medication；中文养宠圈的日常动词是"喂药"而非"用药"，两个都留 |
| 驱虫 | 直译自英文词 deworming | 英文关键词表未收 deworming，但它是产品能力（`pricing.free.li3`）且是中文养宠高频词 |
| 疫苗提醒 | 直译自英文词 vaccine | — |
| 体重记录 | 直译自英文词 weight / log | — |
| 家庭共享 | 直译自英文词 family / shared | 也是产品定位词（共享照护系统） |
| 复诊 | 直译自英文词 vet | 英文用 vet，中文就诊语境里"复诊"是用户实际会打的词 |
| 猫咪 / 狗狗 | 语区特有说法 | 中文口语动物词，比"猫""狗"更常见于搜索框 |
| 多宠家庭 | 语区特有说法 | 对应 `about.who.li1`"不止一位照护者的家庭"，英文关键词无对应词 |
| 铲屎官 | 语区特有说法 | 中文养宠人群自称，英文无对应；属于人群词，用于触达而非功能描述 |

未选的候选：`宠物日记`、`宠物健康`、`老年犬`、`猫奴` —— 字数预算（100）内优先级低于上表；
若要替换，优先替换信号最弱的 `铲屎官`（人群词，与功能无关）。

---

## 2. ja（日本語）

| 字段 | 上限 | 实测 | 值 |
|---|---|---|---|
| Name | 30 | 19 | `PlanET：家族で共有するペットケア` |
| Subtitle | 30 | 15 | `ペットのお薬・通院リマインダー` |
| Keywords | 100 | 74 | `ペット記録,犬 薬,猫 通院,ペット リマインダー,お薬管理,多頭飼い,ワクチン,フィラリア,体重管理,ペット 共有,犬 猫,ペットアプリ,シニア犬` |
| Promotional Text | 170 | 50 | `家族全員でひとつのケアリストを。お薬も散歩も通院も体重も、まとめて記録——漏れなく、二重投薬もなし。` |

描述（Description，上限 4000）— 实测 **690** 字符

```
PlanET は、ペットのケアをひとつの場所にまとめ、手伝ってくれる全員を同じ状況に揃えます。

家族が使う理由
ペットの世話をする人がひとりではないと、どうしても抜けが出ます。今日はもうあげた？ この錠剤は朝だったか昨夜だったか。PlanET は付箋とグループチャットと当て推量を、ひとつの共有リストに置き換えます。何が済んで、次に何が待っているかが一目で分かります。

できること
• 今日——すべてのペットについて今日やることを、ひとつのリストに。タップで完了、時刻の変更、ほかの人への引き継ぎもできます。
• 共有ケア——手伝ってくれる人を招待。全員が同じリストを見て、誰かが完了した瞬間に更新されます。
• お薬——用量、スケジュール、終了日を記録。途中で中止しても履歴は消えません。
• 記録——通院、ワクチン、駆虫、体重、症状、メモ、写真。ペットごとに本物の履歴が残り、ペット別でも家族別でも探せます。
• トレンド——体重の推移とケアの完了状況を時系列で。小さな変化が深刻になる前に気づけます。
• リマインダー——今日やることを、担当の人に毎日通知。記憶に頼る必要はありません。
• 共有——シッター、友人、獣医さんに、自動で期限が切れる閲覧専用リンクを渡せます。

本物の家庭のために
• 複数のペット、複数のケアメンバー
• 犬にも猫にも
• 5つの言語：English、中文、日本語、Español、Português
• データはあなたのもの——ペットの記録はいつでも書き出せます

まずは1匹と、ひとつの習慣から。あとは PlanET が引き受けます。
```

**Keywords 选词依据**

| 词 | 来源 | 依据 |
|---|---|---|
| ペット記録 | 直译自英文词 pet + log | 日语把"记录"直接接在名词后，是 App Store 日本区常见名词短语形式 |
| 犬 薬 / 猫 通院 | 语区特有说法 | 日本区搜索习惯是空格分隔的"主语+目的"，英文的 dog/cat 与 medication/vet 是被拆开打的两个词 |
| ペット リマインダー | 直译自英文词 pet + reminder | — |
| お薬管理 | 语区特有说法 | 日语养宠语境用「お薬管理」而非「投薬」（投薬偏医疗行为） |
| 多頭飼い | 语区特有说法 | "多只宠物家庭"是日语圈固定词，英文关键词里没有，但正是 `about.who` 的目标人群 |
| ワクチン | 直译自英文词 vaccine | — |
| フィラリア | 语区特有说法 | 日本养宠第一高频预防项目（心丝虫），产品能力覆盖预防记录（`pricing.free.li3`）；英文关键词无对应词 |
| 体重管理 | 直译自英文词 weight | — |
| ペット 共有 | 直译自英文词 pet + shared | — |
| 犬 猫 | 直译自英文词 dog + cat | — |
| ペットアプリ | 语区特有说法 | 日语把 app 写作片假名并后置（"ペットアプリ"），比英文的 pet app 更接近实际输入 |
| シニア犬 | 语区特有说法 | 对应 `about.who.li2`"老年宠物"，英文关键词无对应词 |

未选的候选：`猫 記録`、`ペット 健康管理`、`通院記録`、`お世話`。字数仍有余量（74/100），
若要扩词，`通院記録` 优先级最高（与 `猫 通院` 互补，覆盖犬猫两边）。

---

## 3. es-ES（Español）

| 字段 | 上限 | 实测 | 值 |
|---|---|---|---|
| Name | 30 | 27 | `PlanET: Cuidado de Mascotas` |
| Subtitle | 30 | 29 | `Recordatorios para tu mascota` |
| Keywords | 100 | 96 | `recordatorio,mascotas,cuidado,medicación,perro,gato,vacunas,peso,veterinario,cuidador,compartido` |
| Promotional Text | 170 | 125 | `Una lista compartida para toda la familia. Medicación, paseos, consultas y peso, todo junto — sin olvidos y sin dobles dosis.` |

描述（Description，上限 4000）— 实测 **1655** 字符

```
PlanET guarda el cuidado de tu mascota en un solo lugar y mantiene en la misma página a todos los que ayudan.

POR QUÉ LAS FAMILIAS LO USAN
Cuando más de una persona cuida de una mascota, se escapan cosas. ¿Ya le has dado de comer? ¿Esa pastilla fue esta mañana o anoche? PlanET sustituye las notas adhesivas, el chat de grupo y las suposiciones por una única lista compartida que muestra lo que está hecho y lo que viene después.

QUÉ INCLUYE
• Hoy — todo lo que toca hoy para cada mascota, en una sola lista. Toca para completarlo, cambia la hora o pásaselo a otra persona.
• Cuidado compartido — invita a quienes ayudan. Todos ven la misma lista, actualizada en el momento en que algo se completa.
• Medicación — controla dosis, pautas y fechas de fin. Detener un tratamiento no borra el historial.
• Registros — visitas al veterinario, vacunas, desparasitación, peso, síntomas, notas y fotos. Un historial real para cada mascota, buscable por mascota o por familia.
• Tendencias — curvas de peso y cumplimiento del cuidado en el tiempo, para que los cambios pequeños aparezcan antes de volverse graves.
• Recordatorios — avisos diarios de lo que toca, enviados a quien está a cargo. Se acabó depender de la memoria.
• Compartir — da a quien la cuida un día, a un amigo o a tu veterinario un enlace temporal de solo lectura que caduca solo.

HECHO PARA CASAS REALES
• Varias mascotas, varios cuidadores
• Sirve igual para gatos y perros
• Cinco idiomas: English, 中文, 日本語, Español, Português
• Tus datos siguen siendo tuyos — exporta el historial completo de una mascota cuando quieras

Empieza con una mascota y una rutina. Del resto se encarga PlanET.
```

**Keywords 选词依据**

西班牙语比英语长 20–40%，100 字符装不下短语，所以这里**只放单词**：
ASC 会把 Name、Subtitle、Keywords 三处的词合并匹配，所以"recordatorio + mascotas"这个短语由
Subtitle（`Recordatorios para tu mascota`）覆盖，Keywords 负责补充不同的词，避免同一词重复占用预算。

| 词 | 来源 | 依据 |
|---|---|---|
| mascotas | 直译自英文词 pets | 语区用词（英文关键词是 pet） |
| recordatorio | 直译自英文词 reminder | 单数形；复数由 ASC 词形匹配覆盖 |
| cuidado | 直译自英文词 care | 同时也是产品定位词，且已在 Name 里出现 |
| medicación | 直译自英文词 medication | — |
| perro / gato | 直译自英文词 dog / cat | 单数形，比较：西语用户常搜 "app para perros"，该短语由 perro 与 Name 的 Cuidado 组合覆盖 |
| vacunas | 直译自英文词 vaccine | — |
| peso | 直译自英文词 weight | — |
| veterinario | 直译自英文词 vet | 西语没有 vet 这样的缩写；`timeline.cat.vetVisit` 也是"Visita al veterinario" |
| cuidador | 语区特有说法 | 对应英文关键词 sitter；西语无 sitter 一词，`core.roleCaregiver` 用 Cuidador |
| compartido | 直译自英文词 shared | — |

被挤出的候选与原因：`desparasitación`（15 字符，单字成本最高，但产品能力已在描述里写清）、
`calendario`（与 `recordatorio` 语义重叠）、`app`（2 字符但极泛，且 ASC 会从类别推断）、
`canguro`（Spain 口语的宠物保姆，年龄偏窄）。**若要把 `desparasitación` 加回来，需要砍掉 `cuidado`
（已在 Name 中出现，最省）**。

---

## 4. pt-BR（Português）

| 字段 | 上限 | 实测 | 值 |
|---|---|---|---|
| Name | 30 | 23 | `PlanET: Cuidado de Pets` |
| Subtitle | 30 | 24 | `Lembretes para o seu pet` |
| Keywords | 100 | 95 | `lembrete,pets,medicação,cachorro,gato,vacina,peso,veterinário,petsitter,vermífugo,compartilhado` |
| Promotional Text | 170 | 134 | `Uma lista compartilhada para a família toda. Medicação, passeios, consultas e peso, tudo junto — sem esquecimentos e sem dose dobrada.` |

描述（Description，上限 4000）— 实测 **1626** 字符

```
O PlanET guarda o cuidado do seu pet num só lugar e mantém todo mundo que ajuda na mesma página.

POR QUE AS FAMÍLIAS USAM
Quando mais de uma pessoa cuida de um pet, coisas escapam. Você já deu comida para ele? Aquele comprimido foi hoje de manhã ou ontem à noite? O PlanET troca os post-its, a conversa de grupo e os palpites por uma única lista compartilhada que mostra o que já está feito e o que vem depois.

O QUE VOCÊ TEM
• Hoje — tudo o que vence hoje para cada pet, numa só lista. Toque para concluir, ajuste o horário ou repasse para outra pessoa.
• Cuidado compartilhado — convide quem ajuda. Todos veem a mesma lista, atualizada no instante em que algo é concluído.
• Medicação — acompanhe doses, agendas e datas de término. Interromper um tratamento não apaga o histórico.
• Registros — consultas, vacinas, vermifugação, peso, sintomas, notas e fotos. Um histórico de verdade para cada pet, pesquisável por pet ou por família.
• Tendências — curvas de peso e cumprimento do cuidado ao longo do tempo, para as mudanças pequenas aparecerem antes de ficarem graves.
• Lembretes — avisos diários do que está vencendo, enviados a quem está responsável. Chega de depender da memória.
• Compartilhamento — dê a quem cuida por um dia, a um amigo ou ao seu veterinário um link temporário somente leitura que expira sozinho.

FEITO PARA CASAS DE VERDADE
• Vários pets, vários cuidadores
• Serve tanto para gatos quanto para cães
• Cinco idiomas: English, 中文, 日本語, Español, Português
• Seus dados continuam seus — exporte o registro completo de um pet quando quiser

Comece com um pet e uma rotina. O resto o PlanET dá conta.
```

**Keywords 选词依据**

同 es：葡语字符更长，只放单词，短语由 Name/Subtitle 覆盖（`Lembretes para o seu pet` 已含
lembrete + pet，但两者仍保留在关键词里，因为 ASC 对单/复数与词形的匹配并不总是可靠）。

| 词 | 来源 | 依据 |
|---|---|---|
| lembrete / pets | 直译自英文词 reminder / pet | 巴西葡语的"pet"是通用词，`ui.navPets` 用的就是 Pets |
| medicação | 直译自英文词 medication | — |
| cachorro / gato | 直译自英文词 dog / cat | 巴西口语用 cachorro（不是 cão），与 `core.speciesDog` 的译法一致 |
| vacina | 直译自英文词 vaccine | — |
| peso | 直译自英文词 weight | — |
| veterinário | 直译自英文词 vet | — |
| petsitter | 语区特有说法 | 巴西葡语直接借用英文词 "pet sitter"（比 cuidador de pets 更常被搜） |
| vermífugo | 语区特有说法 | 英文关键词表未收 deworming；巴西养宠高频词，`timeline.field.dewormItem` 用的就是 Vermífugo |
| compartilhado | 直译自英文词 shared | — |

被挤出的候选：`cuidado`（已在 Name 里）、`carteira de vacinação`（19 字符，短语太贵，`vacina` 已覆盖）、
`remédio`（口语词，与 `medicação` 重叠）、`filhote`（幼犬，人群词，与产品能力无关）。

---

## 5. 事实核对表（四语 × 六条事实）

规则来自 `docs/APPSTORE-METADATA.md` 的英文版：**不许新增英文版没有的承诺**，不许写 "best"、
不许写用户数、不许写 "AI"。下表逐条核对。

| 事实 | 英文商店文案里的位置 | 四语版的位置 | 一致性 |
|---|---|---|---|
| 免费核心（free，无内购/无订阅/无付费墙） | **英文 Description 未提**；事实在 `/pricing` 与 `docs/commerce/LEMON-SQUEEZY.md` | **四语 Description 也未提** | ✅ 刻意等义：英文商店文案不提，翻译就不能提——否则四语版会比英文版多一个承诺。若要在商店页加"free"，先改英文版 |
| 创始会员：一次性预购，且**不解锁任何产品内权益** | **英文 Description 未提**；事实在 `/pricing` §"它不解锁任何东西"与 `LEMON-SQUEEZY.md` | **四语 Description 也未提** | ✅ 同上。"不解锁任何权益"这句话在商店页没有上下文可解释，写上去容易被读成"买了会解锁"，英文版选择不提是正确的，翻译沿用 |
| 五语（en / zh / ja / es / pt） | Description 末段 `Five languages: English, 中文, 日本語, Español, Português` | 四语 Description 同一位置，语言名按 `about.who.p` / `pricing.free.li6` 的既有写法 | ✅ 逐字对应 |
| iOS | 由商店页本身承载（listing 即 iOS），Description 未单独声明 | 同英文，未单独声明 | ✅ 未新增平台承诺。Android 无商店版本这一事实只在官网 `/faq` `faq.platform.a1` 说明，商店页不涉及 |
| 可导出（export a pet's full record at any time） | Description `BUILT FOR REAL HOUSEHOLDS` 第 4 条 | 四语同一位置 | ✅ 逐字对应，且与 `pets.exportRow`（导出数据 / データを書き出す / Exportar datos / Exportar dados）术语一致 |
| 不是医疗器械（not a medical device） | **英文 Description 未提**；该表述在 `/terms` 与 `/pricing`（"does not diagnose, and does not replace a veterinarian"） | **四语 Description 也未提** | ✅ 同上。四语描述里也没有任何**反向**暗示：没有"诊断""治疗方案""替代兽医"这类措辞，用词一律是"記録 / 记录 / Registros / histórico" |

**关于"不是医疗器械"这一条的处理说明**：这条事实的正确落地方式不是加一句免责声明到商店描述
（英文版没有，加了就是新增），而是**确保四语描述里不出现任何医疗判断类措辞**。逐语检查结果：

- zh：只出现"记录、症状、趋势、提醒、转交"，无"诊断/治疗"。
- ja：只出现「記録・症状・トレンド・リマインダー・引き継ぎ」，无「診断・治療」。
- es：只出现 "Registros / síntomas / tendencias / recordatorios / Compartir"，无 "diagnóstico / tratamiento"。注意保留的 "veterinario" 只作名词（联系对象），不作动词。
- pt：同 es，无 "diagnóstico / tratamento"。

---

## 6. 写入 ASC 之后仍要做的事

1. **复核 Keywords 长度**（`docs/APPSTORE-METADATA.md` §五 待办）：ASC 允许超长保存，只在提交时标
   `invalid`。写入后用 §0 的命令再数一遍，或直接读 ASC 返回值里的长度。
2. **每个 locale 都要填隐私政策 URL**：`https://www.joinplanet.pet/privacy`。只填主语言会在提交时被拦。
3. **截图不随文案本地化**：`APP/store-screenshots/` 现有 6 张是英文；若四个 locale 也要本地化截图，
   那是**独立工作**（需在 `APP/store-screenshots/README.md` 的管线上加一层文案注入），本文件不覆盖。
   ASC 允许某 locale 的截图沿用主语言图，但商店页会出现"中文文案 + 英文截图"的拼贴——这是产品决策，
   不是文案问题，需 founder 明确。
4. **What's New（1.0.0）**：英文是 `First release.`，四语版未写。1.0.0 的 whatsNew 在提审时与版本号
   对齐，本轮不产出——`docs/APPSTORE-METADATA.md` §五 已把它列为待办。

---

## 7. 存疑与不确定处（如实列出）

1. **Name 的冒号形式不统一**：zh/ja 用全角 `：`（`PlanET：…`），es/pt 用半角 `:`（`PlanET: …`）。
   这是各语区的排版惯例（en-US 用半角），但 ASC 列表里四种写法会并排出现，视觉上不整齐。
   若要统一，建议统一成半角 `:`，代价是中文/日文标题里冒号两侧间距偏紧。
2. **es-ES 的 Subtitle 只差 1 字符到上限**（29/30）。ASC 不会因 29 报错，但任何微调都会越界；
   若要把 Subtitle 改成 `Recordatorios para mascotas`（28）会**少一个"你的"**，语气更冷。
   当前写法保留 `tu`，与描述里的 tuteo 一致。
3. **pt `petsitter` 是一个借词**，且 ASC 可能把它与 `pet sitter`（带空格）当不同词。真实巴西用户
   两种写法都打；关键词里放不带空格的版本是为了省 1 个字符。**这是可被替换的低价值词**。
4. **`フィラリア`（心丝虫）与 `vermífugo`（驱虫药）都是"品类词"而非直译词**。它们指向产品确实有的
   能力（预防记录，`pricing.free.li3`），但不是英文关键词的一部分。若 founder 要求"英文关键词表是唯一
   词源"，这两个词应当删除。
5. **没有搜索量数据。** 与 `www.joinplanet.pet/docs/keyword-research-2026-09-29.md` §0 同一限制：
   没有可用 API，本文件里没有任何一个数字是搜索量，全部是"选词依据"的定性说明。
   上架后必须用 ASC 的 Search Ads / GSC 之类真实数据验证，再调整。
6. **未做母语者终审。** 四份文案是按 `messages/README.md` §2 的术语表写的，术语与 App 字典对齐，
   但既非母语者撰写，也未请母语者读过。上架前建议至少请一位 ja、一位 pt-BR 母语者通读
   Description 与 Promotional Text（Keywords 可以只看选词逻辑）。
7. **zh 的 Description 用了"它"称呼宠物**，而 App 用 **Ta**（`pets.confirmDeceasedConsequence`）。
   商店描述比 App 内文案更正式，这里选了"它"；若 founder 要求 App 内外一致，需把四语
   `messages/*.json` 与本文档一起改。这一点在 `messages/README.md` §6 也列为待确认项。
