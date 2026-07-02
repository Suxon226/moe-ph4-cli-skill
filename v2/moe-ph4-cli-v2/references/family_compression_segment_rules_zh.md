# 药效团 Family 归一化、压缩与肽段角色规则

本文件用于 MOE 药效团构建后的机制策展、selected 压缩和肽药设计解释。规则只依赖结构几何、接触类型、口袋环境和配体/肽构象角色，不依赖任何特定靶点、结构编号、外部示例或残基编号。

## 1. Family 归一化

MOE 原生表达、接触派生特征和人工补充特征必须先归一化，再用于排序、压缩或比较。

| 统一 family | 可归入表达 | 判断要点 |
|---|---|---|
| `HBD` | donor, Don, Don2, protein/ligand NH | 需要给出供氢方向或邻近受体受体原子 |
| `HBA` | acceptor, Acc, Acc2, carbonyl O, carboxylate O | 需要给出受氢方向或邻近供体原子 |
| `Hyd` | hydrophobic, Hyd, aliphatic contact | 脂肪疏水墙、槽底、非极性夹持 |
| `Aro` | aromatic, pi, phenyl/indole/imidazole wall | 平面芳香壁、π-π、阳离子-π、芳香边界 |
| `Pos` | cation, ammonium, guanidinium, protonated amine | 阳离子夹、盐桥正端、阳离子-π |
| `Neg` | anion, carboxylate, phosphate, sulfonate | 阴离子夹、盐桥负端、酸性边界 |
| `Metal` | metal, coordination, chelator | 金属配位、离子桥、配位几何 |
| `ExcludedVolume` | excluded volume, shape wall | 排斥边界、选择性形状限制 |
| `Mixed` | Don/Acc 叠加、不确定或复合接触 | 必须在报告中解释实际角色，不能直接当 strict family |

`Mixed` 是临时标签，不是设计结论。若一个点处在明确氢键网络中，应拆分或归入 `HBD/HBA`；若处在疏水芳香墙，应归入 `Hyd/Aro`；若同时承担两种角色，可以保留一个主 family 和一个 secondary family。

## 2. 近同类与严格同类

严格同类用于同一软件、同一标注体系、同一 family 定义下的内部一致性检查。跨软件、跨脚本、跨结构状态或跨导出格式时，应先使用近同类归一化。

近同类原则：

- `HBD` 与 `HBA` 在“极性配准区域覆盖”层面可视为同族，但在供受体方向决定选择性时必须拆开。
- `Hyd` 与 `Aro` 在“疏水锚定/疏水墙覆盖”层面可视为近同族，但当芳香平面角度、π 作用或阳离子-π 是决定因素时必须拆开。
- `Pos` 与 `Neg` 不可互换。若只知道存在电荷夹但方向不确定，可暂记 `Charged`，随后用原子身份和质子化态拆分。
- `Metal` 不可被普通极性点替代，除非明确只作为空间/极性占位使用。
- `ExcludedVolume` 是形状约束，不可替代相互作用点。

## 3. 压缩目标

selected 药效团不是“分数最高的若干点”，而是信息瓶颈：用尽量少的点保留最多独立结合约束。

压缩应保留：

1. 一个主极性配准点或极性网络代表点。
2. 一个主疏水/芳香锚点或墙面代表点。
3. 若存在电荷选择性，保留正负端之一或成对保留盐桥/电荷夹。
4. 若存在深槽、端点、入口或狭窄通道，保留形状边界或 excluded volume。
5. 若配体/肽跨越多个子口袋，应每个独立子口袋至少一个代表点。
6. 若配体/肽有 N/C 端、转角、环化约束或构象锁定，应保留能解释构象配准的点。

压缩应避免：

- 同一 family、同一局部 patch 内多个近邻点重复入选。
- 所有点来自同一链拷贝、同一表面或同一局部残基簇。
- 全部选极性点而遗漏疏水/芳香夹持。
- 全部选疏水点而遗漏方向性配准。
- 把溶剂暴露、远离配体、没有形状边界支持的弱疏水点选入核心模型。

## 4. 肽段角色

肽配体或肽药设计中，每个片段通常承担不同角色。药效团压缩时应识别这些角色，而不是只看单点接触数。

常见角色：

- `terminal_anchor`：肽端基或末端侧链与口袋端点形成的锚定。
- `core_anchor`：位于结合中心的主锚点，通常决定定位。
- `polar_register`：主链或侧链氢键网络，决定肽段配准。
- `hydrophobic_wall`：非极性侧链沿疏水槽或疏水壁贴合。
- `aromatic_wall`：芳香侧链或受体芳香面形成的方向性墙。
- `charge_clamp`：盐桥、胍基、羧酸、磷酸或质子化胺产生的电荷夹。
- `turn_lock`：环肽、β-turn、Pro/Gly 转角或构象受限片段带来的形状锁。
- `exit_vector`：指向溶剂或可修饰方向，不应被误当作核心结合点。

## 5. 评分建议

每个候选点给出可解释的分数组成，而不是单一黑箱分数。

推荐字段：

- `site_support`: 是否在定义口袋内。
- `contact_support`: 最近配体/肽原子距离和接触类型。
- `family_value`: family 是否填补未覆盖机制角色。
- `geometry_value`: 方向、埋藏度、槽壁/端点/入口位置是否合理。
- `redundancy_penalty`: 与已选点是否过近、同族重复、同 patch 重复。
- `exposure_penalty`: 是否过度溶剂暴露或远离实际配体轨迹。
- `uncertainty`: 质子化、构象、链选择或缺失原子的风险。

## 6. 输出字段

`curated_features.csv` 至少包含：

```text
idx,expr,family,secondary_family,x,y,z,radius,role,source,
receptor_chain,ligand_chain,nearest_receptor_residue,nearest_ligand_residue,
nearest_contact_distance,site_zone,cluster_id,cluster_size,
selection_score,selection_reason,uncertainty
```

`curation_report.md` 必须解释：

1. 口袋如何定义。
2. 哪些链和配体/肽原子参与。
3. 每个 selected 点代表什么机制约束。
4. 哪些候选被降权或排除，以及原因。
5. 当前模型适合怎样的肽药或小分子设计方向。
