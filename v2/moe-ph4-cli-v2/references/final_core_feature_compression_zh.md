# 最终核心药效团 Feature 压缩规则

本规则用于 MOE 原生候选和机制策展 selected 候选之后的最后一层压缩。目标是得到可用于设计、筛选和解释的 final core pharmacophore，而不是把所有合理候选都作为 mandatory feature。

## 1. 候选层与核心层必须分离

- `full_candidates`：MOE 原生特征、结构接触特征和人工补充特征的全集，用于保证看见足够多的可能相互作用。
- `selected_candidates`：经过机制筛选后的保护性候选层，允许较宽，常用于保存证据、解释和复核。
- `final_core_features`：真正用于设计或虚拟筛选的核心药效团层。默认保留 4 个 mandatory feature；第 5 个默认作为 optional 证据点，只有存在独立亚口袋或延展沟槽证据时才升为 mandatory。

不要把 `selected_candidates` 直接等同于最终药效团。候选层过宽可以提高召回，核心层必须压缩以避免过拟合。

## 2. 为什么默认 4-6 个 mandatory feature

药效团 feature 太多会把模型锁死在单一晶体构象、水网络、质子化状态或局部侧链取向上；feature 太少则只能描述“能贴上去”，不能约束方向、形状和选择性。

成熟结构型模型通常需要同时表达以下独立约束。常规情况下，4 个 mandatory feature 足以表达这些角色；第 5 个应先作为 optional，用于记录额外但非必需的设计约束。

1. 主锚点：强极性、盐桥、突变邻近区或深埋疏水点，决定整体姿态。
2. 形状锁：中心疏水、芳香壁或埋藏非极性点，防止配体或肽段沿沟槽滑动。
3. 方向门控：入口、出口、端基、主链或边缘氢键/电荷点，确定 N/C 端或侧链朝向。
4. 选择性识别点：由口袋边界、构象开合、局部电场、芳香墙或亚口袋组合产生。

因此 final core 通常是：

- 1-2 个主锚点；
- 1-2 个疏水/芳香形状锁；
- 1-2 个边缘极性、电荷或方向门控点。

工程上优先使用 `4 mandatory + 0-1 optional`，而不是机械输出 5-6 个 mandatory。

## 3. 何时允许超过 6 个

只有满足下列条件之一，才允许把 mandatory feature 扩展到 7-9 个：

- 结合位点是明显延展沟槽，存在两个以上空间上独立的亚口袋；
- 配体或肽段跨越多个结构域、多个界面面片或多个深浅不同的口袋；
- 多结构 consensus 显示这些额外点跨构象稳定，而不是单一结构噪声；
- 额外点承担不同机制角色，而不是同一区域内的重复 Don/Acc/Hyd。

即使超过 6 个，也应优先将较弱、构象依赖或水网络依赖的点标记为 optional，而不是全部作为 mandatory。

## 4. 同一区域只保留一个代表点

如果多个候选 feature 位于同一微区，并表达同一机制，应合并为一个代表点：

- 多个 Don/Acc 围绕同一个极性夹：保留方向最清楚、可达性最好、脱溶剂化代价合理的一个。
- 多个 Hyd/Aro 位于同一疏水凹面：保留最埋藏、最能限制姿态的一个。
- 同一边缘存在多个弱氢键：保留最能定义方向或端基的一个，其余降级为 auxiliary。
- 同一 charged patch 内有多个电荷点：保留承担静电锚定或方向门控的代表点。
- interaction_pair 或 ligand-side/pair feature 优先作为证据层，用来说明相互作用来源；只有没有更合适的 receptor/site-side 代表点，或该 pair 点独立定义方向/端基/亚口袋时，才进入 final core。

判断是否为同一微区时，同时看三件事：空间距离、口袋段位、机制角色。不要仅按残基编号或原子编号合并。

## 5. 核心层选择顺序

按以下顺序构建 final core：

1. 先选一个最强主锚点：强电荷、强极性、深埋疏水或突变/构象选择性热点。
2. 再选一个形状锁：中心疏水、芳香壁、非极性埋藏点或刚性几何限制点。
3. 再选一个方向门控：入口/出口、端基、主链、边缘极性或局部电场点。
4. 再补一个选择性点：与相似口袋区分度高、跨结构稳定或与功能构象相关。
5. 若仍不足 4 个，从未覆盖的段位或亚口袋补点。
6. 第 5 个点默认标记为 optional；只有它代表新的空间角色、独立亚口袋或延展沟槽端点，才考虑升为 mandatory。
7. 若超过 6 个，优先删除同角色、同段位、同微区的重复点。

## 6. 必须输出的解释字段

每个 final core feature 必须说明：

- `final_role`：charged_anchor、polar_gate、hydrophobic_lock、aromatic_wall、direction_gate 或 mixed_boundary。
- `mechanism_rationale`：它约束了姿态、形状、方向、选择性还是构象。
- `evidence_layer`：来自 MOE 原生特征、结构接触、配体/肽侧相互作用、consensus 稳定性或人工复核。
- `mandatory_or_optional`：默认 4 个 mandatory；第 5 个默认 optional，除非有明确独立机制证据；超过 6 个或证据弱的点必须标 optional。

没有机制理由的高分 feature 不应进入 final core。

## 7. 推荐命令

从机制 selected 候选层压缩出最终核心层：

```powershell
node C:\Users\PC\.qclaw\skills\moe-ph4-cli-v2\scripts\final_core_feature_select.js `
  --input C:\path\to\selected_candidates.csv `
  --out-dir C:\path\to\05_curated `
  --min 4 --max 6 --soft-max 5
```

随后优先用 `final_mandatory_features.csv` 写成筛选用 `.ph4`；`final_optional_features.csv` 用于解释、设计扩展或在 MOE 中作为 optional/辅助层展示。

## 8. 禁止事项

- 不要用靶点名称、PDB ID、论文 feature 编号或残基编号作为泛化规则。
- 不要把候选点数量当作最终药效团数量。
- 不要让同一热点内的多个等价 feature 同时成为 mandatory。
- 不要让 interaction_pair、高分电荷点或配体侧点在没有独立空间角色时抢占 mandatory 名额。
- 不要为了追求逐点匹配而牺牲物理化学合理性。
- 不要用运行错误、解析错误或结构链选择错误去修改机制规则。

