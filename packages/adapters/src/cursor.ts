import {
  packSubject,
  type Frontmatter,
  type PackAdapter,
  type PlannedFile,
  type ResolvedPack,
} from '@openvibe/shared'

/** Cursor 新版规则目录（design §7.4：`.cursor/rules/*.mdc` + YAML frontmatter） */
export const CURSOR_PATH = '.cursor/rules/openvibe.mdc'

export function cursorFrontmatter(pack: ResolvedPack): Frontmatter {
  return {
    // YAML 侧需要引号包住的裸文本；值内不含冒号（pack name 受 PACK_NAME_RE、version 受 SEMVER_RE）
    description: `"OpenVibe 标准包 ${packSubject(pack.name, pack.version)}"`,
    globs: '""',
    alwaysApply: true,
  }
}

export const cursorAdapter: PackAdapter = {
  id: 'cursor',
  plan(pack: ResolvedPack): PlannedFile[] {
    return [{ path: CURSOR_PATH, frontmatter: cursorFrontmatter(pack) }]
  },
}
