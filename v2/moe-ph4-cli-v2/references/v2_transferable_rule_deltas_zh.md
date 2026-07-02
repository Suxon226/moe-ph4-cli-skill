# 2.0 可迁移机制策展规则增量

本文件只记录从文献迭代中提炼出的通用规律。不得写入具体靶点、PDB、残基编号或公开资料 feature 编号。

## A. 方法类型识别

1. 活性训练集药效团和结构接触药效团必须分开处理。前者解释 SAR 和活性区分，后者解释结合姿态与口袋相互作用。
2. 如果公开资料的模型来自 HypoGen、common feature 或训练集 cost 统计，MOE 结构复现只能做转译和结构解释，不能声称完整替代原方法。
3. 如果公开资料的模型来自 MOE Query Editor 或结构复合物，严格复现应优先匹配 PDB 状态、配体/肽构象、链选择、feature family 和 Query Editor 半径。

## B. 作者式 Query Editor 复现

1. 作者式 feature 常放在“配体可满足的位置”，不一定在受体原子表面。接触派生候选应允许使用配体原子坐标、相互作用中点或投影点。
2. 氢键 donor/acceptor 的严格 family 不能只由受体原子决定，应由“设计分子需要提供什么功能团”决定。
3. 当目标是复现公开资料式 ligand/peptide pharmacophore 时，默认采用 `ligand-side feature perspective`：feature family 描述设计分子自身应提供的功能团；只有在明确构建 receptor-side interaction map 时才采用受体互补视角。
4. 磷酸化、硫酸化、羧酸、核苷酸和其他强阴离子基团应优先识别为 `Neg/HBA` 组合，而不是被普通氧原子简化成单一 HBA。
5. 多个近邻 polar feature 若共同定义肽/配体 register，应保留方向不同的代表点；若只是同一原子簇重复 annotation，应合并。
6. 手工药效团常把疏水/芳香墙压缩为一个中心点，不能用多个受体疏水原子点代替。
7. 当模板配体或肽本身没有芳香基团，但受体口袋存在明确芳香/π 壁时，应允许生成 `receptor_aromatic_wall_projection` 候选；该候选代表设计分子可用芳香或 π-rich 片段占据该壁面，而不是模板分子当前原子的直接 family。

## C. 多模态筛选流程

1. 药效团过滤、docking 排序、MD 稳定性和实验活性属于不同证据层。规则迭代时必须记录是哪一层导致模型修正。
2. GH score、enrichment、decoy recovery 属于筛选性能，不等同于结构机制正确；两者都要报告。
3. 对结构型模型，若 full candidates 覆盖 validation-target target 而 selected 丢失，应优先修正压缩层。
4. 若 full candidates 也缺失，应优先检查链、配体状态、口袋壳层、MOE annotation 类型和接触派生候选。

## D. 复杂口袋机制

1. 磷酸化、核苷酸、酸性头基或带强负电配体常需要同时表达电荷夹、极性配准和疏水锚定，不能只选极性点。
2. 肽/蛋白界面常有“主链 register + 侧链疏水墙 + 端点锚定”的组合；任何一个角色缺失都可能导致模型筛到错误构象。
3. 深槽或多壁面口袋中，疏水/芳香 feature 应作为墙、槽底或端点代表点，而不是按接触数选最近原子。
4. 高度开放的蛋白表面不应强行加入大量 exposed hydrophobic points；需要 shape boundary 或 polar register 来约束假阳性。

## E. 严格输出

1. 每个 selected 点必须说明它代表设计分子应提供的功能团，而不仅是结构中存在的受体原子性质。
2. 每个模型必须同时输出 validation-target model、generated model、差异归因和下一轮规则修正。
3. 若模型只达到 family/region 一致而未达到坐标一致，应明确标记为机制复现，不标记为严格 validation-target 复现。

