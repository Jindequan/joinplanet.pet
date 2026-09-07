# Reddit 主动出击清单(Outbound Targets)

> 2026-09-04 首次生成。原则:**不打扰支持性社区的安全讨论;先给真帮助,再一句披露,最后才提免费试点。**
> 每天由自动化简报刷新(找新帖+验新鲜度+起草回复)。发帖前必查:帖子日期(>1 个月的老帖不回)、版规、评论里是否已有人推同类产品。

---

## Tier 1 — 立即回复(新鲜 + 痛点正中)

### 1. r/EpilepsyDogs · "What to do if you can't remember if a dose was given?"(几天内,活帖)
https://www.reddit.com/r/EpilepsyDogs/comments/1w4uund/what_to_do_if_you_cant_remember_if_a_dose_was/

**这是全网最典型的"我们为什么存在"帖子**:癫痫药必须严格按时,主人记不清上一剂有没有喂。r/EpilepsyDogs 是支持型社区,**回复必须以安全信息开头**,产品只能放最后一句。

**回复草稿:**
> First — the standard advice for Keppra/pheno is: don't double up on your own. Call your vet or the emergency line and let them make the call; they deal with this constantly and would rather hear from you than not.
>
> For what it's worth, this exact fear — "did I already give it?" at 11pm — is why I started building a med tracker for pets. It logs each dose as it's actually given, so anyone in the family can see what happened instead of guessing from memory. I'm a solo dev (my own senior dog is on daily meds) and it's free for early families while I shape it. If it'd help, you can find it at joinplanet.pet — but either way, please let your vet be the one to answer the missed-dose question.

### 2. r/dogs · "How do I merge/compile my dog's vet records after moving"(约 2-3 周)
https://www.reddit.com/r/dogs/comments/1vzfoy6/how_do_i_mergecompile_my_dogs_vet_records_after/

r/dogs 版规严格。策略:**纯帮助式回复 + 一句披露,链接放 profile**。如果担心违规,就只发帮助部分,然后手动 DM 版主报备。

**回复草稿:**
> Been through this after a cross-country move. What worked: call each old clinic and ask for a records release form (they're obligated in most states, but it can take 1-2 weeks), and separately ask your new vet's front desk — many will request records for you if you give them the old clinic's info, which takes the chasing off your plate.
>
> One thing I'd do differently: keep your own copy of everything going forward. I keep a running log for my dog (vaccines, meds, weights) in an app I'm building for exactly this — after realizing how much history lived only in my old vet's system. Solo dev, free for early users: joinplanet.pet if you want it.

### 3. r/DogAdvice · "App for keeping track of dog meds?"(约 4 个月,先查是否还开放)
https://www.reddit.com/r/DogAdvice/comments/1s1suu0/app_for_keeping_track_of_dog_meds/

**最高意向帖**:OP 明确在找 app,且自己提出"不确定 Medisafe/MyTherapy 是不是支持多人协作"——这正是人用药 App 的缺口,我们的核心卖点。**发之前确认帖子没被锁。**

**回复草稿(如果还开放):**
> Late to this but: Medisafe/MyTherapy work fine for one person, and you're right to be unsure about the collaborative part — they're built for humans managing their own pills, not two people managing one dog.
>
> That gap is why I built one: shared care view, everyone sees what's been given and what's due, meds + deworming + vet dates in one place. Solo dev, free for the first families using it while I finish shaping it — joinplanet.pet. Would genuinely value your feedback if you try it with your crew.

---

## Tier 2 — 只读学习(不能回帖,抄语言)

- r/AskVet 全部(需兽医 flair):[双倍剂量抗生素](https://www.reddit.com/r/AskVet/comments/1da9ebt/i_am_stupid_and_didnt_read_prescription_properly/)、[漏 6 个月心丝虫](https://www.reddit.com/r/AskVet/comments/1qb7zc3/missed_doses_of_heartgard_and_fleatick/)——抄"后怕式"表达
- r/EpilepsyDogs [Missed a Dose of Keppra](https://www.reddit.com/r/EpilepsyDogs/comments/1ecbsg3/missed_a_dose_of_keppra/)、[I can't believe I did this](https://www.reddit.com/r/EpilepsyDogs/comments/1dsnwsh/i_cant_believe_i_did_this/)——癫痫家庭是刚需人群,适合之后 FB 群打法
- r/CatAdvice [换兽医重开记录](https://www.reddit.com/r/CatAdvice/comments/1se0c7x/can_i_switch_to_a_new_vet_and_start_fresh_for_my/)——记录迁移痛点的猫版

## 竞争情报(顺手挖到的)

- r/DogAdvice 帖里被推荐的是 **Medisafe/MyTherapy(人用药 App)**——证明"宠物专用的多人协作"确实没人满足
- 同类独立开发者先例:PetBuddy、PetDose 都在 r/Pets 发过"我忘了喂药所以自己做了个 app"帖——这个叙事被验证过有效,但别照抄时间点太近

---

## 每日刷新机制

自动化简报(每天 10:00)做四件事:①用以下查询挖最近 14 天新帖;②验证新鲜度和版规;③起草回复放进本文件;④顺带检查月帖评论/收件箱/Chat 的新回复。

搜索查询集:`"double dose" dog medication`(t=month) / `"forgot to give" medication`(t=month) / `"can't remember" dose dog`(t=month) / `"is there an app" pet medication`(t=month) / `"vet records" merge OR transfer`(t=month) / `"how do you keep track of" pet`(t=month)
