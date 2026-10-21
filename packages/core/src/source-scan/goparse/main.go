// M9 P4 Go 扫描助手（`packages/core/src/source-scan/goparse/main.go`）。
//
// ## 它是什么
//
// 一个**只用标准库**的 Go 程序：遍历项目根下的 `.go` 文件，用 `go/parser`
// 解析语法树，按登记表给的节点类型找出命中，输出 JSON。
//
// ## ⚠️ 为什么是独立程序而不是在 TS 里正则
//
// §3.8 的实现口径表写死：Go 优先走 `go/parser`（**检测到 Go 工具链时**），
// 否则退回正则启发式。`go/parser` **只能**由 Go 代码调用 ⇒ 必须起一个 Go 进程。
//
// ## ⚠️ 为什么输出的是**相对路径**
//
// §3.10：`file_rel_path` **不含绝对路径**（FR-7.2）——
// 而 DL-23（导出清单不含绝对路径）要求这条从**产生的那一刻**就成立。
// ⇒ 相对路径在**助手侧**就算好 ⇒ 绝对路径根本没有机会进入进程输出。
//
// ## ⚠️ 只用标准库
//
// `go.mod` 里**零 require** ⇒ 离线可构建、零第三方依赖（owner 长期立场）。
package main

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
)

type spec struct {
	ID   string `json:"id"`
	Kind string `json:"kind"`
}

type payload struct {
	Root  string `json:"root"`
	Files []string `json:"files"`
	Specs []spec `json:"specs"`
}

type hit struct {
	SpecID   string `json:"spec_id"`
	File     string `json:"file"`
	Line     int    `json:"line"`
	Col      int    `json:"col"`
	Text     string `json:"text"`
	LineText string `json:"line_text"`
}

type output struct {
	Hits      []hit `json:"hits"`
	FileCount int   `json:"file_count"`
	Version   string `json:"version"`
}

var skipDirs = map[string]bool{
	"node_modules": true, "dist": true, "build": true, "vendor": true,
	"testdata": true, ".git": true, ".idea": true, ".vscode": true,
	".cache": true, "bin": true, "obj": true,
}

// skipDirs is kept for documentation: the file list is produced by the
// TypeScript side (which owns the skip rules and the file cap), so this
// helper no longer walks the tree itself.
var _ = skipDirs

// matches reports whether node is the AST node kind named by the spec.
func matches(node ast.Node, kind string) bool {
	switch kind {
	case "GoStmt":
		_, ok := node.(*ast.GoStmt)
		return ok
	case "DeferStmt":
		_, ok := node.(*ast.DeferStmt)
		return ok
	case "ChanType":
		_, ok := node.(*ast.ChanType)
		return ok
	case "SelectStmt":
		_, ok := node.(*ast.SelectStmt)
		return ok
	case "StructType":
		_, ok := node.(*ast.StructType)
		return ok
	case "InterfaceType":
		_, ok := node.(*ast.InterfaceType)
		return ok
	case "MapType":
		_, ok := node.(*ast.MapType)
		return ok
	case "RangeStmt":
		_, ok := node.(*ast.RangeStmt)
		return ok
	case "FuncLit":
		_, ok := node.(*ast.FuncLit)
		return ok
	case "ImportSpec":
		_, ok := node.(*ast.ImportSpec)
		return ok
	case "TypeSwitchStmt":
		_, ok := node.(*ast.TypeSwitchStmt)
		return ok
	case "SendStmt":
		_, ok := node.(*ast.SendStmt)
		return ok
	case "RecvStmt":
		// Go has no dedicated receive statement node: `v := <-ch` is an
		// assignment whose left-hand side is a unary receive expression.
		as, ok := node.(*ast.AssignStmt)
		if !ok || len(as.Lhs) != 1 {
			return false
		}
		un, ok := as.Lhs[0].(*ast.UnaryExpr)
		return ok && un.Op == token.ARROW
	case "GoFunc":
		_, ok := node.(*ast.FuncLit)
		return ok
	}
	return false
}

// reportTarget returns the node whose position and text should be reported
// for a spec. It differs from the matched node only for receive statements,
// where the interesting part is the `<-ch` expression, not the assignment.
func reportTarget(node ast.Node, kind string) ast.Node {
	if kind != "RecvStmt" {
		return node
	}
	as, ok := node.(*ast.AssignStmt)
	if !ok || len(as.Lhs) != 1 {
		return node
	}
	if un, ok := as.Lhs[0].(*ast.UnaryExpr); ok && un.Op == token.ARROW {
		return un
	}
	return node
}

func main() {
	var in payload
	dec := json.NewDecoder(os.Stdin)
	if err := dec.Decode(&in); err != nil {
		fmt.Fprintln(os.Stderr, "cannot decode payload:", err)
		os.Exit(1)
	}
	root := in.Root
	specs := in.Specs

	out := output{Hits: []hit{}, Version: runtime.Version()}

	for _, rel := range in.Files {
		path := filepath.Join(root, rel)
		src, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		fset := token.NewFileSet()
		file, err := parser.ParseFile(fset, path, src, 0)
		if err != nil {
			// A file that does not parse is skipped, not fatal: one broken file
			// must not hide every other file in the project.
			continue
		}
		out.FileCount++

		relSlash := filepath.ToSlash(rel)
		lines := strings.Split(string(src), "\n")

		ast.Inspect(file, func(node ast.Node) bool {
			if node == nil {
				return true
			}
			for _, sp := range specs {
				if !matches(node, sp.Kind) {
					continue
				}
				target := reportTarget(node, sp.Kind)
				start := fset.Position(target.Pos())
				end := fset.Position(target.End())
				text := ""
				if start.Offset >= 0 && end.Offset <= len(src) && start.Offset <= end.Offset {
					text = string(src[start.Offset:end.Offset])
				}
				lineText := ""
				if start.Line >= 1 && start.Line <= len(lines) {
					lineText = lines[start.Line-1]
				}
				out.Hits = append(out.Hits, hit{
					SpecID:   sp.ID,
					File:     relSlash,
					Line:     start.Line,
					Col:      start.Column,
					Text:     text,
					LineText: lineText,
				})
			}
			return true
		})
	}

	sort.Slice(out.Hits, func(i, j int) bool {
		a, b := out.Hits[i], out.Hits[j]
		if a.File != b.File {
			return a.File < b.File
		}
		if a.Line != b.Line {
			return a.Line < b.Line
		}
		return a.SpecID < b.SpecID
	})

	enc := json.NewEncoder(os.Stdout)
	if err := enc.Encode(out); err != nil {
		fmt.Fprintln(os.Stderr, "encode failed:", err)
		os.Exit(1)
	}
}
