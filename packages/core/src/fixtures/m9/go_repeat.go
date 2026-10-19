// M9 DL-25 fixture（variant 1，Go 镜像）：`go func()` 抄 20 次的「未掌握」样本。
//
// 与 py_repeat.py 同源 —— 20 次同一段不应被算成「掌握」。`go/parser` 看到 20 个匿名
// goroutine 时，应当让「goroutine 知识点」在 P2 的 `computeState()` 里**只**出现 1 次。
//
// ⚠️ 不要加 error 处理 / sync.WaitGroup / 测试 —— 加任何一项都让 fixture 同时拥有
// 多种证据，DL-25 的变异腿就破了。
package m9

import "fmt"

func main() {
	go func() { fmt.Println("a") }()
	go func() { fmt.Println("a") }()
	go func() { fmt.Println("a") }()
	go func() { fmt.Println("a") }()
	go func() { fmt.Println("a") }()
	go func() { fmt.Println("a") }()
	go func() { fmt.Println("a") }()
	go func() { fmt.Println("a") }()
	go func() { fmt.Println("a") }()
	go func() { fmt.Println("a") }()
	go func() { fmt.Println("a") }()
	go func() { fmt.Println("a") }()
	go func() { fmt.Println("a") }()
	go func() { fmt.Println("a") }()
	go func() { fmt.Println("a") }()
	go func() { fmt.Println("a") }()
	go func() { fmt.Println("a") }()
	go func() { fmt.Println("a") }()
	go func() { fmt.Println("a") }()
	go func() { fmt.Println("a") }()
}
