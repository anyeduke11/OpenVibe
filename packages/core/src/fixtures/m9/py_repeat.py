# M9 DL-25 fixture（variant 1）：`import logging` 抄 20 次的「未掌握」样本。
#
# 这份文件**故意**写得很丑 —— 它存在的全部意义是验证 §3.13 的「重复命中只算 1 次」：
# 20 个 import logging 在 P2 的 `computeState()` 看来，应当**只让 logging 知识点在 `active` 里出现 1 次**，
# 而**不应**因为「出现 20 次」就把它推上「掌握」。
#
# ⚠️ 不要往这份文件里加任何"看上去更扎实"的代码（异常处理、测试、注释）。
# P2 的 DL-25 变异腿就靠「20 次同一段」是**唯一**证据这一条事实成立才能红 —— 加了别的东西，
# 状态就可能是「active + 其他证据」而不是「only-active」，那条变异就不成立了。

import logging
import logging
import logging
import logging
import logging
import logging
import logging
import logging
import logging
import logging
import logging
import logging
import logging
import logging
import logging
import logging
import logging
import logging
import logging
import logging


def main() -> None:
    logging.warning("hi")


if __name__ == "__main__":
    main()
