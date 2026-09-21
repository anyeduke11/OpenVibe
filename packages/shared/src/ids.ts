import { nanoid } from 'nanoid'
import { ID_PREFIXES, type IdKind } from './constants'

export function newId(kind: IdKind): string {
  return `${ID_PREFIXES[kind]}${nanoid()}`
}

export function idKindOf(id: string): IdKind | null {
  for (const [kind, prefix] of Object.entries(ID_PREFIXES) as [IdKind, string][]) {
    if (id.startsWith(prefix)) return kind
  }
  return null
}
