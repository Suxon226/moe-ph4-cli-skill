#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function usage() {
  console.log(`Usage:
  node compare_article_target.js --candidate-csv curated_features.csv --target-json article_target.json --out-dir report_dir
  node compare_article_target.js --self-test

Purpose:
  Compare a curated pharmacophore feature set against an article-style target model.
  The target JSON must use the same coordinate frame as the candidate model.
`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--self-test") args.selfTest = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2).replace(/-/g, "_");
      const val = argv[i + 1];
      if (!val || val.startsWith("--")) throw new Error(`Missing value for ${a}`);
      args[key] = val;
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function splitCsvLine(line) {
  const cells = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === "\"") {
      if (quoted && line[i + 1] === "\"") {
        cur += "\"";
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (c === "," && !quoted) {
      cells.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  cells.push(cur);
  return cells;
}

function readCsv(file) {
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    header.forEach((h, i) => {
      row[h] = cells[i] == null ? "" : cells[i];
    });
    return row;
  });
}

function normFamily(f) {
  const s = String(f || "").trim().toLowerCase();
  if (!s) return "";
  if (/^(don|hbd|donor)/.test(s)) return "HBD";
  if (/^(acc|hba|acceptor)/.test(s)) return "HBA";
  if (/^(neg|anion|negative|acid)/.test(s)) return "Neg";
  if (/^(pos|cation|positive|base)/.test(s)) return "Pos";
  if (/^(aro|aromatic|pi)/.test(s)) return "Aro";
  if (/^(hyd|hydrophobe|hydrophobic|lip)/.test(s)) return "Hyd";
  if (/metal|zn|mg|mn|ca/.test(s)) return "Metal";
  return String(f || "").trim();
}

function familyAliases(family, explicitAliases = []) {
  const base = normFamily(family);
  const set = new Set([base, ...explicitAliases.map(normFamily)]);
  if (base === "Neg") set.add("HBA");
  if (base === "HBA") set.add("Neg");
  if (base === "Aro") set.add("Hyd");
  if (base === "Hyd") set.add("Aro");
  return set;
}

function candidateFromRow(row, index) {
  const x = Number(row.x ?? row.X ?? row.cx ?? row.center_x);
  const y = Number(row.y ?? row.Y ?? row.cy ?? row.center_y);
  const z = Number(row.z ?? row.Z ?? row.cz ?? row.center_z);
  const family = normFamily(row.family ?? row.feature ?? row.type ?? row.ph4_family);
  if (![x, y, z].every(Number.isFinite)) {
    throw new Error(`Candidate row ${index + 1} lacks numeric x/y/z`);
  }
  return {
    id: row.id || row.feature_id || row.name || `C${index + 1}`,
    family,
    x,
    y,
    z,
    role: row.role || row.selected_role || "",
    zone: row.site_zone || row.zone || row.region || "",
    score: Number(row.selection_score || row.score || 0),
    raw: row
  };
}

function targetFeature(t, index, defaults) {
  const x = Number(t.x);
  const y = Number(t.y);
  const z = Number(t.z);
  const family = normFamily(t.family || t.feature || t.type);
  if (!family) throw new Error(`Target feature ${index + 1} lacks family`);
  if (![x, y, z].every(Number.isFinite)) {
    throw new Error(`Target feature ${index + 1} lacks numeric x/y/z`);
  }
  return {
    id: t.id || `T${index + 1}`,
    family,
    aliases: t.aliases || [],
    x,
    y,
    z,
    strictRadius: Number(t.strict_radius || defaults.strict_radius || 2.0),
    regionRadius: Number(t.region_radius || defaults.region_radius || 4.5),
    required: t.required !== false,
    zone: t.zone || t.site_zone || "",
    rationale: t.rationale || ""
  };
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function bestMatch(target, candidates, radiusKey) {
  const allowed = familyAliases(target.family, target.aliases);
  let best = null;
  for (const cand of candidates) {
    if (!allowed.has(normFamily(cand.family))) continue;
    const d = dist(target, cand);
    const radius = radiusKey === "strict" ? target.strictRadius : target.regionRadius;
    if (d <= radius && (!best || d < best.distance)) {
      best = { candidate: cand, distance: d, radius };
    }
  }
  return best;
}

function compare(candidates, targetDoc) {
  const defaults = targetDoc.defaults || {};
  const targets = (targetDoc.features || targetDoc.targets || []).map((t, i) =>
    targetFeature(t, i, defaults)
  );
  const candidateFeatures = candidates.map(candidateFromRow);
  const rows = targets.map((t) => {
    const strict = bestMatch(t, candidateFeatures, "strict");
    const region = bestMatch(t, candidateFeatures, "region");
    return {
      target_id: t.id,
      target_family: t.family,
      required: t.required,
      target_zone: t.zone,
      strict_hit: Boolean(strict),
      strict_candidate: strict ? strict.candidate.id : "",
      strict_distance: strict ? Number(strict.distance.toFixed(3)) : null,
      region_hit: Boolean(region),
      region_candidate: region ? region.candidate.id : "",
      region_distance: region ? Number(region.distance.toFixed(3)) : null,
      rationale: t.rationale
    };
  });

  const requiredRows = rows.filter((r) => r.required);
  const denom = requiredRows.length || rows.length || 1;
  const selectedStrict = requiredRows.filter((r) => r.strict_hit).length;
  const selectedRegion = requiredRows.filter((r) => r.region_hit).length;
  const matchedCandidateIds = new Set(rows.filter((r) => r.region_hit).map((r) => r.region_candidate));
  const unmatchedCandidates = candidateFeatures.filter((c) => !matchedCandidateIds.has(c.id));
  const distinctFamilies = new Set(candidateFeatures.map((c) => normFamily(c.family)).filter(Boolean));
  const targetFamilies = new Set(targets.map((t) => normFamily(t.family)));

  return {
    target_name: targetDoc.target_name || targetDoc.name || "",
    candidate_count: candidateFeatures.length,
    target_count: targets.length,
    required_target_count: requiredRows.length,
    selected_strict: {
      hit: selectedStrict,
      total: denom,
      fraction: Number((selectedStrict / denom).toFixed(3))
    },
    selected_region: {
      hit: selectedRegion,
      total: denom,
      fraction: Number((selectedRegion / denom).toFixed(3))
    },
    family_coverage: {
      generated: Array.from(distinctFamilies).sort(),
      target: Array.from(targetFamilies).sort(),
      missing_target_families: Array.from(targetFamilies).filter((f) => !distinctFamilies.has(f)).sort()
    },
    unmatched_candidate_count: unmatchedCandidates.length,
    unmatched_candidates: unmatchedCandidates.map((c) => ({
      id: c.id,
      family: c.family,
      zone: c.zone,
      score: c.score
    })),
    rows
  };
}

function mdReport(result) {
  const lines = [];
  lines.push(`# Pharmacophore Article-Target Comparison`);
  lines.push("");
  if (result.target_name) lines.push(`Target: ${result.target_name}`);
  lines.push(`selected strict: ${result.selected_strict.hit}/${result.selected_strict.total} = ${result.selected_strict.fraction}`);
  lines.push(`selected region: ${result.selected_region.hit}/${result.selected_region.total} = ${result.selected_region.fraction}`);
  lines.push(`candidate count: ${result.candidate_count}`);
  lines.push(`target count: ${result.target_count}`);
  lines.push(`unmatched candidate count: ${result.unmatched_candidate_count}`);
  lines.push("");
  lines.push(`| target | family | required | strict | region | nearest strict | nearest region | zone |`);
  lines.push(`|---|---:|---:|---:|---:|---|---|---|`);
  for (const r of result.rows) {
    lines.push(`| ${r.target_id} | ${r.target_family} | ${r.required ? "yes" : "no"} | ${r.strict_hit ? "hit" : "miss"} | ${r.region_hit ? "hit" : "miss"} | ${r.strict_candidate || "-"} ${r.strict_distance == null ? "" : `(${r.strict_distance})`} | ${r.region_candidate || "-"} ${r.region_distance == null ? "" : `(${r.region_distance})`} | ${r.target_zone || "-"} |`);
  }
  lines.push("");
  if (result.family_coverage.missing_target_families.length) {
    lines.push(`Missing target families: ${result.family_coverage.missing_target_families.join(", ")}`);
  } else {
    lines.push("Missing target families: none");
  }
  lines.push("");
  lines.push("Interpretation: strict requires matching family and near-identical coordinates; region allows the same mechanism zone to be recovered with article-level tolerance.");
  return lines.join("\n");
}

function writeOutputs(result, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "article_target_comparison.json"), JSON.stringify(result, null, 2), "utf8");
  fs.writeFileSync(path.join(outDir, "article_target_comparison.md"), mdReport(result), "utf8");
}

function selfTest() {
  const candidates = [
    { id: "C1", family: "HBA", x: "0", y: "0", z: "0", role: "core", selection_score: "9.2" },
    { id: "C2", family: "Hyd", x: "5", y: "0", z: "0", role: "core", selection_score: "8.1" },
    { id: "C3", family: "Aro", x: "12", y: "0", z: "0", role: "aux", selection_score: "3.5" }
  ];
  const target = {
    target_name: "self-test",
    defaults: { strict_radius: 1.5, region_radius: 4.5 },
    features: [
      { id: "T1", family: "Neg", x: 0.5, y: 0, z: 0, required: true },
      { id: "T2", family: "Aro", aliases: ["Hyd"], x: 5.4, y: 0, z: 0, required: true },
      { id: "T3", family: "Pos", x: 20, y: 0, z: 0, required: false }
    ]
  };
  const result = compare(candidates, target);
  console.log(mdReport(result));
  if (result.selected_strict.hit !== 2 || result.selected_region.hit !== 2) {
    throw new Error("Self-test failed");
  }
}

function main() {
  const args = parseArgs(process.argv);
  if (args.selfTest) {
    selfTest();
    return;
  }
  if (!args.candidate_csv || !args.target_json || !args.out_dir) {
    usage();
    process.exit(2);
  }
  const candidates = readCsv(args.candidate_csv);
  const target = readJson(args.target_json);
  const result = compare(candidates, target);
  writeOutputs(result, args.out_dir);
  console.log(`Wrote ${path.join(args.out_dir, "article_target_comparison.md")}`);
}

main();
