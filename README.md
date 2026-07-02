# moe-ph4-cli

让小白也能沿着标准化 workflow，逐步进阶到大师级 MOE 药效团构建。

`moe-ph4-cli` 是一个面向 AI agent 和科研工作流的 MOE 药效团构建 skill。它把药效团专家经验拆解成可执行步骤：结构 QC、口袋识别、MOE 原生特征生成、受体-配体/受体-肽接触解析、feature family 归一化、机制策展压缩、`.ph4` 导出，以及 MOE 中结构与药效团同屏展示。

## 项目定位

这个仓库的核心价值不是“调用 MOE 生成几个点”，而是把药效团构建中的专家判断沉淀为可复用的工作流：

- 帮助新手避免默认第一条链、错误口袋、配体中心距离过滤、全表面 annotation 等常见错误。
- 让 AI agent 能按统一规则完成机制策展，而不是死记硬背某几个案例。
- 将 MOE 原生候选与结构接触候选结合起来，构建更接近真实结合机制的 selected pharmacophore。
- 输出可审计文件：`curated_features.csv`、`curated_model.ph4`、`display_in_moe.svl`、`curation_report.md`、`run_manifest.json`。

## 关于 MOE 授权

MOE 是用户本机需要自行安装和授权的第三方商业软件。本仓库不包含、也不分发：

- MOE 程序、二进制文件或安装包；
- MOE license、授权码或激活信息；
- MOE 专有数据库或专有文档；
- 任何绕过 MOE 授权机制的内容。

本 skill 只提供调用用户本机合法授权 MOE 的 workflow、SVL/CLI 使用规范和机制策展脚本。使用者需自行取得、安装、激活并遵守 MOE 及相关软件的许可协议。

## Workflow Overview

The workflow does not treat MOE receptor annotations as the final model. It combines:

1. Structure quality control and chain classification.
2. Atom-to-atom pocket definition.
3. MOE native pharmacophore candidate generation.
4. Structure-derived receptor-ligand or receptor-peptide contact candidates.
5. Feature family normalization.
6. Mechanism-aware selected model compression.
7. MOE `.ph4` export and structure-pharmacophore visualization.

## Repository Layout

- `SKILL.md`: agent-facing skill entry point.
- `references/`: transferable workflow and mechanism curation rules.
- `scripts/`: reusable command-line scripts for structure QC, curation, and `.ph4` export.

## Minimal Usage

Copy and edit:

```powershell
scripts/master_ph4_config.example.json
```

Then run:

```powershell
node scripts/master_moe_ph4_curate.js --config C:\path\to\config.json
```

The output includes:

- `curated_features.csv`
- `full_mechanism_candidates.csv`
- `curated_model.ph4`
- `write_curated_model.svl`
- `display_in_moe.svl`
- `curation_report.md`
- `run_manifest.json`

## Design Philosophy

药效团不是“MOE 标出来的全部表面点”，而是一个信息压缩问题：用尽量少、尽量独立、机制可解释的空间化学约束，描述一个分子为什么能在该位点结合。

This skill is written as a transferable workflow. It intentionally avoids target-specific examples, benchmark language, and case-specific residue memory.

## Disclaimer

This repository is for lawful research workflow automation and educational method development. Users are responsible for software licensing, data rights, and compliance with all applicable institutional, commercial, and legal requirements.
