# v2 公开资料式目标抽取与比较

## 为什么需要公开资料式目标

公开证据资料里的药效团往往不是“真值坐标文件”，而是图、表、RMSD、GH score、命中率、对接 pose 和人工解释的组合。2.0 的比较层把这些信息转成可审计的 `validation_target.json`，用于判断模型是否学到客观规律。

## 目标 JSON

使用 `scripts/validation_target.example.json` 作为模板。每个 feature 至少包含：

- `family`：`HBA/HBD/Neg/Pos/Hyd/Aro/Metal`。
- `x/y/z`：与候选模型一致的坐标系。
- `strict_radius`：严格命中半径，默认 2.0 Å。
- `region_radius`：同机制区域命中半径，默认 4.5 Å。
- `aliases`：文献视角可替代家族，例如 `Neg` 可允许 `HBA`，`Aro` 可允许 `Hyd`。
- `required`：是否属于公开资料模型核心点。
- `zone`：非特异命名的机制区域，例如 `buried_nonpolar_anchor`、`polar_anionic_cap`。

## 比较入口

```powershell
node C:\Users\PC\.qclaw\skills\moe-ph4-cli-v2\scripts\compare_validation_target.js `
  --candidate-csv C:\path\to\curated_features.csv `
  --target-json C:\path\to\validation_target.json `
  --out-dir C:\path\to\comparison
```

## 指标解释

- `selected strict`：最终 selected 模型中，有多少公开资料核心点在同家族和近坐标下被命中。它衡量“是否复现公开资料点位”。
- `selected region`：最终 selected 模型中，有多少公开资料核心机制区域被命中。它衡量“是否找到同一个功能热点”。
- `full candidates strict/region`：如果另用全量候选池比较，衡量 MOE/结构层有没有看见该热点。
- 如果 full candidates 很高、selected 较低，问题通常不是结构识别，而是机制压缩排序。
- 如果 full candidates 也低，优先检查链识别、feature perspective、辅因子/金属/水处理、PDB 构象和 MOE 原始注释。

## 合格解释

不能只报分数。每个 miss 必须说明属于哪一类：

1. 视角错误：把 ligand-side query 当成 receptor-complement。
2. 家族压缩错误：例如把强阴离子只当普通 HBA，或把芳香墙投影漏掉。
3. 空间分区错误：同一口袋中多个点没有合并，或不同子口袋被过度合并。
4. 证据权重错误：保留了暴露/冗余点，压掉了埋藏/方向性强的点。
5. 输入错误：PDB、链、构象、质子化、水/金属/辅因子处理不一致。

