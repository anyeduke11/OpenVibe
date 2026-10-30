import { useMutation, type UseMutationOptions } from '@tanstack/react-query'
import type { ApiError } from '../api/client'

/**
 * `useMutation` 的薄封装：把 `TError` 固定为 `ApiError`。
 *
 * **为什么需要这一层**：react-query 的 `TError` 默认是 `Error`。本仓所有
 * mutationFn 都经 `apiJson`/`apiRaw`（`apps/web/src` 内 `fetch(` 唯一出现在
 * `api/client.ts`），抛出的必是 `ApiError`——但类型上没有这个保证，所以
 * `onError: (e: ApiError) => ...` 的 `e` 被推断成 `Error`，静态判据无法确认来源。
 *
 * 封装后 `e` 的类型就是 `ApiError`，判据可以依赖「声明即契约」而不是命名约定。
 *
 * **薄到什么程度**：只做类型收窄，不做任何运行时包装（不包 try/catch、不加日志、
 * 不提供额外 hooks）。多一层抽象就必须有明确的理由——这里的理由是类型契约。
 */
export function useApiMutation<TData, TVariables = void>(
  options: UseMutationOptions<TData, ApiError, TVariables>,
) {
  return useMutation(options)
}
