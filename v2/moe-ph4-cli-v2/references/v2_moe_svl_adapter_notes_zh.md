# v2 MOE/SVL Adapter Smoke Notes

这些规则来自本机 `C:\Program Files\moe2024\bin-win64\moebatch.exe -run` 的实际 smoke test。它们属于 MOE adapter 层，不是药效团机制规则。

## 已验证规则

1. `moebatch.exe -run script.svl` 需要模块主入口：

```svl
global function main []
    write 'hello\n';
endfunction
```

2. 顶层不能放普通表达式或 `local` 变量。普通执行语句必须进入 `main` 或其他函数体。

3. 顶层可以放 `#set` 元数据和函数声明；不要把 `function ph4_QueryOpen;` 这类声明放进 `main` 内部，否则会被解释成嵌套函数声明。

4. 注释使用 `//`。不要用 `#` 写普通注释；`#` 在 SVL 顶层会被当成 compiler directive。

5. 简单终端输出使用：

```svl
write 'message\n';
```

多元素 `print ['A', x, '\n'];` 可能触发 `Vector of wrong length`。需要变量时优先把变量写进 JSON manifest，由 JS 侧负责审计。

6. 写文件使用 `fopenw`：

```svl
local fh = fopenw out_csv;
fwrite [fh, 'id,family,x,y,z\n'];
fclose fh;
```

`fopen [out_csv, 'w']` 在本机 MOE 2024 smoke test 中触发 `Vector of wrong length`。

7. `ReadPDB [pdb_file, []];` 可进入执行链；若后续失败，优先检查路径编码、PDB 内容和 MOE 当前工作目录。

8. `ph4_QueryCreateF` 的 `fdata` 必须是 feature tagvector 列表。最小可执行形式：

```svl
local q = ph4_QueryOpen [];
local fkey = ph4_QueryCreateF [q, [[expr:'Acc', pos:[0,0,0], rad:1.4]], []];
ph4_QueryWriteFile [q, out_file];
ph4_QueryClose q;
```

可用字段来自 MOE query feature schema：`expr,color,_ebits,_gbits,pos,rad`。常用 `expr` 映射：`Acc`、`Don`、`Ani`、`Cat`、`Hyd`、`Aro`。

9. `ph4_AnnotationRec [scheme, atoms, bitmask, opt]` 已验证能返回 annotation record，例如：

```svl
local bits = ph4_SchemeDefmask 'Unified';
local ann = ph4_AnnotationRec ['Unified', Atoms[], bits, [rec:1, _sol:0]];
```

但该 `ann` 不能直接作为 `ph4_QueryCreateF` 的 `fdata`。直接传入会报 `Not a tagged vector`，因为 `ph4_QueryCreateF` 需要逐 feature 的 tagvector，例如 `[expr:'Acc', pos:[...], rad:...]`。

## 已跑通的最小链

在 `moe_ph4_v2_niu_iteration/02_iterations/plk1_pbd_moe_native_layer` 中，`moe_native_site_ph4.js --run` 已成功：

- 生成 SVL driver；
- 调用 `moebatch.exe -run`；
- 读取执行入口；
- 写出 `moe_raw_features.csv`；
- 写出 `moe_raw_site_query.ph4`；
- 写出显示 helper；
- 返回 MOE 状态码 0。

## 下一层仍需实现

当前 adapter 已证明“可调用 MOE 并写产物”，并已接通：

- PDB 接触预注释生成 `moe_raw_features.csv`；
- MOE `ph4_QueryCreateF/ph4_QueryWriteFile` 写出 raw `.ph4`；
- raw CSV 输入 `master_moe_ph4_curate.js` 后可以得到 selected `.ph4`。

但 MOE 原生 annotation record 深解析仍需继续接入：

1. 稳定原子选择器：根据链、残基、距离或 MOE selection 自动得到 receptor atoms 与 ligand/site atoms。
2. 稳定调用 `ph4_AnnotationRec` 和 `ph4_AnnotationPairs`。
3. 将 MOE annotation records 转成标准 `full_features.csv`。
4. 将原始 `.ph4` 与结构共同显示，并进入机制压缩。

这些属于 2.0 的 MOE adapter 深化任务，不应通过修改机制压缩规则来绕过。
