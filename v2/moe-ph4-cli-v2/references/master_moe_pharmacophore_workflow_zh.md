# 大师级 MOE 药效团构建工作流

## v2.1 最终核心层修正

最终输出必须区分三层：`full_candidates`、`selected_candidates` 和 `final_core_features`。其中 `final_core_features` 才是用于设计、筛选和 MOE 展示的模型层。

常规结构型或界面型模型默认使用 `4 mandatory + 0-1 optional`：

- 4 个 mandatory feature 覆盖主锚点、形状锁、方向门控和选择性边界；
- 第 5 个 feature 默认 optional，只作为额外证据或设计扩展；
- 只有第 5 个点代表独立亚口袋、延展沟槽端点或新的空间机制角色时，才允许升为 mandatory；
- interaction_pair、ligand-side/pair-derived feature 和高分电荷点优先作为证据层，不得在没有独立空间角色时抢占 mandatory 名额；
- 筛选用模型优先来自 `final_mandatory_features.csv`，optional 层用于解释、设计扩展或 MOE 辅助显示。

本工作流用于从蛋白、肽、配体、复合物或界面结构中构建可解释、可复用、可在 MOE 中展示和筛选的药效团模型。它面向通用药物设计任务，不绑定任何具体靶点、结构编号、外部示例或历史项目。

## 总目标

产出一个机制策展后的 selected pharmacophore：

- 由 MOE 原生特征和结构接触特征共同支持；
- 位于明确的结合口袋或界面；
- 每个特征有 family、角色、坐标、证据和选择理由；
- 能与结构一起在 MOE 中打开和展示；
- 可用于肽药、小分子、环肽、肽模拟物或片段设计。

## 输入要求

最小输入：

```text
structure.pdb 或 structure.moe
目标位点说明
受体链策略
配体/肽/辅因子策略
输出目录
```

可选输入：

```text
已知活性配体或肽链
需要保留或排除的辅因子/金属/水
重要残基集合
对接构象或 MD 代表构象
药效团特征数量范围
筛选用途约束
```

## 阶段 1：结构 QC

1. 读取结构文件。
2. 统计所有链、残基数、HETATM、金属、离子、水、核酸和非标准残基。
3. 判断哪些链可能是受体，哪些链可能是配体、肽、核酸或辅助组分。
4. 检查缺失原子、重复链、晶体接触、altLoc、异常坐标和非目标小分子。
5. 输出 `structure_qc.json` 和人工可读摘要。

关键原则：

- 禁止默认第一条链为受体。
- 多链口袋必须作为整体处理。
- 对称链或重复链必须记录选择依据。

## 阶段 2：口袋定义

按优先级选择口袋定义方式：

1. 已知配体/肽/辅因子存在：用受体原子到配体/肽原子的最小距离定义接触壳层。
2. 用户给出位点残基：用这些残基的原子集合定义口袋中心和边界。
3. 只有 apo 结构：用 cavity、保守表面、突变热点、同源配体或用户指定区域推断，必须标记不确定性。

推荐距离：

- `3.5 A`：强方向性接触。
- `4.5 A`：直接接触或疏水支撑。
- `6.0 A`：主要 binding shell。
- `8.0 A`：大型配体、核苷酸、诱导口袋或二级墙。

长肽、柔性肽、环肽和延展小分子必须使用原子到原子的最小距离，不使用几何中心距离作为主过滤。

## 阶段 3：MOE 原生候选生成

使用 `moebatch.exe` 和 SVL：

1. 载入结构。
2. 按口袋原子集合限制受体注释范围。
3. 生成 receptor-side pharmacophore annotation。
4. 若存在配体或肽，生成 interaction-pair 或等价接触特征。
5. 保存 MOE 原生 `.ph4`、日志和 marker 文件。
6. 导出或解析为 `full_features.csv`。

MOE 原生候选不可直接作为最终 selected 模型。它是候选池的一部分。

## 阶段 4：接触派生候选生成

从结构直接生成补充候选：

- 氢键：供体、受体、距离、角度、主链/侧链来源。
- 盐桥：正负中心、距离、质子化风险。
- 疏水接触：非极性原子簇、埋藏度、槽壁位置。
- 芳香作用：平面、边面对面、阳离子-π、π-π。
- 肽段配准：主链氢键、端基锚点、转角锁、环化约束。
- 金属/辅因子：配位点、电荷、几何。
- 形状约束：入口、深槽、狭窄边界、excluded volume。

这些候选必须带有 `source=contact_derived`，不能与 MOE 原生特征混淆。

## 阶段 5：Family 归一化

将所有候选统一到：

```text
HBD, HBA, Hyd, Aro, Pos, Neg, Metal, ExcludedVolume, Mixed
```

保留原始表达：

```text
expr_original = MOE 原始表达或接触派生表达
family = 归一化主 family
secondary_family = 次要 family，可为空
```

任何 `Mixed` 都必须解释不确定性，最终模型中不应大量保留无法解释的 `Mixed` 点。

## 阶段 6：机制压缩

压缩目标是最少特征覆盖最多独立机制约束。

执行顺序：

1. 先按口袋和链过滤候选。
2. 再按空间和 family 聚类去冗余。
3. 识别结合区域：中心锚点、端点锚点、极性配准、疏水墙、芳香墙、电荷夹、形状边界、出口向量等。
4. 每个独立区域优先选择一个高证据代表点。
5. 对已覆盖 family/zone 加惩罚，避免重复。
6. 对结构支持弱、暴露过强、远离配体轨迹的点降权。
7. 根据设计用途决定模型大小，通常 `4-8` 个 selected features。

最终 selected 模型应回答：

```text
这个结合位点要求设计分子满足哪些空间和化学条件？
```

而不是：

```text
MOE 在这个表面标出了哪些点？
```

## 阶段 7：导出

导出：

- `curated_features.csv`
- `curated_model.ph4`
- `curation_report.md`
- `display_in_moe.svl`
- `run_manifest.json`

`curated_features.csv` 必须包含：

```text
idx,expr,family,secondary_family,x,y,z,radius,role,source,
receptor_chain,ligand_chain,nearest_receptor_residue,nearest_ligand_residue,
nearest_contact_distance,site_zone,cluster_id,cluster_size,
selection_score,selection_reason,uncertainty
```

## 阶段 8：MOE 可视化

必须能在 MOE 中同时展示：

1. 受体结构。
2. 配体或肽，如果存在。
3. 口袋残基或口袋壳层。
4. 全量候选，可选。
5. selected 药效团。

视觉检查要确认：

- 药效团不漂离口袋。
- 特征没有全部集中在同一小块表面。
- 极性和疏水/芳香角色与口袋环境一致。
- excluded volume 或 shape wall 没有堵住真实配体轨迹。

## 阶段 9：报告

报告必须包含：

```text
输入结构：
受体链策略：
配体/肽/辅因子策略：
口袋定义：
MOE 原生候选：
接触派生候选：
Family 归一化：
压缩规则：
Selected features：
设计启发：
不确定性：
输出文件：
```

## 常见失败模式

1. 默认第一链导致错误口袋。
2. 用配体中心距离过滤延展肽，丢失真实端点。
3. 只用 receptor annotation，缺失 peptide-side 或 interaction-pair 特征。
4. 按候选密度排序，重复选择同一区域。
5. 只选极性点，漏掉疏水/芳香锚定。
6. 只选疏水点，漏掉方向性配准。
7. 未归一化 MOE expression，导致 family 判断错误。
8. 没有输出每个点的选择理由，后续设计无法复用。

## 最小可执行路径

若时间有限，也必须完成：

1. 结构 QC。
2. 原子到原子的口袋定义。
3. MOE 原生候选生成。
4. 接触派生候选补充。
5. family 归一化。
6. 机制压缩。
7. `.ph4` 导出。
8. MOE 中结构和药效团同屏展示。

缺少任何一步，都只能称为候选生成，不能称为成熟药效团构建。

## 最终核心层压缩

机制压缩后必须区分两个输出层：

1. `selected_candidates`：证据层，允许保留较宽的候选集合，用于解释、复核和追踪。
2. `final_core_features`：最终模型层，默认 4-6 个 mandatory feature，用于设计、筛选和 MOE 展示。

最终核心层必须覆盖独立空间机制角色，而不是重复保留同一热点内的多个等价 feature。默认组合为：

- 1-2 个主锚点：强极性、盐桥、突变邻近区、深埋疏水或构象选择性热点；
- 1-2 个形状锁：中心疏水、芳香壁、埋藏非极性点或刚性几何限制点；
- 1-2 个方向门控或选择性边界：入口/出口、端基、主链、边缘极性、电荷或局部电场点。

如果候选层超过 4 个点，必须继续压缩，或把弱证据/构象依赖/同微区重复点标记为 optional。interaction_pair、ligand-side/pair-derived feature 和高分电荷点优先作为证据层；只有缺少更好的 site-side 代表点，或它们独立定义方向/端基/亚口袋时，才进入 mandatory。只有延展沟槽、多亚口袋、多结构 consensus 稳定且每个点承担不同机制角色时，才允许超过 4 个 mandatory feature。

推荐执行：

```powershell
node C:\Users\PC\.qclaw\skills\moe-ph4-cli-v2\scripts\final_core_feature_select.js `
  --input C:\path\to\selected_candidates.csv `
  --out-dir C:\path\to\05_curated `
  --min 4 --max 6 --soft-max 5
```

详细规则见 `references/final_core_feature_compression_zh.md`。没有 final core 层的输出，只能称为候选策展，不能称为最终药效团模型。
