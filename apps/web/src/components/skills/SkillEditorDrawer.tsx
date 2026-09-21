import { useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import type { SkillCreateInput, SkillOut } from '@openvibe/shared'
import { useSkillMutations, useSkillVersions } from '../../hooks/useSkills'
import { zh } from '../../i18n/zh'
import { Dialog, DialogPanel } from '../ui/Dialog'
import { toast } from '../ui/Toaster'
import { btnGhost, btnPrimary, chipCls, inputCls, labelCls } from '../ui/styles'

const csv = (value: string): string[] =>
  value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v !== '')

/** skill 台账编辑抽屉（m2 FR-2 / FR-3.2）：名称与来源不可改，版本历史只读展示 */
export function SkillEditorDrawer(props: {
  skill: SkillOut | null
  open: boolean
  onClose: () => void
  onSaved: (skill: SkillOut) => void
}) {
  const { skill } = props
  const [name, setName] = useState(skill?.name ?? '')
  const [description, setDescription] = useState(skill?.description ?? '')
  const [skillDir, setSkillDir] = useState(skill?.skillDir ?? '')
  const [targets, setTargets] = useState(skill?.installedTargets.join(', ') ?? '')
  const { create, update } = useSkillMutations()
  const pending = create.isPending || update.isPending
  const versions = useSkillVersions(skill?.id ?? null)

  const save = () => {
    if (skill === null && name.trim() === '') {
      toast(zh.skills.create.nameRequired, 'error')
      return
    }
    const targetsList = csv(targets)
    const onError = (e: Error) =>
      toast(
        e.message.includes('NAME_CONFLICT') ? zh.skills.create.nameConflict : e.message,
        'error',
      )
    if (skill === null) {
      const input: SkillCreateInput = {
        name: name.trim(),
        description,
        source: 'manual',
        installedTargets: targetsList,
        ...(skillDir.trim() === '' ? {} : { skillDir: skillDir.trim() }),
      }
      create.mutate(input, {
        onSuccess: (s) => {
          toast(zh.skills.create.created)
          props.onSaved(s)
        },
        onError,
      })
      return
    }
    update.mutate(
      { id: skill.id, patch: { description, installedTargets: targetsList } },
      {
        onSuccess: (s) => {
          toast(zh.skills.edit.saved)
          props.onSaved(s)
        },
        onError,
      },
    )
  }

  return (
    <Dialog open={props.open} onOpenChange={(o) => (o ? undefined : props.onClose())}>
      <DialogPanel
        variant="sheet"
        title={skill === null ? zh.skills.create.title : zh.skills.edit.title}
        footer={
          <>
            {skill !== null && (
              <span className="mr-auto text-[11px] text-zinc-400">
                {zh.skills.edit.nameImmutable}
              </span>
            )}
            <button className={btnGhost} onClick={props.onClose}>
              {zh.editor.cancel}
            </button>
            <button className={btnPrimary} disabled={pending} onClick={save}>
              {pending ? zh.terms.editor.saving : skill === null ? zh.terms.editor.create : zh.terms.editor.save}
            </button>
          </>
        }
      >
        <Tabs.Root defaultValue="edit">
          <Tabs.List className="mb-3 flex gap-1 border-b border-zinc-100">
            <Tabs.Trigger
              className="px-3 py-2 text-sm data-[state=active]:border-b-2 data-[state=active]:border-brand data-[state=active]:font-medium"
              value="edit"
            >
              {zh.skills.edit.title}
            </Tabs.Trigger>
            {skill !== null && (
              <Tabs.Trigger
                className="px-3 py-2 text-sm data-[state=active]:border-b-2 data-[state=active]:border-brand data-[state=active]:font-medium"
                value="versions"
              >
                {zh.skills.versions.title}
              </Tabs.Trigger>
            )}
          </Tabs.List>

          <Tabs.Content value="edit" className="space-y-3 outline-none">
            <div>
              <label className={labelCls}>{zh.skills.create.name}</label>
              <input
                className={inputCls}
                value={name}
                disabled={skill !== null}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>{zh.skills.create.description}</label>
              <textarea
                className={`${inputCls} min-h-20`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {skill === null && (
              <div>
                <label className={labelCls}>{zh.skills.create.skillDir}</label>
                <input
                  className={`${inputCls} mono`}
                  value={skillDir}
                  onChange={(e) => setSkillDir(e.target.value)}
                />
              </div>
            )}
            <div>
              <label className={labelCls}>{zh.skills.create.installedTargets}</label>
              <input className={inputCls} value={targets} onChange={(e) => setTargets(e.target.value)} />
            </div>
            {skill !== null && (
              <p className="text-[11px] text-zinc-500">
                {zh.skills.columns.source}：{zh.skills.sources[skill.source]}
                {skill.skillDir !== null && ` · ${skill.skillDir}`}
              </p>
            )}
          </Tabs.Content>

          {skill !== null && (
            <Tabs.Content value="versions" className="outline-none">
              <ol className="space-y-1.5">
                {(versions.data?.items.length ?? 0) === 0 && (
                  <li className="text-sm text-zinc-400">{zh.skills.versions.empty}</li>
                )}
                {[...(versions.data?.items ?? [])].reverse().map((v) => (
                  <li
                    key={v.id}
                    className="rounded-md border border-zinc-200 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-800">{v.versionLabel}</span>
                      {v.id === skill.latestVersionId && (
                        <span className={`${chipCls} border-brand bg-brand-soft text-brand`}>
                          {zh.skills.versions.current}
                        </span>
                      )}
                      <span className="ml-auto text-zinc-400">{v.scannedAt}</span>
                    </div>
                    <p className="mt-1 text-zinc-500">
                      {zh.skills.versions.fileCount(v.fileCount)} · {zh.skills.versions.dirHash}:{' '}
                      <span className="mono">{v.dirHash === '' ? zh.skills.versions.manualFingerprint : v.dirHash.slice(0, 16)}</span>
                    </p>
                  </li>
                ))}
              </ol>
            </Tabs.Content>
          )}
        </Tabs.Root>
      </DialogPanel>
    </Dialog>
  )
}
