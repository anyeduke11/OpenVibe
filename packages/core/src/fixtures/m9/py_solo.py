# M9 DL-25 fixture（variant 2）：**只有**一个装饰器、无其他任何证据的「停在 active」样本。
#
# 这份文件故意**只**用一个装饰器 + 一个无关的 print —— 没有任何：
#   - 测试
#   - typing
#   - 异常处理
#   - 第二种「语言特性」（除装饰器外）
#   - 第二处「用」同知识点
#
# P2 的 `computeState()` 应当把它判为 `active`（源码证据被 §3.13 封顶），
# 而**不是**「掌握」或「未触及」。P2 写完 DL-25 的变异腿会拿它当反例：
# 若实现把它推上「掌握」 ⇒ 红；若实现标「未触及」 ⇒ 红。
#
# ⚠️ 不要在 `# 跟装饰器无关的 print` 那一行加任何装饰器相关代码 —— 那样会让 fixture
# 同时拥有「装饰器」和「别的」两种证据，变异腿的反例假设就破了。

from functools import lru_cache


@lru_cache
def greet(name: str) -> str:
    return f"hello, {name}"


def main() -> None:
    # 跟装饰器无关的 print
    print(greet("world"))


if __name__ == "__main__":
    main()
