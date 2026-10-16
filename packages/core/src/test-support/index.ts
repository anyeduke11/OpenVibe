/**
 * `@openvibe/core/test-support` 的 barrel。
 *
 * **为什么要有这一层**（2026-10-17）：原先该子路径直接指向 `new-db.ts` 单文件。
 * 追加禁列扫描器时若另开一个子路径，消费方就得记两个 import 口；而把既有入口
 * 改指 barrel 则**全部旧导入不变**，只需新增一份 re-export。
 *
 * ⚠️ 这里的东西**只许测试用**，不得进 `src/index.ts`（那是产品 API 面）。
 */
export { newDb, type TestDbHandle } from './new-db'
export {
  FORBIDDEN,
  FORBIDDEN_COVERAGE,
  payloadKeys,
  scanForbidden,
  selfProofRows,
  stringValues,
  type ForbiddenCoverage,
  type ForbiddenMechanism,
  type ForbiddenRow,
} from './forbidden-scan'
