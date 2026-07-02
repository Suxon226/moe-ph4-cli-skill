# v2 MOE 原生药效团生成协议

## 目标

2.0 的第一层必须尽量使用 MOE 生成原始药效团候选，而不是直接由大模型凭经验给点。大模型的职责是：准备结构、限定位点、审查 MOE 原始注释、再做机制压缩。

## 标准目录

- `00_inputs/`：PDB、配体/肽链说明、文献目标抽取表。
- `01_structure_qc/`：链识别、缺失残基、配体/肽/辅因子识别、接触图。
- `02_moe_raw/`：MOE 生成的原始 `.ph4`、原始 feature CSV、SVL 日志。
- `03_contacts/`：接触图和水桥/盐桥/疏水墙候选。
- `04_candidates/`：归一化后的全量候选池。
- `05_curated/`：机制压缩后的最终模型。
- `06_comparison/`：与文章式目标或验证集的 strict/region/GH 风格比较。
- `07_reports/`：审计报告。

## 可执行入口

```powershell
node C:\Users\PC\.qclaw\skills\moe-ph4-cli-v2\scripts\moe_native_site_ph4.js `
  --config C:\path\to\moe_native_config.json --run
```

`--run` 会调用 `moebatch.exe -run <generated.svl>`。不加 `--run` 时只生成 SVL、raw CSV 和 manifest，适合先审查。

当前 adapter 的已验证行为：

1. JS 层先读取 PDB，按 receptor/ligand chain 和距离阈值生成结构接触预注释候选。
2. 候选写入标准 `moe_raw_features.csv`，字段包含 family、MOE expr、坐标、半径、site zone、最近受体/配体原子等。
3. 生成 SVL driver，用 MOE `ph4_QueryCreateF` 和 `ph4_QueryWriteFile` 写出 `moe_raw_site_query.ph4`。
4. `moe_raw_features.csv` 可以直接作为 `master_moe_ph4_curate.js` 的 `full_features_csv` 输入。

注意：`ph4_AnnotationRec` 已被验证能返回 MOE annotation record，但该 record 不是 `ph4_QueryCreateF` 可直接接受的 feature tagvector；它需要继续解析后才能进入 CSV。当前版本明确标记为 `pdb_contact_preannotation_to_moe_ph4`，不要把它误称为已经完全解析了 MOE annotation records。

## MOE 层原则

1. 先做结构 QC，再进 MOE。没有链、配体/肽、辅因子、金属、水和缺失区判断，MOE 原始点会很容易变成“哪里有极性原子就哪里有点”。
2. MOE/adapter 原始注释只作为候选池，不等于最终药效团。最终模型必须经过位点分区、冗余合并、能量/几何/可替代性筛选。
3. 默认采用 ligand/peptide-side perspective。多数文章中的 Query Pharmacophore 描述的是候选分子需要携带的化学功能团，而不是受体互补点。
4. 对 `ph4_AnnotationPairs`，SVL 选项必须保留 receptor annotation 语义；若日志出现 `exit NYET`，优先检查 `rec:1`、原子向量和 site selection。
5. `.ph4` 必须与结构在 MOE 中共同展示，确认每个点确实落在相应口袋、肽段、辅因子或热点附近。

## 从原始候选到最终模型

1. 按空间微区聚类：同一化学机制、距离小于约 2.0-3.0 Å 的点优先合并。
2. 按功能家族压缩：同一微区内 `Neg/HBA`、`Aro/Hyd` 可按文章视角和化学可替代性合并；`Pos` 与 `HBD` 不能轻易互换。
3. 按机制保留：埋藏锚点、方向性强的盐桥/氢键、被多篇或多构象支持的热点优先。
4. 按筛选能力剔除：暴露、溶剂可替代、与多数候选均可满足、或只重复描述同一骨架方向的点降级为 auxiliary 或删除。
5. 最终 selected 模型一般应少于全量候选池很多；如果 selected 与 full candidates 几乎等量，说明机制压缩不足。
