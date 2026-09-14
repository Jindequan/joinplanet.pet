import { expect, test, type Page, type Route } from '@playwright/test'

const user = {
  id: 'e2e-user',
  email: 'e2e@example.com',
  display_name: 'E2E 用户',
  locale: 'zh-CN',
  created_at: '2026-09-01T00:00:00Z',
}
const family = {
  id: 'e2e-family',
  name: 'E2E 家庭',
  timezone: 'Asia/Shanghai',
  role: 'owner',
  member_count: 2,
  pet_count: 1,
  created_at: '2026-09-01T00:00:00Z',
}
const pet = {
  id: 'e2e-pet',
  family_ids: [family.id],
  family_roles: { [family.id]: 'owner' },
  name: 'E2E 小狗',
  species: 'dog',
  breed: '混血',
  sex: '',
  neutered: false,
  version: 1,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  current_owner_user_id: user.id,
  access_role: 'owner',
}

const e2eToday = new Intl.DateTimeFormat('sv-SE', {
  timeZone: family.timezone,
}).format(new Date())

function todayResponse(completed: boolean) {
  return {
    date: e2eToday,
    pets: [
      {
        pet_id: pet.id,
        pet_name: pet.name,
        items: [
          {
            task: {
              id: 'e2e-task',
              pet_id: pet.id,
              family_id: family.id,
              care_plan_id: 'e2e-plan',
              care_rule_id: 'e2e-rule',
              type: 'feeding',
              title: '早餐',
              description: '',
              schedule: {},
              timezone: family.timezone,
              time_of_day: '08:00',
              due_date: e2eToday,
              created_at: '2026-09-01T00:00:00Z',
            },
            log: completed
              ? {
                  id: 'e2e-log',
                  task_id: 'e2e-task',
                  log_date: e2eToday,
                  status: 'done',
                  done_by: user.id,
                  done_at: `${e2eToday}T08:01:00+08:00`,
                  note: '',
                }
              : null,
          },
        ],
      },
    ],
  }
}

async function seedSession(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('planet.session.token', 'e2e-token')
    sessionStorage.setItem('planet.session.user-id', 'e2e-user')
  })
}

async function mockApi(page: Page) {
  let completed = false
  const calls: string[] = []
  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace('/api/v1', '')
    calls.push(`${request.method()} ${path}`)
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    if (path === '/me') return json({ user, entitlements: [] })
    if (path === '/auth/request-code' && request.method() === 'POST') {
      return json({ dev_code: '123456' }, 202)
    }
    if (path === '/auth/verify-code' && request.method() === 'POST') {
      return json({ token: 'e2e-token', user })
    }
    if (path === '/me/preferences') return json({ preferences: {} })
    if (path === '/me/capabilities') return json({ export_json: true, export_pdf: false, push: false, i18n: false })
    if (path === '/me/activation-summary') {
      return json({ families: 1, active_pets: 1, pets_with_active_plans: 1, has_today_items: true })
    }
    if (path === '/families' && request.method() === 'GET') return json({ families: [family] })
    if (path === `/families/${family.id}`) return json({ family, members: [] })
    if (path === '/pets' && request.method() === 'GET') return json({ pets: [pet] })
    if (path === `/pets/${pet.id}`) {
      return json({ pet, profile: { allergies: [], conditions: [], emergency_contacts: [], notes: '' } })
    }
    if (path === `/pets/${pet.id}/export`) return json({ pet, profile: { allergies: [], conditions: [], emergency_contacts: [], notes: '' }, timeline: [] })
    if (path === '/today') return json(todayResponse(completed))
    if (path === '/care-requests/inbox') return json({ care_requests: [] })
    if (path === '/care-handoff-batches/inbox') return json({ batches: [] })
    if (path === '/timeline') return json({ events: [], next_cursor: undefined })
    if (path === `/invite/ABC1234567`) {
      return json({ role: 'caregiver', pet_name: pet.name, inviter_name: user.display_name })
    }
    if (path === `/families/${family.id}/invite/refresh` && request.method() === 'POST') {
      return json({ invite_code: 'ABC1234567' })
    }
    if (path === '/shares/expired') {
      return json({ error: { code: 'SHARE_EXPIRED', message: 'share expired' } }, 410)
    }
    if (path === '/care-tasks/e2e-task/complete' && request.method() === 'POST') {
      completed = true
      return json({ log: todayResponse(true).pets[0]!.items[0]!.log }, 201)
    }
    return json({})
  })
  return { calls }
}

test('unauthenticated users are kept at the auth boundary', async ({ page }) => {
  await page.goto('/auth')
  await expect(page.getByLabel('邮箱地址')).toBeVisible()
  const unnamedButtons = await page.locator('button').evaluateAll((nodes) =>
    nodes
      .filter((node) => !(node.getAttribute('aria-label')?.trim() || node.textContent?.trim()))
      .map((node) => node.outerHTML.slice(0, 160)),
  )
  expect(unnamedButtons, 'auth has an unnamed interactive button').toEqual([])
  await page.getByLabel('邮箱地址').fill('not-an-email')
  await page.getByRole('button', { name: '继续' }).click()
  await expect(page.getByRole('alert')).toHaveText('请输入有效的邮箱地址。')
})

test('login service outage is explained as a recoverable service problem', async ({ page }) => {
  await page.route('**/api/v1/auth/request-code', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'text/plain',
      body: '404 page not found',
    })
  })
  await page.goto('/auth')
  await page.getByLabel('邮箱地址').fill('person@example.com')
  await page.getByRole('button', { name: '继续' }).click()
  await expect(page.getByRole('alert')).toHaveText('登录服务暂时不可用，请稍后重试。')
})

test('direct account links redirect unauthenticated users to auth', async ({ page }) => {
  await page.goto('/account')
  await expect(page.getByLabel('邮箱地址')).toBeVisible()
  await expect.poll(() => new URL(page.url()).pathname).toBe('/auth')
})

test('invite deep link pre-fills and previews the join form', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  await page.goto('/families/join?code=abc1234567')
  await expect(page.getByLabel('邀请码')).toHaveValue('ABC1234567')
  await expect(page.getByText(/E2E 用户\s+邀请你加入/)).toBeVisible()
  await expect(page.getByRole('button', { name: /加入 E2E 用户.*家庭/ })).toBeEnabled()
})

test('public invite preview preserves the code through authentication', async ({ page }) => {
  await mockApi(page)
  await page.goto('/invite/abc1234567')
  await expect(page.getByLabel('邀请码')).toHaveValue('ABC1234567')
  await expect(page.getByLabel('邀请码')).not.toBeFocused()
  await expect(page.getByRole('button', { name: '登录后加入' })).toBeEnabled()
  await page.getByRole('button', { name: '登录后加入' }).click()
  await expect(page).toHaveURL(/\/auth\?invite=ABC1234567$/)
  await page.getByLabel('邮箱地址').fill('invitee@example.com')
  await page.getByRole('button', { name: '继续' }).click()
  await expect(page).toHaveURL(/\/families\/join\?code=ABC1234567$/)
  await expect(page.getByLabel('邀请码')).not.toBeFocused()
  await expect(page.getByRole('button', { name: /加入 E2E 用户.*家庭/ })).toBeEnabled()
})

test('invite preview exposes a retry when the lookup temporarily fails', async ({ page }) => {
  await mockApi(page)
  let attempts = 0
  await page.route('**/api/v1/invite/ABC1234567', async (route) => {
    attempts += 1
    if (attempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: '服务暂时不可用' } }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ role: 'caregiver', pet_name: 'Milo', inviter_name: 'E2E 用户' }),
    })
  })
  await page.goto('/invite/abc1234567')
  await expect(page.getByRole('alert')).toHaveText('服务暂时出了点问题，请稍后再试。')
  await expect(page.getByRole('button', { name: '重试核对' })).toBeVisible()
  await page.getByRole('button', { name: '重试核对' }).click()
  await expect(page.getByText(/E2E 用户\s+邀请你加入/)).toBeVisible()
  await expect(page.getByRole('button', { name: /登录后加入/ })).toBeEnabled()
})

test('invite form blocks malformed codes before submission', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  await page.goto('/families/join')
  await page.getByLabel('邀请码').fill('abc123')
  await expect(page.getByRole('button', { name: '加入家庭' })).toBeDisabled()
})

test('family invite sharing includes a preview link and manual-code fallback', async ({ page }) => {
  await seedSession(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (payload: { text?: string }) => {
        ;(window as typeof window & { __planetShared?: { text?: string } }).__planetShared = payload
      },
    })
  })
  await mockApi(page)
  await page.goto(`/families/${family.id}`)
  await page.getByRole('button', { name: '邀请成员' }).click()
  await page.getByRole('button', { name: '生成邀请码' }).click()
  await expect(page.getByLabel(/邀请码 ABC1234567/)).toBeVisible()
  await page.getByRole('button', { name: '发给成员' }).click()

  await expect.poll(async () =>
    page.evaluate(() => (window as typeof window & { __planetShared?: { text?: string } }).__planetShared?.text ?? ''),
  ).toContain('https://www.joinplanet.pet/invite/ABC1234567')
  await expect.poll(async () =>
    page.evaluate(() => (window as typeof window & { __planetShared?: { text?: string } }).__planetShared?.text ?? ''),
  ).toContain('用邀请码加入')
})

test('expired public shares expose a recoverable explanation', async ({ page }) => {
  await mockApi(page)
  await page.goto('/share/expired')
  await expect(page.getByText('分享已过期')).toBeVisible()
  await expect(page.getByText('链接已失效或被管理员撤销。')).toBeVisible()
})

test('summary share exposes a print or save PDF action', async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as typeof window & { __planetPrints?: number }).__planetPrints = 0
    Object.defineProperty(window, 'print', {
      configurable: true,
      value: () => {
        const current = (window as typeof window & { __planetPrints?: number }).__planetPrints ?? 0
        ;(window as typeof window & { __planetPrints?: number }).__planetPrints = current + 1
      },
    })
  })
  await mockApi(page)
  await page.route('**/api/v1/shares/e2e-summary', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        kind: 'summary',
        expires_at: '2026-09-22T00:00:00Z',
        created_at: '2026-09-15T00:00:00Z',
        data: {
          pet: { name: pet.name, species: pet.species, breed: pet.breed },
          allergies: ['鸡肉'],
          conditions: ['关节护理'],
          notes: '就诊前观察走路状态',
          medications: [{ name: '关节营养', dose: '1 片', schedule: '每日一次' }],
          events: [{ type: 'symptom', occurred_at: '2026-09-14T09:00:00Z', payload: { summary: '偶尔跛行' } }],
          event_days: 90,
        },
      }),
    })
  })
  await page.goto('/share/e2e-summary')
  await expect(page.getByText('过敏与既往病史')).toBeVisible()
  await expect(page.getByText('鸡肉')).toBeVisible()
  await expect(page.getByText('关节护理')).toBeVisible()
  await expect(page.getByText('带去就诊')).toBeVisible()
  await page.getByRole('button', { name: '打印 / 保存 PDF' }).click()
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __planetPrints?: number }).__planetPrints ?? 0)).toBe(1)
})

test('care card exposes the medical decision maker to the caregiver', async ({ page }) => {
  await mockApi(page)
  await page.route('**/api/v1/shares/e2e-care', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        kind: 'care_card',
        expires_at: '2026-09-22T00:00:00Z',
        created_at: '2026-09-15T00:00:00Z',
        data: {
          pet: { name: pet.name, species: pet.species, breed: pet.breed },
          date: '2026-09-15',
          tasks: [{ id: 'task-1', title: '晚餐', log_status: 'pending', time_of_day: '18:00' }],
          emergency_contacts: [{ name: 'Devin', phone: '13800000000' }],
          med_decision_maker: { name: '安安宠医·李医生', phone: '021-55550000' },
        },
      }),
    })
  })
  await page.goto('/share/e2e-care')
  await expect(page.getByText('医疗决定人')).toBeVisible()
  await expect(page.getByText('安安宠医·李医生')).toBeVisible()
  await expect(page.getByText('021-55550000')).toBeVisible()
})

test('summary sharing captures the visit reason in the snapshot options', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  let createBody: Record<string, unknown> | undefined
  await page.route('**/api/v1/pets/e2e-pet/shares', async (route) => {
    if (route.request().method() === 'POST') {
      createBody = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          share: { id: 'e2e-share', pet_id: pet.id, kind: 'summary', expires_at: '2026-09-22T00:00:00Z', view_count: 0, created_at: '2026-09-15T00:00:00Z' },
          token: 'e2e-summary-token',
        }),
      })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ shares: [] }) })
  })
  await page.goto(`/pets/${pet.id}`)
  await page.getByRole('button', { name: '准备就诊' }).click()
  await expect(page.getByText('创建私密分享', { exact: true })).toBeVisible()
  await page.getByLabel('本次就诊主诉 / Why now').fill('最近两天反复呕吐，想确认是否需要检查')
  await page.getByLabel('包含当前用药').click()
  await page.getByLabel('包含宠物档案').click()
  await page.getByLabel('包含近期记录').click()
  await expect(page.getByText('至少选择一项摘要内容。', { exact: true })).toBeVisible()
  await page.getByLabel('包含宠物档案').click()
  await page.getByLabel('包含近期记录').click()
  await page.getByRole('button', { name: '预览摘要' }).click()
  await expect(page.getByText('这份摘要将包含')).toBeVisible()
  await page.getByRole('button', { name: '创建链接' }).click()
  await expect.poll(() => createBody).toBeDefined()
  const options = createBody?.options as Record<string, unknown>
  expect(options.reason).toBe('最近两天反复呕吐，想确认是否需要检查')
  expect(options.sections).toEqual(['profile', 'events'])
})

test('pet JSON export produces a downloadable file on web', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  await page.goto(`/pets/${pet.id}`)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /导出数据/ }).click()
  await expect((await download).suggestedFilename()).toMatch(/planet-export\.json$/)
})

test('Today completes a task and reflects the persisted state', async ({ page }) => {
  await seedSession(page)
  const { calls } = await mockApi(page)
  await page.goto('/')
  if (test.info().project.name === 'mobile390') {
    await expect(page.getByRole('button', { name: '展开日期选择' })).toBeVisible()
  } else {
    await expect(page.getByRole('button', { name: '收起日期选择' })).toBeVisible()
  }
  const completeButton = page.getByRole('button', { name: '完成 早餐' })
  await expect(completeButton).toBeVisible()
  await completeButton.click()
  await expect.poll(() => calls.filter((call) => call === 'POST /care-tasks/e2e-task/complete').length).toBe(1)
  // Reload to prove the completed state is returned by the read path, rather
  // than relying only on the optimistic client update.
  await page.reload()
  await expect(page.getByText('今天已经处理完')).toBeVisible()
  await page.getByRole('button', { name: '查看全部' }).click()
  await expect(page.getByRole('button', { name: /早餐.*撤销/ })).toBeVisible()
})

test('Today keeps secondary tools collapsed until requested', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  await page.goto('/')

  const toolsToggle = page.getByRole('button', { name: '展开更多照护工具' })
  await expect(toolsToggle).toBeVisible()
  await expect(page.getByRole('button', { name: '新增临时照护' })).toHaveCount(0)

  await toolsToggle.click()
  await expect(page.getByRole('button', { name: '收起更多照护工具' })).toBeVisible()
  await expect(page.getByRole('button', { name: '新增临时照护' })).toBeVisible()
})

test('Today keeps alternate responsibility actions behind More', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  await page.goto('/')

  await expect(page.getByRole('button', { name: '我来做：早餐' })).toBeVisible()
  const more = page.getByRole('button', { name: '展开其他安排方式' })
  await expect(more).toBeVisible()
  await expect(page.getByRole('button', { name: '我也不行：早餐' })).toHaveCount(0)

  await more.click()
  await expect(page.getByRole('button', { name: '收起其他安排方式' })).toBeVisible()
  await expect(page.getByRole('button', { name: '我也不行：早餐' })).toBeVisible()
  await expect(page.getByRole('button', { name: '给其他人：早餐' })).toBeVisible()
})

test('Today can adjust one occurrence without changing the recurring plan', async ({ page }) => {
  await seedSession(page)
  const { calls } = await mockApi(page)
  await page.goto('/')

  await page.getByRole('button', { name: '调整 早餐' }).click()
  await expect(page.getByText('调整「早餐」')).toBeVisible()
  await page.getByRole('button', { name: '改这一次的时间' }).click()
  await page.getByLabel('新的时间').fill('20:00')
  await page.getByRole('button', { name: '确认调整' }).click()

  await expect(page.getByText('已改到 20:00')).toBeVisible()
  await expect.poll(() => calls.filter((call) => call === 'POST /care-schedule/actions').length).toBe(1)
})

test('medication care plans require and persist a medication link', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  let createBody: Record<string, unknown> | undefined
  let carePlanCreated = true
  await page.route('**/api/v1/pets/e2e-pet/medications', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        medications: [{
          id: 'e2e-medication',
          pet_id: pet.id,
          name: '阿莫西林',
          dose: '1 片',
          schedule: '每日一次',
          started_on: e2eToday,
          ended_on: null,
          note: '',
        }],
      }),
    })
  })
  await page.route('**/api/v1/pets/e2e-pet/care-plans*', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/assignments')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ assignments: [] }) })
      return
    }
    if (route.request().method() === 'POST') {
      createBody = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>
      carePlanCreated = true
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ care_plan: {}, care_rule: {} }) })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        care_plans: carePlanCreated ? [{
          id: 'e2e-med-plan',
          pet_id: pet.id,
          family_id: family.id,
          medication_id: 'e2e-medication',
          type: 'medication',
          title: '早上吃药',
          description: '',
          schedule: { kind: 'daily' },
          timezone: family.timezone,
          time_of_day: '08:00',
          due_date: e2eToday,
          status: 'active',
        }] : [],
      }),
    })
  })

  await page.goto('/pets/e2e-pet/care')
  await expect(page.getByText('关联药物 · 阿莫西林')).toBeVisible()
  await page.getByRole('button', { name: /设置照护计划：定点给药/ }).click()
  await expect(page.getByRole('button', { name: '关联药物：阿莫西林' })).toBeVisible()
  await page.getByRole('button', { name: '创建计划' }).click()
  await expect.poll(() => createBody?.medication_id).toBe('e2e-medication')
})

test('care plan owner lookup exposes an inline retry', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  let assignmentAttempts = 0
  await page.route('**/api/v1/care-plans/e2e-plan/assignments*', async (route) => {
    assignmentAttempts += 1
    if (assignmentAttempts <= 3) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'TEMPORARY_FAILURE', message: 'temporary' } }) })
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ assignments: [{ care_plan_id: 'e2e-plan', user_id: user.id, user_name: user.display_name, role: 'owner', priority: 0 }] }),
      })
    }
  })
  await page.route('**/api/v1/pets/e2e-pet/care-plans*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ care_plans: [{
        id: 'e2e-plan',
        pet_id: pet.id,
        family_id: family.id,
        type: 'feeding',
        title: '早餐',
        description: '',
        schedule: { kind: 'daily' },
        timezone: family.timezone,
        time_of_day: '08:00',
        due_date: e2eToday,
        status: 'active',
      }] }),
    })
  })

  await page.goto('/pets/e2e-pet/care')
  await expect(page.getByText('负责人暂时无法加载')).toBeVisible()
  await page.getByRole('button', { name: '重试负责人' }).click()
  await expect(page.getByText(`固定负责人 · ${user.display_name}`)).toBeVisible()
  await expect.poll(() => assignmentAttempts).toBe(4)
})

test('editing an interval care plan sends the backend every_n schedule key', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  let scheduleActionBody: Record<string, unknown> | undefined
  await page.route('**/api/v1/pets/e2e-pet/care-plans*', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/assignments')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ assignments: [] }) })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ care_plans: [{
        id: 'e2e-interval-plan',
        pet_id: pet.id,
        family_id: family.id,
        type: 'custom',
        title: '每隔几天梳毛',
        description: '',
        schedule: { v: 1, kind: 'daily' },
        timezone: family.timezone,
        time_of_day: '08:00',
        due_date: e2eToday,
        status: 'active',
      }] }),
    })
  })
  await page.route('**/api/v1/care-schedule/actions', async (route) => {
    scheduleActionBody = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ care_rule: {} }) })
  })

  await page.goto('/pets/e2e-pet/care?familyId=e2e-family')
  await expect(page.getByText('每隔几天梳毛')).toBeVisible()
  await page.getByRole('button', { name: '编辑计划' }).click()
  await page.getByRole('radio', { name: '重复规则：每隔 N 天' }).click()
  await page.getByLabel('间隔天数（≥1）').fill('3')
  await page.getByRole('button', { name: '保存修改' }).click()

  await expect.poll(() => scheduleActionBody).toBeDefined()
  expect((scheduleActionBody?.payload as Record<string, unknown>)?.schedule).toMatchObject({
    v: 1,
    kind: 'interval',
    every_n: 3,
  })
  expect((scheduleActionBody?.payload as Record<string, unknown>)?.schedule).not.toHaveProperty('interval')
})

test('Today adds a temporary care item from the collapsed tools', async ({ page }) => {
  await seedSession(page)
  const { calls } = await mockApi(page)
  await page.goto('/')

  await page.getByRole('button', { name: '展开更多照护工具' }).click()
  await page.getByRole('button', { name: '新增临时照护' }).click()
  await expect(page.getByText('安排一次照护')).toBeVisible()
  await page.getByLabel('要做的事').fill('陪它玩十分钟')
  await page.getByRole('button', { name: '加入今天' }).click()

  await expect(page.getByText('已加入今天的清单')).toBeVisible()
  await expect.poll(() => calls.filter((call) => call === 'POST /care-schedule/actions').length).toBe(1)
})

test('care handoff composer exposes a retry when the member lookup fails', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  let attempts = 0
  await page.route('**/api/v1/families/e2e-family', async (route) => {
    attempts += 1
    if (attempts <= 3) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'TEMPORARY_FAILURE', message: '家庭服务暂时不可用' } }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        family,
        members: [{ user_id: 'other-user', display_name: '家人', email: 'other@example.com', role: 'caregiver' }],
      }),
    })
  })
  await page.goto('/')

  await page.getByRole('button', { name: '展开其他安排方式' }).click()
  await page.getByRole('button', { name: '给其他人：早餐' }).click()
  await expect(page.getByText('家庭成员暂时无法加载，不能安全地转交这件事。')).toBeVisible()
  await expect(page.getByRole('button', { name: '发出请求' })).toBeDisabled()

  await page.getByRole('button', { name: '重试' }).click()
  await expect(page.getByRole('button', { name: /家人/ })).toBeVisible()
  await expect.poll(() => attempts).toBeGreaterThanOrEqual(2)
})

test('batch decline continuation exposes a retry when the refreshed batch is unavailable', async ({ page }) => {
  await seedSession(page)
  await page.addInitScript(() => {
    localStorage.setItem('planet.pending.care-actions.e2e-user', JSON.stringify([{
      userId: 'e2e-user',
      commandId: 'batch-decline-retry',
      kind: 'batch-decline',
      batchId: 'e2e-batch',
      occurrenceIds: ['e2e-task'],
      followUp: 'reassign',
    }]))
  })
  await mockApi(page)
  const batch = {
    id: 'e2e-batch',
    family_id: family.id,
    family_timezone: family.timezone,
    from_user_id: 'other-user',
    from_user_name: '家人',
    target_user_id: user.id,
    target_user_name: user.display_name,
    message: '今天麻烦帮忙',
    created_at: '2026-09-01T00:00:00Z',
    requests: [{
      id: 'e2e-batch-request',
      family_id: family.id,
      family_timezone: family.timezone,
      pet_id: pet.id,
      occurrence_id: 'e2e-task',
      from_user_id: 'other-user',
      from_user_name: '家人',
      target_user_id: user.id,
      target_user_name: user.display_name,
      state: 'declined',
      pet_name: pet.name,
      occurrence_title: '早餐',
      occurrence_type: 'feeding',
      occurrence_status: 'pending',
      due_date: e2eToday,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
    }],
    total_count: 1,
    open_count: 0,
    accepted_count: 0,
    declined_count: 1,
    resolved_count: 0,
  }
  await page.route('**/api/v1/care-handoff-batches/inbox', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ batches: [batch] }) })
  })
  await page.route('**/api/v1/care-handoff-batches/e2e-batch', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: '批次暂时不可用' } }),
    })
  })
  await page.route('**/api/v1/care-handoff-batches/e2e-batch/decline', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  })
  await page.goto('/requests')
  await expect(page.getByRole('alert')).toContainText('已保存批量拒绝，但暂时无法打开继续安排。')
  await expect(page.getByRole('button', { name: '重试打开继续安排' })).toBeVisible()
})

test('primary tabs expose a single readable page heading', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)

  const pages = [
    { path: '/', title: '今天' },
    { path: '/requests', title: '照护请求' },
    { path: '/pets', title: '宠物' },
    { path: '/timeline', title: '记录' },
    { path: '/more', title: '更多' },
  ]

  for (const entry of pages) {
    await page.goto(entry.path)
    await expect(page.getByRole('heading', { name: entry.title, exact: true })).toHaveCount(1)
    const unnamedButtons = await page.locator('button').evaluateAll((nodes) =>
      nodes
        .filter((node) => !(node.getAttribute('aria-label')?.trim() || node.textContent?.trim()))
        .map((node) => node.outerHTML.slice(0, 160)),
    )
    expect(unnamedButtons, `${entry.path} has an unnamed interactive button`).toEqual([])
    const fitsViewport = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    expect(fitsViewport, `${entry.path} should not create horizontal overflow`).toBeTruthy()
    if (entry.path !== '/more') {
      await expect(page.getByRole('button', { name: /当前范围：/ })).toBeVisible()
    }
    if (entry.path === '/more') {
      await expect(page.getByText('照护请求', { exact: true })).toHaveCount(0)
    }
  }
})

test('secondary management pages keep one heading and a stable return surface', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)

  const pages = [
    { path: '/families', title: '家庭', back: '/more' },
    { path: '/families/new', title: '创建家庭', back: '/families' },
    { path: '/families/join', title: '加入家庭', back: '/families' },
    { path: '/trends', title: '趋势', back: '/more' },
    { path: '/settings', title: '设置', back: '/more' },
    { path: '/settings/notifications', title: '通知设置', back: '/settings' },
    { path: '/settings/deleted-families', title: '已删除的家庭', back: '/settings' },
    { path: '/account', title: '账户与安全', back: '/more' },
    { path: '/pets/new', title: '添加宠物', back: '/pets' },
  ]

  for (const entry of pages) {
    await page.goto(entry.path)
    await expect(page.getByRole('heading', { name: entry.title, exact: true })).toHaveCount(1)
    const back = page.getByRole('button', { name: '返回' })
    await expect(back).toHaveCount(1)
    const unnamedButtons = await page.locator('button').evaluateAll((nodes) =>
      nodes
        .filter((node) => !(node.getAttribute('aria-label')?.trim() || node.textContent?.trim()))
        .map((node) => node.outerHTML.slice(0, 160)),
    )
    expect(unnamedButtons, `${entry.path} has an unnamed interactive button`).toEqual([])
    if (entry.path === '/trends') {
      await expect(page.getByRole('button', { name: /当前范围：/ })).toBeVisible()
    }
    await back.click()
    await expect.poll(() => new URL(page.url()).pathname).toBe(entry.back)
  }
})

test('object workspaces keep an accessible heading, return path, and mobile-safe width', async ({ page }) => {
  // The first deep link can trigger a cold Expo web bundle compile in CI.
  // Keep the structural assertions strict while allowing that one-time build
  // to complete on a constrained runner.
  test.setTimeout(120_000)
  await seedSession(page)
  await mockApi(page)
  await page.route('**/api/v1/me/activation-summary', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ families: 0, active_pets: 0, pets_with_active_plans: 0, has_today_items: false }),
    })
  })

  const pages = [
    '/activation',
    '/activation/welcome',
    '/activation/setup-care',
    '/families/e2e-family',
    '/families/e2e-family/transfers',
    '/pets/e2e-pet',
    '/pets/e2e-pet/edit',
    '/pets/e2e-pet/care',
    '/pets/e2e-pet/care/e2e-plan/assignments',
    '/pets/e2e-pet/medications',
    '/pets/e2e-pet/sharing',
    '/pets/e2e-pet/timeline',
    '/pets/e2e-pet/transfer',
    '/requests/e2e-request',
    '/handoffs/e2e-batch',
  ]

  for (const path of pages) {
    // SPA readiness is asserted below; waiting for every dev-server asset to
    // This is a client routed SPA: the response commit is enough to start the
    // route, and the assertions below verify that the screen actually hydrates.
    // Waiting for DOMContentLoaded/load makes the check sensitive to dev-server
    // HMR noise in CI.
    await page.goto(path, { waitUntil: 'commit' })
    await expect(page.locator('[role="heading"]').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: '返回' })).toHaveCount(1)
    const unnamedButtons = await page.locator('button').evaluateAll((nodes) =>
      nodes
        .filter((node) => !(node.getAttribute('aria-label')?.trim() || node.textContent?.trim()))
        .map((node) => node.outerHTML.slice(0, 160)),
    )
    expect(unnamedButtons, `${path} has an unnamed interactive button`).toEqual([])
    const fitsViewport = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    expect(fitsViewport, `${path} should not create horizontal overflow`).toBeTruthy()
  }

  await page.goto('/share/expired')
  await expect(page.getByRole('heading', { name: '分享已过期', exact: true })).toHaveCount(1)
  const unnamedShareButtons = await page.locator('button').evaluateAll((nodes) =>
    nodes
      .filter((node) => !(node.getAttribute('aria-label')?.trim() || node.textContent?.trim()))
      .map((node) => node.outerHTML.slice(0, 160)),
  )
  expect(unnamedShareButtons, 'public share has an unnamed interactive button').toEqual([])
})

test('in-app incoming request card keeps the primary action usable without system notification buttons', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  await page.route('**/api/v1/care-requests/inbox', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        care_requests: [{
          id: 'e2e-request',
          family_id: family.id,
          family_timezone: family.timezone,
          pet_id: pet.id,
          occurrence_id: 'e2e-task',
          from_user_id: 'other-user',
          from_user_name: '家人',
          target_user_id: user.id,
          target_user_name: user.display_name,
          state: 'sent',
          message: '今天加班，麻烦你来做',
          pet_name: pet.name,
          occurrence_title: '遛狗',
          occurrence_type: 'walk',
          occurrence_status: 'pending',
          due_date: e2eToday,
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-01T00:00:00Z',
        }],
      }),
    })
  })
  await page.goto('/')

  await expect(page.getByRole('button', { name: '我来做这件照护' })).toBeVisible()
  await page.getByRole('button', { name: '我来做这件照护' }).click()
  await expect(page.getByText('已接手：遛狗')).toBeVisible()
})

test('request polling exposes a quiet retry when the background inbox fails', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  let attempts = 0
  await page.route('**/api/v1/care-requests/inbox', async (route) => {
    attempts += 1
    if (attempts <= 3) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'TEMPORARY_FAILURE', message: '请求服务暂时不可用' } }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ care_requests: [] }),
    })
  })
  await page.goto('/')
  await expect(page.getByText('照护请求可能没有更新')).toBeVisible()
  await page.getByRole('button', { name: '重试更新照护请求' }).click()
  await expect.poll(() => attempts).toBeGreaterThanOrEqual(4)
  await expect(page.getByText('照护请求可能没有更新')).toHaveCount(0)
})

test('all-family digest exposes a retry when every family summary fails', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  let attempts = 0
  await page.route('**/api/v1/me/capabilities', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ digest: true }),
    })
  })
  await page.route('**/api/v1/families/e2e-family/digest*', async (route) => {
    attempts += 1
    if (attempts <= 3) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'TEMPORARY_FAILURE', message: '摘要服务暂时不可用' } }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ pets: [] }),
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '展开更多照护工具' }).click()
  await expect(page.getByText('家庭摘要暂时无法更新，请重试。')).toBeVisible()
  await page.getByRole('button', { name: '重试' }).click()
  await expect(page.getByText('家庭摘要暂时无法更新，请重试。')).toHaveCount(0)
  await expect.poll(() => attempts).toBeGreaterThanOrEqual(4)
})

test('capability network failure remains visible and recoverable', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  let attempts = 0
  await page.route('**/api/v1/me/capabilities', async (route) => {
    attempts += 1
    if (attempts <= 3) {
      await route.abort('failed')
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ push_notifications: true }),
    })
  })
  await page.goto('/settings')
  await expect(page.getByText('功能开关暂时无法读取，通知入口可能暂时隐藏。')).toBeVisible()
  await page.getByRole('button', { name: '重试' }).click()
  await expect.poll(() => attempts).toBeGreaterThanOrEqual(2)
  await expect(page.getByText('功能开关暂时无法读取，通知入口可能暂时隐藏。')).toHaveCount(0)
})

test('notification settings does not confuse capability loading with unavailable', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  await page.route('**/api/v1/me/capabilities', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ push_notifications: false }),
    })
  })
  await page.goto('/settings/notifications')
  await expect(page.getByText('正在读取通知能力')).toBeVisible()
  await expect(page.getByText('当前没有推送提醒')).toBeVisible()
})

test('activation does not count a failed care-plan lookup as zero plans', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  await page.route('**/api/v1/me/activation-summary', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'not available' } }),
    })
  })
  let planAttempts = 0
  await page.route('**/api/v1/pets/e2e-pet/care-plans*', async (route) => {
    planAttempts += 1
    if (planAttempts <= 3) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'TEMPORARY_FAILURE', message: '暂时不可用' } }),
      })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ care_plans: [] }) })
  })
  await page.goto('/activation')
  await expect(page.getByText('暂时无法读取你的家庭和宠物')).toBeVisible()
  await page.getByRole('button', { name: '重试' }).click()
  await expect.poll(() => planAttempts).toBeGreaterThanOrEqual(4)
  await expect(page.getByText('暂时无法读取你的家庭和宠物')).toHaveCount(0)
})

test('incomplete activation returns to setup instead of an empty Today workspace', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  await page.route('**/api/v1/me/activation-summary', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ families: 0, active_pets: 0, pets_with_active_plans: 0, has_today_items: false }),
    })
  })
  await page.route('**/api/v1/families', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ families: [] }) })
      return
    }
    await route.fallback()
  })
  await page.route('**/api/v1/pets', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pets: [] }) })
  })
  await page.goto('/activation')
  await expect(page.getByRole('heading', { name: '开始使用', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '返回' }).click()
  await expect.poll(() => new URL(page.url()).pathname).toBe('/families')
  await expect(page.getByRole('heading', { name: '家庭', exact: true })).toBeVisible()
})

test('mobile pet workspace keeps long pet names inside the viewport', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  await page.route('**/api/v1/pets/e2e-pet', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        pet: { ...pet, name: '这是一个用于移动端布局验收的超长宠物名字示例' },
        profile: { allergies: [], conditions: [], emergency_contacts: [], notes: '' },
      }),
    })
  })
  await page.goto('/pets/e2e-pet')
  await expect(page.getByRole('heading', { name: '宠物', exact: true })).toHaveCount(1)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('mobile auth form keeps its primary action visible while editing', async ({ page }) => {
  await page.goto('/auth')
  const email = page.getByLabel('邮箱地址')
  await email.fill('person@example.com')
  await email.focus()
  await expect(page.getByRole('button', { name: '继续' })).toBeVisible()
})

test('account profile blocks an empty display name before sending', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  await page.goto('/account')
  const displayName = page.getByRole('textbox', { name: '显示名' })
  await displayName.fill('   ')
  await expect(page.getByRole('button', { name: '保存显示名' })).toBeDisabled()
})

test('viewer pet workspace hides write controls and keeps the record readable', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  await page.route('**/api/v1/families/e2e-family', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ family: { ...family, role: 'viewer' }, members: [] }),
    })
  })
  await page.route('**/api/v1/pets/e2e-pet', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        pet: { ...pet, current_owner_user_id: 'other-user', access_role: 'viewer', family_roles: { [family.id]: 'viewer' } },
        profile: { allergies: [], conditions: [], emergency_contacts: [], notes: '' },
      }),
    })
  })
  await page.goto('/pets/e2e-pet?familyId=e2e-family')
  await expect(page.getByRole('heading', { name: '宠物', exact: true })).toHaveCount(1)
  await expect(page.getByText('只查看成员', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '编辑档案' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '去编辑档案' })).toHaveCount(0)
})

test('viewer family workspace keeps records readable and hides governance writes', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  await page.route('**/api/v1/families/e2e-family', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        family: { ...family, role: 'viewer' },
        members: [
          { user_id: 'owner-user', display_name: '家庭管理员', email: 'owner@example.com', role: 'owner' },
          { user_id: user.id, display_name: user.display_name, email: user.email, role: 'viewer' },
        ],
      }),
    })
  })
  await page.route('**/api/v1/families/e2e-family/pets', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ pets: [pet] }),
    })
  })
  await page.goto('/families/e2e-family')

  await expect(page.getByRole('heading', { name: '家庭', exact: true })).toHaveCount(1)
  await expect(page.getByText('只查看成员', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '编辑家庭' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '邀请成员' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '添加宠物' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '退出家庭' })).toBeVisible()
})

test('viewer care and sharing surfaces explain the read-only boundary', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  await page.route('**/api/v1/families', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ families: [{ ...family, role: 'viewer' }] }),
    })
  })
  await page.route('**/api/v1/pets/e2e-pet', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        pet: { ...pet, current_owner_user_id: 'other-user', access_role: 'viewer', family_roles: { [family.id]: 'viewer' } },
        profile: { allergies: [], conditions: [], emergency_contacts: [], notes: '' },
      }),
    })
  })

  await page.goto('/pets/e2e-pet/care?familyId=e2e-family')
  await expect(page.getByText('你可以查看计划和负责人，但不能修改这只宠物的安排。')).toBeVisible()
  await expect(page.getByRole('button', { name: '自定义' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '添加药物' })).toHaveCount(0)

  await page.goto('/pets/e2e-pet?familyId=e2e-family')
  await expect(page.getByText('外部分享由宠物所有者管理')).toBeVisible()
  await expect(page.getByRole('button', { name: '创建分享' })).toHaveCount(0)
})

test('viewer cannot start a pet transfer and gets a recovery path', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  await page.route('**/api/v1/families', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ families: [{ ...family, role: 'viewer' }] }),
    })
  })
  await page.route('**/api/v1/pets/e2e-pet', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ pet: { ...pet, current_owner_user_id: 'other-user', family_roles: { [family.id]: 'viewer' }, access_role: 'viewer' } }),
    })
  })
  await page.goto('/pets/e2e-pet/transfer?familyId=e2e-family')
  await expect(page.getByText('当前没有可操作的源家庭')).toBeVisible()
  await expect(page.getByText('转移必须由宠物所在源家庭的管理员发起；请让他打开这只宠物的转移页处理。')).toBeVisible()
  await expect(page.getByRole('button', { name: /发送转移请求/ })).toHaveCount(0)
})

test('pet transfer blocks duplicate requests when existing transfer status cannot be confirmed', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  await page.route('**/api/v1/families/e2e-family/transfers?direction=outgoing', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: '转移状态暂时不可用' } }),
    })
  })
  await page.goto('/pets/e2e-pet/transfer?familyId=e2e-family')
  await expect(page.getByText('暂时无法确认已有转移请求，不能安全地发起新的转移。')).toBeVisible()
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
  await expect(page.getByRole('button', { name: /发送转移请求/ })).toHaveCount(0)
})

test('transfer list identifies the counterpart family for both directions', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  await page.route('**/api/v1/families/e2e-family/transfers*', async (route) => {
    const direction = new URL(route.request().url()).searchParams.get('direction')
    const incoming = direction !== 'outgoing'
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        transfers: [{
          id: incoming ? 'e2e-incoming-transfer' : 'e2e-outgoing-transfer',
          pet_id: pet.id,
          pet_name: pet.name,
          from_family_id: incoming ? 'source-family' : family.id,
          from_family_name: incoming ? '源家庭' : family.name,
          to_family_id: incoming ? family.id : 'target-family',
          to_family_name: incoming ? family.name : '目标家庭',
          status: 'pending',
          created_at: '2026-09-01T00:00:00Z',
        }],
      }),
    })
  })
  await page.goto('/families/e2e-family/transfers')
  await expect(page.getByText('来自「源家庭」')).toBeVisible()
  await page.getByRole('tab', { name: '发出的' }).click()
  await expect(page.getByText('转往「目标家庭」')).toBeVisible()
})

test('family detail exposes a retry when incoming transfer requests are unavailable', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  test.setTimeout(30_000)
  let attempts = 0
  await page.route('**/api/v1/families/e2e-family/transfers*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('direction') !== 'incoming') return route.fallback()
    attempts += 1
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: '转移请求暂时不可用' } }),
    })
  })

  await page.goto('/families/e2e-family')
  await expect(page.getByText(/还剩 -\d+ 位/)).toHaveCount(0)
  await expect(page.getByText('转移请求暂时无法加载')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('alert')).toContainText('未能确认收到的宠物转移请求')
  const beforeRetry = attempts
  await page.getByRole('button', { name: '重试加载转移请求' }).click()
  await expect.poll(() => attempts, { timeout: 10_000 }).toBeGreaterThan(beforeRetry)
})

test('viewer Today is readable but cannot complete or reassign care', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  await page.route('**/api/v1/families', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ families: [{ ...family, role: 'viewer' }] }),
    })
  })
  await page.route('**/api/v1/pets', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ pets: [{ ...pet, current_owner_user_id: 'other-user', family_roles: { [family.id]: 'viewer' }, access_role: 'viewer' }] }),
    })
  })
  await page.goto('/?family_id=e2e-family')
  await expect(page.getByText('当前范围只查看', { exact: true })).toBeVisible()
  await expect(page.getByText('你可以查看每项照护和负责人；完成、撤销和转交需要可参与照护的成员权限。')).toBeVisible()
  await expect(page.getByRole('button', { name: '完成 早餐' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '我来做：早餐' })).toHaveCount(0)
})

test('recoverable family load errors keep a visible retry path', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  let attempts = 0
  await page.route('**/api/v1/families', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    attempts += 1
    if (attempts <= 3) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'TEMPORARY_FAILURE', message: '家庭服务暂时不可用' } }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ families: [family] }),
    })
  })
  await page.goto('/families')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
  await page.getByRole('button', { name: '重试' }).click()
  await expect(page.getByRole('heading', { name: '家庭', exact: true })).toHaveCount(1)
  await expect.poll(() => attempts).toBeGreaterThanOrEqual(2)
})

test('requests page exposes a retry when the pet permission lookup fails', async ({ page }) => {
  await seedSession(page)
  await mockApi(page)
  let attempts = 0
  await page.route('**/api/v1/pets', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    attempts += 1
    if (attempts <= 3) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'TEMPORARY_FAILURE', message: '宠物服务暂时不可用' } }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ pets: [pet] }),
    })
  })
  await page.goto('/requests')
  await expect(page.getByText('家庭和宠物范围暂时无法更新，请重试。')).toBeVisible()
  await page.getByRole('button', { name: '重试' }).first().click()
  await expect(page.getByRole('heading', { name: '照护请求', exact: true })).toBeVisible()
  await expect.poll(() => attempts).toBeGreaterThanOrEqual(4)
})

if (process.env.PLANET_APP_E2E_API_BASE_URL?.endsWith('/')) {
test('runtime API base URL trims a trailing slash before requests', async ({ page }) => {
  const requests: string[] = []
  await page.route('**/api/v1/auth/request-code', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'TEMPORARY_FAILURE', message: '暂时不可用' } }),
    })
  })
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/')) requests.push(new URL(request.url()).pathname)
  })
  await page.goto('/auth')
  await page.getByLabel('邮箱').fill('trailing-slash@example.com')
  await page.getByRole('button', { name: '继续' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(requests).toContain('/api/v1/auth/request-code')
  expect(requests.some((path) => path.includes('/api/v1//'))).toBe(false)
})
}
