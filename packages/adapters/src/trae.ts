import {
  packSubject,
  type Frontmatter,
  type PackAdapter,
  type PlannedFile,
  type ResolvedPack,
} from '@openvibe/shared'

/**
 * Trae 自定义规则文件。design §8 的 `trigger: always` 在 T6 真机核验中被推翻：
 * 本机 Trae CN 二进制（workbench.desktop.main.js）的元数据解析器只认
 * `globs` / `alwaysApply`（`=== "true"`）/ `description` / `scene` 四个键，
 * 未知键静默丢弃 ⇒ 写 `trigger: always` 等于没有声明，规则不会自动加载。
 * 同二进制 `/.trae/rules/` + `.md` 的判定分支证实目录支持多规则文件共存，
 * 故保留自定义文件名 `openvibe.md`，不抢占用户自己的 `project_rules.md`。
 * 值必须裸写（Trae 取首个 `:` 之后的原文，引号会进描述文本）。
 */
export const TRAE_PATH = '.trae/rules/openvibe.md'

export function traeFrontmatter(pack: ResolvedPack): Frontmatter {
  return {
    description: `OpenVibe 标准包 ${packSubject(pack.name, pack.version)}`,
    alwaysApply: true,
  }
}

export const traeAdapter: PackAdapter = {
  id: 'trae',
  plan(pack: ResolvedPack): PlannedFile[] {
    return [{ path: TRAE_PATH, frontmatter: traeFrontmatter(pack) }]
  },
}
