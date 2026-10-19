// M9 DL-25 fixture（variant 2，Go 镜像）：**只有**一个 goroutine、无其他任何证据。
//
// 与 py_solo.py 同源 —— 一处 goroutine + 一处无关 fmt.Println，应被判为 `active`
//（封顶），而不是「掌握」或「未触及」。
//
// ⚠️ 不要加 channel、select、sync、context 任何一项 —— 它们各自构成「别种证据」，
// DL-25 的变异腿就破了。
package m9

import "fmt"

func main() {
	go func() {
		// 跟并发无关的输出
		fmt.Println("hello")
	}()

	// 不让程序立刻退出 —— 否则 main 退出时 goroutine 还没跑，DL-25 的「实有 goroutine」就废了。
	// 但**不**用 channel / WaitGroup —— 那会引入「并发原语」的额外证据。
	for i := 0; i < 1; i++ {
	}
}
