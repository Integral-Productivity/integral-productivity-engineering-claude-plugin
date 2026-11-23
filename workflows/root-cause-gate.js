export const meta = {
  name: 'root-cause-gate',
  description: 'Before fix-queue: reproduce each issue on main, name its defect class with independent lens reviewers, inventory every site of the class, and plan the failing test first',
  whenToUse: 'A lead is about to run fix-queue on one issue or a group of issues and wants the fix to cover the whole defect class, not only the sentences the issue text names. It edits nothing in the target repo; it writes plan files to scratch and returns fix-queue args with a scopeFence per issue.',
  phases: [
    { title: 'Reproduce', detail: 'one agent per issue, on current main' },
    { title: 'Review', detail: 'independent lens reviewers per reproducing issue, 3 or 7' },
    { title: 'Inventory', detail: 'one agent: every site of each defect class' },
    { title: 'Plan', detail: 'one agent: a plan file per defect class, with the test tier and the failing test' },
  ],
}

// root-cause-gate: the step a lead runs before fix-queue (issue #208, this
// plugin's ADR 0007). Shipped from the plugin's workflows/ directory, so it
// runs as integral-productivity-engineering:root-cause-gate. The guide is
// skills/root-cause-gate-guide/SKILL.md.
//
// args (an object, passed as JSON, not a string):
//   repo      required  'Owner/name' on GitHub
//   repoPath  required  absolute path of the repo's main checkout
//   scratch   required  absolute scratch directory; plan files go under <scratch>/root-cause-gate/
//   issues    required  a non-empty list of issue numbers, reviewed as one group
//   lenses    optional  'auto' (the default) or 'all'
//
// The scope fence is built here, in code, from the inventory: an issue's fence
// is every file where its defect class occurs, plus the test file the plan
// names. So the fence cannot shrink back to the issue text (plan KTD2).

const A = args || {}

const SAFE_REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const SAFE_PATH = /^\/[A-Za-z0-9._\/-]+$/
if (typeof A.repo !== 'string' || !SAFE_REPO.test(A.repo)) {
  throw new Error('root-cause-gate needs args.repo as "Owner/name" (letters, digits, . _ - only)')
}
function checkPath(name, value) {
  if (typeof value !== 'string' || !SAFE_PATH.test(value) || value.split('/').includes('..')) {
    throw new Error(`root-cause-gate needs args.${name} as an absolute path of letters, digits, . _ - and / only, with no ..`)
  }
}
checkPath('repoPath', A.repoPath)
checkPath('scratch', A.scratch)
if (!Array.isArray(A.issues) || A.issues.length === 0 || !A.issues.every((n) => Number.isInteger(n) && n > 0)) {
  throw new Error('root-cause-gate needs args.issues as a non-empty list of positive integer issue numbers')
}
if (A.lenses !== undefined && A.lenses !== 'auto' && A.lenses !== 'all') {
  throw new Error("root-cause-gate needs args.lenses as 'auto' or 'all', or no lenses at all")
}

const ISSUES = [...new Set(A.issues)]
const GROUP = ISSUES.map((n) => `#${n}`).join(' ')
const PLAN_DIR = `${A.scratch}/root-cause-gate`
const REPO_DECLARED = 'Take test tiers and any declared matrix (platforms, hosts, modes) from the target repo itself: its CLAUDE.md, then docs/agents/. Never assume tiers or matrices the repo does not declare; if it declares none, say so.'

const LENS_FOCUS = {
  requirements: 'what the issue and its acceptance criteria actually require, and where the requirement itself is wrong, missing or ambiguous',
  architecture: 'boundaries, contracts between components, and ADRs the defect crosses or contradicts',
  design: 'the shape of the code: the abstraction, duplication or missing seam that lets this defect exist',
  quality: 'tests and checks that should have caught this, and why they did not',
  business: 'who is affected, how often, and what it costs them',
  engineering: 'the mechanism: the exact code path, inputs and state that produce the defect',
  process: 'the workflow, review or automation step that let the defect ship or recur',
}
const ALL_LENSES = Object.keys(LENS_FOCUS)
const CORE_LENSES = ['requirements', 'design', 'quality']
const FLAGS = ['contract', 'adr', 'hook', 'unattended']

const REPRODUCE_SCHEMA = {
  type: 'object',
  required: ['reproduces', 'evidence', 'acceptance', 'touches'],
  properties: {
    reproduces: { type: 'boolean' },
    evidence: { type: 'string' },
    acceptance: { type: 'string' },
    touches: {
      type: 'object',
      required: FLAGS,
      properties: Object.fromEntries(FLAGS.map((f) => [f, { type: 'boolean' }])),
    },
  },
}
const LENS_SCHEMA = {
  type: 'object',
  required: ['rootCauses', 'defectClass', 'evidence'],
  properties: {
    rootCauses: { type: 'array', items: { type: 'string' } },
    defectClass: { type: 'string' },
    evidence: { type: 'array', items: { type: 'string' } },
  },
}
const INVENTORY_SCHEMA = {
  type: 'object',
  required: ['classes'],
  properties: {
    classes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'description', 'issues', 'sites', 'claims', 'matrix'],
        properties: {
          id: { type: 'string' },
          description: { type: 'string' },
          issues: { type: 'array', items: { type: 'integer' } },
          sites: { type: 'array', items: { type: 'object', required: ['file', 'line'], properties: { file: { type: 'string' }, line: { type: 'integer' } } } },
          claims: { type: 'array', items: { type: 'string' } },
          matrix: { type: 'string' },
        },
      },
    },
  },
}
const PLAN_SCHEMA = {
  type: 'object',
  required: ['plans'],
  properties: {
    plans: {
      type: 'array',
      items: {
        type: 'object',
        required: ['classId', 'planFile', 'testTier', 'testFile', 'failingTest'],
        properties: {
          classId: { type: 'string' },
          planFile: { type: 'string' },
          testTier: { type: 'string' },
          testFile: { type: 'string' },
          failingTest: { type: 'string' },
        },
      },
    },
  },
}

phase('Reproduce')
const reproducePrompt = (n) => `Reproduce GitHub issue #${n} of ${A.repo} on current main, in the checkout at ${A.repoPath}. Read the issue with gh. Do not edit any file in the repo; scratch work goes under ${A.scratch}.

Return:
- reproduces: true only when you saw the defect on current main (a failing command, a file:line that still says the wrong thing).
- evidence: what you ran or read, and what it showed.
- acceptance: the acceptance criteria as they stand today. If the issue no longer reproduces, re-baseline them: say what, if anything, is still left to do.
- touches: whether the defect touches a contract (an interface other code or agents rely on), an ADR, a hook, or unattended use (runs with no person present).`

const reproduced = await parallel(ISSUES.map((n) => () => agent(reproducePrompt(n), { label: `reproduce #${n}`, phase: 'Reproduce', schema: REPRODUCE_SCHEMA })))

const notReproduced = []
const failed = []
const live = []
ISSUES.forEach((n, i) => {
  const r = reproduced[i]
  if (!r) failed.push({ number: n, stage: 'reproduce' })
  else if (r.reproduces) live.push({ number: n, touches: r.touches || {} })
  else notReproduced.push({ number: n, evidence: r.evidence, acceptance: r.acceptance })
})

const fixQueueArgs = (issues, scopeFence) => ({ repo: A.repo, repoPath: A.repoPath, issues, scopeFence })
const emptyReport = (extra = {}) => ({
  reproduced: [], notReproduced, unclassified: [], failed, scopeFence: {}, planFiles: {},
  fixQueueArgs: fixQueueArgs([], {}), ...extra,
})
if (live.length === 0) {
  log('root-cause-gate: no issue reproduces on main; nothing to review or plan')
  return emptyReport()
}

phase('Review')
const lensesFor = (item) => (A.lenses === 'all' || FLAGS.some((f) => item.touches[f] === true) ? ALL_LENSES : CORE_LENSES)
const lensPrompt = (name, n) => `You are one independent root-cause reviewer for GitHub issue #${n} of ${A.repo}. The group under review is ${GROUP}. The repo's main checkout is at ${A.repoPath}; read the issues with gh. Do not edit any file in the repo.

Your lens is ${name}: ${LENS_FOCUS[name]}.

Return:
- rootCauses: the root causes you find through your lens, not the symptom.
- defectClass: one sentence naming the class of defect, general enough to find other sites of it.
- evidence: file:line references, failing commands or quoted claims that show it.`

const jobs = []
for (const item of live) {
  item.lenses = lensesFor(item)
  item.reviews = []
  for (const name of item.lenses) jobs.push({ item, name })
}
const lensResults = await parallel(jobs.map(({ item, name }) => () => agent(lensPrompt(name, item.number), { label: `lens ${name} #${item.number}`, phase: 'Review', schema: LENS_SCHEMA })))
jobs.forEach(({ item, name }, i) => {
  if (lensResults[i]) item.reviews.push({ lens: name, ...lensResults[i] })
})

phase('Inventory')
const reviewText = live.map((item) => `Issue #${item.number}:\n${item.reviews.map((r) => `  [${r.lens}] class: ${r.defectClass}\n    causes: ${(r.rootCauses || []).join('; ')}\n    evidence: ${(r.evidence || []).join('; ')}`).join('\n') || '  (no review returned)'}`).join('\n\n')
const inventoryPrompt = `Inventory the defect classes for these reproducing issues of ${A.repo}: ${live.map((i) => `#${i.number}`).join(' ')}. The repo's main checkout is at ${A.repoPath}. Do not edit any file in the repo.

Independent lens reviewers named these root causes and defect classes:

${reviewText}

Merge the reviewers' classes into as few defect classes as the evidence supports. Issues with the same root cause share one class. For each class return:
- id: a short kebab-case name.
- description: one sentence.
- issues: the issue numbers in this class. Put every reproducing issue in exactly one class when the evidence allows.
- sites: every file and line in the repo where this class of defect occurs, not only the ones the issue text names. Search the whole repo.
- claims: every doc, comment, ADR or message that cites these issues or makes a claim the defect makes false.
- matrix: the repo-declared matrix the fix must hold across, or "" when the repo declares none.

${REPO_DECLARED}`
const inventory = await agent(inventoryPrompt, { label: 'inventory', phase: 'Inventory', schema: INVENTORY_SCHEMA })

// Each live issue joins the first class that lists it.
const toFileSafeSlug = (id) => String(id).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'class'
const liveNumbers = new Set(live.map((i) => i.number))
const classes = []
const used = new Set()
for (const c of (inventory && inventory.classes) || []) {
  const members = (c.issues || []).filter((n) => liveNumbers.has(n) && !classes.some((k) => k.issues.includes(n)))
  if (members.length === 0) continue
  let slug = toFileSafeSlug(c.id)
  for (let k = 2; used.has(slug); k++) slug = `${slug.replace(/-\d+$/, '')}-${k}`
  used.add(slug)
  classes.push({ ...c, slug, issues: members, planFile: `${PLAN_DIR}/plan-${slug}.md` })
}
const classOf = (n) => classes.find((c) => c.issues.includes(n))
const unclassified = live.filter((i) => !classOf(i.number)).map((i) => ({ number: i.number, lenses: i.lenses }))
if (classes.length === 0) {
  log('root-cause-gate: the inventory put no reproducing issue in a defect class')
  return emptyReport({ unclassified })
}

phase('Plan')
const classText = classes.map((c) => `- class ${c.slug}: plan file ${c.planFile}
  description: ${c.description}
  issues: ${c.issues.map((n) => `#${n}`).join(' ')}
  sites: ${(c.sites || []).map((s) => `${s.file}:${s.line}`).join(', ') || '(none listed)'}
  claims: ${(c.claims || []).join('; ') || '(none)'}
  matrix: ${c.matrix || '(none declared)'}`).join('\n')
const planPrompt = `Write one combined fix plan per defect class for ${A.repo} (main checkout at ${A.repoPath}). Write each plan file at the path given; do not edit any file in the repo.

${classText}

Each plan file must:
- name the defect class, its issues, and every site and claim above as the fix's scope;
- name the test tier that proves the behaviour, from the tiers the repo declares, and the test file;
- specify the failing test to write first (what it asserts, and why it fails on main today), with an execution note that the fixer writes it first and sees it fail;
- say that gaps found during the fix are sorted by the residual rule in this plugin's skills/writing-dispatch-prompts/reference/residual-rule.md, and that a site of this class is the issue's own work, not a residual.

${REPO_DECLARED}

Return one entry per class: classId (the class name above), planFile, testTier, testFile (repo-relative), failingTest.`
const planned = await agent(planPrompt, { label: 'plan', phase: 'Plan', schema: PLAN_SCHEMA })
const planOf = (slug) => ((planned && planned.plans) || []).find((p) => p.classId === slug) || {}

// ---- Fence, in code ----
const scopeFence = {}
const planFiles = {}
const reproducedOut = []
for (const item of live) {
  const c = classOf(item.number)
  if (!c) continue
  const p = planOf(c.slug)
  const files = [...new Set((c.sites || []).map((s) => s.file).filter(Boolean))]
  const parts = [`Defect class ${c.slug}: ${c.description}`, `Files: ${files.join(', ') || '(no sites listed)'}`]
  if (p.testFile) parts.push(`Test file: ${p.testFile}`)
  parts.push(`Plan: ${c.planFile}`)
  scopeFence[String(item.number)] = parts.join('. ')
  planFiles[String(item.number)] = c.planFile
  reproducedOut.push({ number: item.number, defectClass: c.slug, lenses: item.lenses, testTier: p.testTier, testFile: p.testFile, failingTest: p.failingTest, planFile: c.planFile })
}

log(`root-cause-gate: ${reproducedOut.length} fenced, ${notReproduced.length} not reproduced, ${unclassified.length} unclassified, ${failed.length} failed`)
return {
  reproduced: reproducedOut,
  notReproduced,
  unclassified,
  failed,
  scopeFence,
  planFiles,
  fixQueueArgs: fixQueueArgs(reproducedOut.map((r) => r.number), scopeFence),
}
