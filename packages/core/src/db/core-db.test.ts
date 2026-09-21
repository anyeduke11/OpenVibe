import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { newDb } from '../test-support/new-db'
import { openDatabase } from './index'
import { migrate } from './runner'
import { FlowTemplatesRepo } from '../repos/flows'
import { DevLogRepo } from '../repos/devlog'
import { ProjectsRepo } from '../repos/projects'
import { PromptsRepo } from '../repos/prompts'
import { SkillsRepo } from '../repos/skills'

const basePrompt = { title: '代码审查请求', content: '审查代码', useAs: 'reference' as const }

describe('UT-MIGRATION-01 · migration 只前进且幂等', () => {
  it('首开建全部版本，重跑不重复不报错', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ov-mig-'))
    const db = openDatabase(join(dir, 'm.db'), { autoMigrate: false })
    const applied = migrate(db)
    expect(applied).toEqual(['0001_init', '0002_app_meta_telemetry'])
    expect(migrate(db)).toEqual([])
    const count = (db.prepare('SELECT COUNT(*) AS c FROM schema_migrations').get() as { c: number }).c
    expect(count).toBe(2)
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('WAL 与外键已启用', () => {
    const h = newDb()
    expect(h.db.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(h.db.pragma('foreign_keys', { simple: true })).toBe(1)
    h.close()
  })
})

describe('UT-CASCADE-01 · 提示词硬删级联版本', () => {
  it('删除后 prompt_versions 计数为 0', () => {
    const h = newDb()
    const repo = new PromptsRepo(h.db)
    const { prompt } = repo.create(basePrompt)
    repo.update(prompt.id, { content: 'v2 内容' })
    repo.update(prompt.id, { content: 'v3 内容' })
    expect(repo.versions(prompt.id)).toHaveLength(3)

    repo.delete(prompt.id)
    const count = (
      h.db.prepare('SELECT COUNT(*) AS c FROM prompt_versions').get() as { c: number }
    ).c
    expect(count).toBe(0)
    h.close()
  })
})

describe('UT-CASCADE-02 · skill 与项目级联', () => {
  it('删 skill 级联版本', () => {
    const h = newDb()
    const repo = new SkillsRepo(h.db)
    repo.scan([h.dir]) // dir 无 skills → discovered 0
    // 直接构造：manual skill + 手工版本行
    const skill = repo.create({ name: 'pdf', source: 'manual' })
    h.db
      .prepare(
        `INSERT INTO skill_versions (id, skill_id, version_label, dir_hash, file_count, scanned_at)
         VALUES ('skv_x', ?, 'v1', 'hash', 1, '2026-09-21T00:00:00Z')`,
      )
      .run(skill.id)
    repo.delete(skill.id)
    const count = (h.db.prepare('SELECT COUNT(*) AS c FROM skill_versions').get() as { c: number }).c
    expect(count).toBe(0)
    h.close()
  })

  it('删项目级联 tasks/日志/勾选，且不动目标目录（此处仅验证库内级联）', () => {
    const h = newDb()
    const flows = new FlowTemplatesRepo(h.db)
    const template = flows.create({
      name: '个人轻量流',
      kind: 'light',
      stages: [
        { name: '启动', checklist: [{ id: 'c1', text: '需求一句话写清' }], artifacts: [] },
      ],
    })
    const projects = new ProjectsRepo(h.db)
    const project = projects.create({ name: 'demo', flowTemplateId: template.id })

    h.db
      .prepare(
        `INSERT INTO tasks (id, project_id, title, stage_name, status, order_) VALUES ('tsk_1', ?, 't', '启动', 'todo', 0)`,
      )
      .run(project.id)
    projects.checkState(project.id, '启动', 'c1', true)
    new DevLogRepo(h.db).create(project.id, { type: 'DEV', title: '', body: '', relatedFiles: [] })

    projects.delete(project.id)
    for (const table of ['tasks', 'project_check_states', 'dev_log_entries']) {
      const count = (h.db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c
      expect(count, table).toBe(0)
    }
    h.close()
  })
})
