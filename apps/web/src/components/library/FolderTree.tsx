import { useState } from 'react'
import type { DragEvent } from 'react'
import { zh } from '../../i18n/zh'

interface FolderNode {
  name: string
  path: string
  children: FolderNode[]
}

/** 路径字符串 → 树（m1 FR-3.2：文件夹是 prompts.folder_path 字段，不是实体表） */
function buildTree(paths: string[]): FolderNode[] {
  const root: FolderNode = { name: '', path: '/', children: [] }
  const ensure = (parent: FolderNode, segs: string[]): FolderNode => {
    const [head, ...rest] = segs
    if (head === undefined) return parent
    const childPath = `${parent.path === '/' ? '' : parent.path}/${head}`
    let next = parent.children.find((c) => c.name === head && c.path === childPath)
    if (next === undefined) {
      next = { name: head, path: childPath, children: [] }
      parent.children.push(next)
    }
    return ensure(next, rest)
  }
  for (const p of paths)
    ensure(
      root,
      p.split('/').filter((s) => s !== ''),
    )
  const sortDeep = (node: FolderNode): void => {
    node.children.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    node.children.forEach(sortDeep)
  }
  sortDeep(root)
  return root.children
}

interface BranchProps {
  selected: string | null
  dragOver: string | null
  collapsed: Set<string>
  onSelect: (path: string) => void
  onDropPrompt: (promptId: string, folderPath: string) => void
  onDragState: (path: string | null) => void
  toggleCollapse: (path: string) => void
}

function FolderBranch(props: BranchProps & { node: FolderNode; depth: number }) {
  const { node, depth } = props
  const open = !props.collapsed.has(node.path)
  const dropProps = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault()
      props.onDragState(node.path)
    },
    onDragLeave: () => props.onDragState(null),
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      const id = e.dataTransfer.getData('text/plain')
      props.onDragState(null)
      if (id !== '') props.onDropPrompt(id, node.path)
    },
  }
  return (
    <>
      <div
        {...dropProps}
        className={`flex items-center gap-1 rounded text-sm ${
          props.selected === node.path ? 'bg-brand-soft text-brand' : 'hover:bg-zinc-100'
        } ${props.dragOver === node.path ? 'ring-1 ring-brand' : ''}`}
        style={{ paddingLeft: `${(depth + 1) * 12}px` }}
      >
        {node.children.length > 0 ? (
          <button
            className="w-4 shrink-0 text-[10px] text-zinc-400"
            onClick={() => props.toggleCollapse(node.path)}
            aria-label={open ? '收起' : '展开'}
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <button
          className="flex-1 truncate py-1 pr-2 text-left"
          onClick={() => props.onSelect(node.path)}
        >
          {node.name}
        </button>
      </div>
      {open &&
        node.children.map((c) => (
          <FolderBranch key={c.path} {...props} node={c} depth={depth + 1} />
        ))}
    </>
  )
}

/** 文件夹树 + 拖拽落点（原生 HTML5 DnD，不引拖拽库，dev-plan §5.4） */
export function FolderTree(props: {
  paths: string[]
  selected: string | null
  onSelect: (path: string | null) => void
  onDropPrompt: (promptId: string, folderPath: string) => void
}) {
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleCollapse = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  const branchProps: BranchProps = {
    selected: props.selected,
    dragOver,
    collapsed,
    onSelect: (path) => props.onSelect(path),
    onDropPrompt: props.onDropPrompt,
    onDragState: setDragOver,
    toggleCollapse,
  }

  return (
    <div className="select-none text-sm">
      <div className="mb-1 flex items-center justify-between px-2">
        <span className="text-xs font-medium text-zinc-500">{zh.folderTree.title}</span>
        {props.selected !== null && (
          <button
            className="text-[11px] text-zinc-400 hover:text-zinc-700"
            onClick={() => props.onSelect(null)}
          >
            {zh.common.clearFilter}
          </button>
        )}
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver('/')
        }}
        onDragLeave={() => setDragOver(null)}
        onDrop={(e) => {
          e.preventDefault()
          const id = e.dataTransfer.getData('text/plain')
          setDragOver(null)
          if (id !== '') props.onDropPrompt(id, '/')
        }}
        className={`flex items-center rounded px-2 py-1 ${
          props.selected === '/' ? 'bg-brand-soft font-medium text-brand' : 'hover:bg-zinc-100'
        } ${dragOver === '/' ? 'ring-1 ring-brand' : ''}`}
      >
        <button className="flex-1 text-left" onClick={() => props.onSelect('/')}>
          {zh.folderTree.root}
        </button>
      </div>
      {buildTree(props.paths).map((n) => (
        <FolderBranch key={n.path} {...branchProps} node={n} depth={0} />
      ))}
      <p className="mt-2 px-2 text-[11px] leading-relaxed text-zinc-400">
        {zh.folderTree.dropHint}
      </p>
    </div>
  )
}
