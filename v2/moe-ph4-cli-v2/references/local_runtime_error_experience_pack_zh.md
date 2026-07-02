# 本地运行错误经验包

## 目标

把本机 MOE、PowerShell、Node、SVL 和 `.ph4` 写入过程中反复出现的问题固定成排查表，方便其他智能体复用。

## 快速原则

1. 先区分错误来自哪里：PowerShell、Node、MOE `moebatch`、SVL 语法、MOE pharmacophore API，还是下游 CSV 解析。
2. MOE 经常把正常 `write` 输出发到 stderr，PowerShell 可能显示 `NativeCommandError`。不要只看红字，要看 MOE 日志里的 `status` 和输出文件是否生成。
3. 遇到 MOE/SVL 错误时，不要改机制压缩规则来掩盖 adapter 问题。

## 常见错误表

| 现象 | 常见原因 | 处理 |
|---|---|---|
| `node` 不是内部或外部命令 | Node 不在系统 PATH | 使用 Codex runtime：`C:\Users\PC\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe` |
| PowerShell 不支持 `&&` | Windows PowerShell 5.1 | 分两条命令执行，不用 Bash 写法 |
| PowerShell heredoc 报错 | Bash `<<EOF` 语法不能直接用 | 用 PowerShell here-string：`@' ... '@ | node -` |
| Node 读中文路径变成 `????` | stdin/控制台编码影响 | 优先使用绝对路径写在 JSON 配置中，或在工作目录内使用相对路径 |
| `moebatch -run` 报 `Illegal compiler option` | SVL 用了 `#` 写普通注释 | 普通注释用 `//`；`#set` 只用于 SVL 元数据 |
| `Local variables are only allowed in functions` | 顶层写了 `local` | 所有执行语句放进 `global function main [] ... endfunction` |
| `Expressions are only allowed in functions` | 顶层写了普通表达式 | 同上，顶层只保留 `#set`、函数声明和函数定义 |
| `Module main function not found` | `moebatch -run` 找不到入口 | 定义 `global function main []` |
| `Nested function ... declared but not defined` | 把 `function ph4_QueryOpen;` 放进 `main` 内部 | 函数声明放在顶层 |
| `Vector of wrong length` 出现在 `fopen` | 用了 `fopen [file,'w']` | 本机 MOE 2024 用 `fopenw out_file` |
| `Vector of wrong length` 出现在多元素 `print` | `print ['A', x]` 写法不稳 | 用 `write 'message\n'`，复杂变量写进 manifest |
| `Not a tagged vector` in `ph4_QueryCreateF` | 直接把 `ph4_AnnotationRec` record 传给 query create | `ph4_QueryCreateF` 需要 `[expr:'Acc', pos:[x,y,z], rad:1.4]` 这类 tagvector |
| `.ph4` 看起来 feature 行少 | MOE 会把多个 feature 写成长行 | 用表达式计数或 `#feature N` 判断，不要按换行数判断 |
| mixed feature 不显示为 `Ani&Acc` | MOE 内部表达式写法不同 | `.ph4` 中常见为 `Ani$mAcc`、`Don$mAcc` |
| GH/strict 分数低但 raw candidates 高 | 压缩层排序或 feature perspective 错 | 检查 selected 机制压缩，不要先怀疑结构输入 |
| raw candidates 也低 | 链识别、构象、质子化、水/金属/辅因子或 site selection 错 | 回到结构 QC 和 MOE raw 层 |
| Git 工作副本有未上传改动 | 本地 skill 改动未同步或不应同步 | 若用户要求本地-only，不执行 `git push` |

## 推荐日志结构

每次运行至少保存：

- `moe_native_manifest.json`
- `moe_native_site_ph4.log`
- raw CSV
- raw `.ph4`
- selected CSV
- selected `.ph4`
- curation report
- 若是多结构模型，还保存 alignment summary 和 consensus report。

## MOE/SVL 最小可运行模板

```svl
#set title 'Minimal MOE Run'
#set class 'SVL:run'

function ph4_QueryOpen;
function ph4_QueryCreateF;
function ph4_QueryWriteFile;
function ph4_QueryClose;

global function main []
    local q = ph4_QueryOpen [];
    local fdata = [[expr:'Acc', pos:[0,0,0], rad:1.4]];
    local fkey = ph4_QueryCreateF [q, fdata, []];
    ph4_QueryWriteFile [q, 'C:/tmp/min_query.ph4'];
    ph4_QueryClose q;
    write 'done\n';
endfunction
```

## 运行后验收

- MOE log 的 `status=0`。
- raw CSV 行数大于 0。
- `.ph4` 中 `#feature` 后的数量与候选数或 selected 数一致。
- 对 mixed features，检查 `Ani$mAcc`、`Don$mAcc` 等 MOE 内部表达式。
- selected 输出能被 MOE 打开并与结构同屏显示。
