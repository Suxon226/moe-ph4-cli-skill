# 2.0 文献驱动药效团迭代协议

本协议用于把高质量药效团公开资料转化为可迁移的机制策展经验。它不替代 1.0 的基础工作流，而是在 1.0 之上增加严格文献复现、误差归因和规则提炼。

## 1. 合法输入原则

只使用以下来源：

- 用户已经合法提供的 PDF、SI、结构文件和实验数据；
- 期刊官网、PubMed、PMC、PLOS、MDPI 等开放页面；
- RCSB PDB、UniProt、ChEMBL 等公开数据库；
- 公开资料中公开披露的 PDB ID、配体、药效团 feature 类型、半径、GH score、筛选流程。

不得使用：

- 绕过付费墙的全文；
- 未授权的 MOE 二进制、license、数据库；
- 私有数据或需要许可的数据包。

## 2. 先分类，再复现

牛淼淼相关药效团公开资料至少分为三类，必须先分类：

1. `ligand_based_training_set`
   - 通常使用 HypoGen、common feature 或 QSAR-like 活性训练集。
   - 复现重点是训练集、活性范围、feature 数量、cost/Fischer/leave-one-out/test set。
   - 不应强行用结构型 MOE 流程替代。

2. `structure_based_moe_query`
   - 以 PDB 复合物、MOE Pharmacophore Query Editor 或结构接触为核心。
   - 复现重点是 PDB、链、配体/肽、口袋、feature family、空间坐标、半径和 GH/decoy 验证。
   - 适合本 skill 的严格 MOE 复现。

3. `hybrid_virtual_screening`
   - 药效团、docking、MD、MM/PBSA、实验活性联合使用。
   - 复现时不能只看最终活性，应分别复现药效团过滤、对接排序、动力学稳定性和实验层。

## 3. 严格复现层级

文献复现分四级：

- `L0 metadata`: 题录、DOI、作者、方法类型、PDB/配体输入完整。
- `L1 feature_family`: feature 数量和 family 与公开资料一致。
- `L2 spatial_region`: feature 落在公开资料图示/文字对应的口袋区域。
- `L3 validation_target_ph4`: 坐标、半径、可选/必选状态、excluded volume 和 GH/decoy 指标接近公开资料。

2.0 的目标不是每篇都达到 L3，而是让每次失败都产生可迁移的规则增量。

## 4. 迭代循环

每篇公开资料按以下循环执行：

1. 读取题录和方法，确定类别。
2. 提取公开输入：PDB、配体/肽、活性集、feature 列表、筛选验证指标。
3. 构建或下载结构，做结构 QC。
4. 用公开资料方法生成 reference target：
   - 若公开资料给出 feature family/数量/图示位置，建立 validation-target target。
   - 若公开资料给出完整 `.ph4` 或坐标，直接作为 reference。
5. 用当前 2.0 workflow 生成 candidate 和 selected model。
6. 比较：
   - family coverage；
   - spatial region coverage；
   - strict coordinate/RMSD；
   - missing zones；
   - over-selected redundant zones；
   - wrong family assignment；
   - chain/pocket/ligand-state mismatch。
7. 归因失败：
   - 结构准备问题；
   - MOE 原生候选缺失；
   - 接触派生候选缺失；
   - family 归一化错误；
   - 机制压缩错误；
   - 作者手工 Query Editor 偏好；
   - 公开资料方法不是结构型药效团。
8. 只把抽象规律写入 `v2_transferable_rule_deltas_zh.md`。

## 5. 禁止规则

禁止把以下内容写入机制规则：

- 特定靶点名；
- 特定 PDB ID；
- 特定残基编号；
- 特定作者 feature 编号；
- 单篇公开资料的坐标或残基记忆。

可以写入：

- “磷酸化肽结合槽常需要同时表达阴离子/受体正电夹、疏水侧链锚定和主链极性配准”；
- “多 feature 同处一壁面时应压缩为墙代表点加形状边界，而不是全部选入”；
- “HypoGen 活性训练集模型不能用结构接触模型替代，只能转译或辅助解释”；
- “MOE Query Editor 手工模型常把 feature 放在配体可满足位置，而不是受体原子表面本身”。

## 6. 输出结构

每轮迭代应产生：

```text
public evidence_manifest.json
validation_extraction.md
structure_qc.json
validation_target.json
generated_model/
comparison_report.md
failure_attribution.md
transferable_rule_delta.md
```

2.0 skill 更新时，只同步 `transferable_rule_delta.md` 中经过去案例化的规则。

