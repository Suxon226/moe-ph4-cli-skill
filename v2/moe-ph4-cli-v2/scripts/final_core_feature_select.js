#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DEFAULT_HEADERS = [
  "case_id",
  "feature_id",
  "residue_context",
  "moe_type",
  "chem_class",
  "polarity",
  "chain",
  "res_name",
  "res_seq",
  "x",
  "y",
  "z",
  "radius",
  "score_a",
  "score_b",
  "score_c",
  "axis_t",
  "segment",
  "direction",
  "basis",
  "rank",
  "feature_id_2",
  "distance",
  "reason",
];

function usage() {
  console.error(`Usage:
node final_core_feature_select.js --input selected_candidates.csv --out-dir 05_curated [--min 4] [--max 6] [--soft-max 5] [--cluster-radius 2.0]

Outputs:
  final_core_features.csv
  final_mandatory_features.csv
  final_optional_features.csv
  final_core_rejected.csv
  final_core_summary.md`);
}

function parseArgs(argv) {
  const args = { min: 4, max: 6, clusterRadius: 2.0 };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--input") {
      args.input = value;
      i += 1;
    } else if (key === "--out-dir") {
      args.outDir = value;
      i += 1;
    } else if (key === "--min") {
      args.min = Number(value);
      i += 1;
    } else if (key === "--max") {
      args.max = Number(value);
      i += 1;
    } else if (key === "--soft-max") {
      args.softMax = Number(value);
      i += 1;
    } else if (key === "--cluster-radius") {
      args.clusterRadius = Number(value);
      i += 1;
    } else if (key === "--help" || key === "-h") {
      usage();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${key}`);
      usage();
      process.exit(2);
    }
  }
  if (!args.input || !args.outDir) {
    usage();
    process.exit(2);
  }
  if (!Number.isFinite(args.min) || !Number.isFinite(args.max) || args.min < 1 || args.max < args.min) {
    throw new Error("--min and --max must be positive numbers with max >= min");
  }
  if (args.softMax == null) args.softMax = Math.min(args.max, args.min + 1);
  if (!Number.isFinite(args.softMax) || args.softMax < args.min || args.softMax > args.max) {
    throw new Error("--soft-max must be between --min and --max");
  }
  return args;
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function normalizeHeader(s) {
  return String(s || "")
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function hasHeader(row) {
  const names = new Set(row.map(normalizeHeader));
  return (
    (names.has("x") && names.has("y") && names.has("z")) ||
    names.has("feature_id") ||
    names.has("family") ||
    names.has("moe_type") ||
    names.has("reason")
  );
}

function readCsv(file) {
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").trim();
  if (!text) return { headers: [], rows: [] };
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const parsed = lines.map(parseCsvLine);
  const headers = hasHeader(parsed[0])
    ? parsed[0].map(normalizeHeader)
    : DEFAULT_HEADERS;
  const data = hasHeader(parsed[0]) ? parsed.slice(1) : parsed;
  const rows = data.map((cols, index) => {
    const row = { __source_index: index + 1 };
    headers.forEach((h, i) => {
      row[h] = cols[i] == null ? "" : cols[i];
    });
    return row;
  });
  return { headers, rows };
}

function first(row, names) {
  for (const name of names) {
    const key = normalizeHeader(name);
    if (row[key] != null && String(row[key]).trim() !== "") return String(row[key]).trim();
  }
  return "";
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function textBlob(row) {
  return [
    first(row, ["feature_id", "id", "feature_name"]),
    first(row, ["family", "moe_expr", "moe_type", "type"]),
    first(row, ["chem_class", "polarity", "secondary_family"]),
    first(row, ["residue_context", "res_name", "resn", "nearest_ligand_residue", "nearest_receptor_residue"]),
    first(row, ["segment", "site_zone", "zone"]),
    first(row, ["direction", "basis", "reason", "select_reason", "tag", "rationale"]),
  ]
    .join(" ")
    .toLowerCase();
}

function isInteractionPair(row) {
  return /(interaction_pair|cross_chain_contact|ligand_side_or_interaction_pair|pair_charged_feature)/.test(textBlob(row));
}

function roleGroup(role) {
  if (["hydrophobic_lock", "aromatic_wall"].includes(role)) return "shape";
  if (["direction_gate", "mixed_boundary"].includes(role)) return "direction_boundary";
  return "polar_anchor";
}

function finalRole(row) {
  const t = textBlob(row);
  const charged = /(charged|charge|electrostatic|salt|acidic|basic|ani|cat|pos|neg|arg|lys|asp|glu|guanidinium)/.test(t);
  const aromatic = /(aro|aromatic|phenyl|pi|phe|tyr|trp|aromatic_wall)/.test(t);
  const hydrophobic = /(hyd|hydrophobic|nonpolar|aliphatic|buried|lipophilic|leu|ile|val|pro|met)/.test(t);
  const polar = /(polar|hbond|hba|hbd|don|acc|ser|thr|asn|gln|his|backbone|mainchain)/.test(t);
  const directional = /(terminal|edge|gate|direction|entry|exit|backbone|mainchain|n_term|c_term|n-termin|c-termin)/.test(t);
  const strongAnchor = /(anchor|clamp|salt|buried|mutation|selective|primary)/.test(t);

  if (aromatic) return "aromatic_wall";
  if (hydrophobic && !charged) return "hydrophobic_lock";
  if (directional && !strongAnchor && !charged) return "direction_gate";
  if (charged) return "charged_anchor";
  if (directional) return "direction_gate";
  if (polar) return "polar_gate";
  return "mixed_boundary";
}

function mechanismRationale(role, row) {
  const segment = first(row, ["segment", "site_zone", "zone"]) || "unassigned_zone";
  const basis = first(row, ["reason", "select_reason", "basis", "tag", "rationale"]);
  const roleText = {
    charged_anchor: "strong electrostatic or salt-bridge-like anchoring that fixes binding register",
    polar_gate: "directional hydrogen-bond or polar gate that constrains orientation",
    hydrophobic_lock: "buried nonpolar shape lock that prevents sliding along the pocket",
    aromatic_wall: "aromatic or pi-facing wall that defines pocket boundary and selectivity",
    direction_gate: "edge, terminal, or backbone-facing gate that defines entry/exit direction",
    mixed_boundary: "mixed pocket-boundary constraint that combines shape and polarity",
  }[role];
  return `${roleText}; zone=${segment}${basis ? `; evidence=${basis}` : ""}`;
}

function quality(row, role) {
  const roleWeight = {
    charged_anchor: 5.4,
    polar_gate: 5.4,
    hydrophobic_lock: 5.7,
    aromatic_wall: 5.6,
    direction_gate: 5.3,
    mixed_boundary: 4.2,
  }[role] || 4.0;

  const rank = num(first(row, ["rank", "selected_rank", "feature_rank"]));
  const rankScore = rank == null ? 0 : Math.max(0, 1.0 - Math.min(rank, 50) / 50);
  const scoreValues = ["score", "total_score", "score_a", "score_b", "score_c", "distance"]
    .map((k) => num(first(row, [k])))
    .filter((v) => v != null);
  const scoreScore = scoreValues.length ? Math.max(...scoreValues.map((v) => Math.min(Math.abs(v), 10) / 10)) : 0;
  const reason = first(row, ["reason", "select_reason", "basis", "tag", "rationale"]).toLowerCase();
  const protection = /(protected|anchor|clamp|gate|lock|consensus|buried|charged|direction|coverage)/.test(reason) ? 0.4 : 0;
  const interactionPenalty = isInteractionPair(row) ? 0.9 : 0;
  return roleWeight + rankScore + scoreScore + protection - interactionPenalty;
}

function xyz(row) {
  const x = num(first(row, ["x", "tx", "original_x"]));
  const y = num(first(row, ["y", "ty", "original_y"]));
  const z = num(first(row, ["z", "tz", "original_z"]));
  return x == null || y == null || z == null ? null : { x, y, z };
}

function dist(a, b) {
  const pa = xyz(a);
  const pb = xyz(b);
  if (!pa || !pb) return Infinity;
  return Math.sqrt((pa.x - pb.x) ** 2 + (pa.y - pb.y) ** 2 + (pa.z - pb.z) ** 2);
}

function rowKey(row) {
  return `${first(row, ["feature_id", "id"]) || row.__source_index}:${row.__source_index}`;
}

function annotateRows(rows) {
  return rows.map((row) => {
    const role = finalRole(row);
    return {
      ...row,
      final_role: role,
      final_quality: quality(row, role),
      final_rationale: mechanismRationale(role, row),
      final_segment: first(row, ["segment", "site_zone", "zone"]) || "unassigned_zone",
    };
  });
}

function chooseFinal(rows, minCount, softMaxCount, maxCount, clusterRadius) {
  const annotated = annotateRows(rows).sort((a, b) => b.final_quality - a.final_quality);
  const selected = [];
  const selectedKeys = new Set();
  const mandatoryTarget = Math.min(minCount, rows.length);
  const microzoneRadius = Math.max(clusterRadius, 4.0);

  function canPick(row, strict = true, phase = "mandatory") {
    if (selectedKeys.has(rowKey(row))) return false;
    const sameRoleCount = selected.filter((s) => s.final_role === row.final_role).length;
    const sameGroupCount = selected.filter((s) => roleGroup(s.final_role) === roleGroup(row.final_role)).length;
    const pairCount = selected.filter((s) => isInteractionPair(s)).length;
    if (phase === "mandatory") {
      if (row.final_role === "charged_anchor" && sameRoleCount >= 1) return false;
      if (sameGroupCount >= 2) return false;
      if (isInteractionPair(row) && pairCount >= 1) return false;
    } else {
      if (row.final_role === "charged_anchor" && sameRoleCount >= 2) return false;
      if (isInteractionPair(row) && pairCount >= 1) return false;
    }
    if (!strict) return true;
    return !selected.some((s) => {
      const sameRole = s.final_role === row.final_role;
      const sameSegment = s.final_segment === row.final_segment;
      const sameGroup = roleGroup(s.final_role) === roleGroup(row.final_role);
      return ((sameRole || sameSegment) && dist(s, row) < microzoneRadius) || (sameGroup && sameSegment && dist(s, row) < microzoneRadius + 1.0);
    });
  }

  function pick(row, tier) {
    selected.push({ ...row, final_selection_tier: tier });
    selectedKeys.add(rowKey(row));
  }

  function pickBest(predicate, tier, phase = "mandatory") {
    const preferred = annotated.find((r) => predicate(r) && !isInteractionPair(r) && canPick(r, true, phase));
    const row = preferred || annotated.find((r) => predicate(r) && canPick(r, true, phase));
    if (row) pick(row, tier);
  }

  pickBest((r) => ["charged_anchor", "polar_gate"].includes(r.final_role), "primary_anchor");
  pickBest((r) => ["hydrophobic_lock", "aromatic_wall"].includes(r.final_role), "shape_lock");
  pickBest((r) => ["direction_gate", "mixed_boundary"].includes(r.final_role), "direction_or_boundary");

  const coveredSegments = new Set(selected.map((r) => r.final_segment));
  for (const row of annotated) {
    if (selected.length >= mandatoryTarget) break;
    if (!coveredSegments.has(row.final_segment) && canPick(row, true, "mandatory")) {
      pick(row, "segment_coverage");
      coveredSegments.add(row.final_segment);
    }
  }

  function addsIndependentInformation(row) {
    const roles = new Set(selected.map((r) => r.final_role));
    const segments = new Set(selected.map((r) => r.final_segment));
    const selectedHasShape = selected.some((r) => ["hydrophobic_lock", "aromatic_wall"].includes(r.final_role));
    const selectedHasPolarDirection = selected.some((r) => ["charged_anchor", "polar_gate", "direction_gate"].includes(r.final_role));
    const rowIsShape = ["hydrophobic_lock", "aromatic_wall"].includes(row.final_role);
    const rowIsPolarDirection = ["charged_anchor", "polar_gate", "direction_gate"].includes(row.final_role);
    return (
      !roles.has(row.final_role) ||
      !segments.has(row.final_segment) ||
      (!selectedHasShape && rowIsShape) ||
      (!selectedHasPolarDirection && rowIsPolarDirection)
    );
  }

  for (const row of annotated) {
    if (selected.length >= mandatoryTarget) break;
    if (canPick(row, true, "mandatory")) pick(row, "mandatory_backfill");
  }

  for (const row of annotated) {
    if (selected.length >= softMaxCount) break;
    if (!addsIndependentInformation(row)) continue;
    if (canPick(row, true, "optional")) pick(row, "optional_independent_evidence");
  }

  const uniqueSegments = new Set(annotated.map((r) => r.final_segment)).size;
  const extendedSiteEvidence = uniqueSegments >= 4;
  if (extendedSiteEvidence) {
    for (const row of annotated) {
      if (selected.length >= maxCount) break;
      if (!addsIndependentInformation(row)) continue;
      if (canPick(row, true, "optional")) pick(row, "optional_extended_site_evidence");
    }
  }

  for (const row of annotated) {
    if (selected.length >= Math.min(mandatoryTarget, rows.length)) break;
    if (canPick(row, false, "mandatory")) pick(row, "minimum_backfill");
  }

  const finalSelected = selected
    .slice(0, maxCount)
    .sort((a, b) => {
      const ao = String(a.final_selection_tier || "").startsWith("optional") ? 1 : 0;
      const bo = String(b.final_selection_tier || "").startsWith("optional") ? 1 : 0;
      if (ao !== bo) return ao - bo;
      const at = num(first(a, ["axis_t"]));
      const bt = num(first(b, ["axis_t"]));
      if (at != null && bt != null && at !== bt) return at - bt;
      return b.final_quality - a.final_quality;
    })
    .map((row, index) => ({
      ...row,
      final_rank: index + 1,
      mandatory_or_optional: String(row.final_selection_tier || "").startsWith("optional") ? "optional" : "mandatory",
    }));

  const finalKeys = new Set(finalSelected.map(rowKey));
  const rejected = annotated
    .filter((row) => !finalKeys.has(rowKey(row)))
    .map((row) => ({
      ...row,
      rejection_reason: "duplicate_or_lower_priority_same_microzone_or_role",
    }));

  return { selected: finalSelected, rejected };
}

function writeCsv(file, rows, originalHeaders, extraHeaders) {
  const headers = [...extraHeaders, ...originalHeaders.filter((h) => !extraHeaders.includes(h))];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

function writeSummary(file, args, selected, rejected) {
  const mandatory = selected.filter((row) => row.mandatory_or_optional === "mandatory");
  const optional = selected.filter((row) => row.mandatory_or_optional === "optional");
  const roleCounts = selected.reduce((acc, row) => {
    acc[row.final_role] = (acc[row.final_role] || 0) + 1;
    return acc;
  }, {});
  const warnings = [];
  if (selected.length < args.min) warnings.push("Selected fewer than the requested minimum because the input candidate pool was too small.");
  if (!selected.some((r) => ["hydrophobic_lock", "aromatic_wall"].includes(r.final_role))) {
    warnings.push("No hydrophobic/aromatic shape lock was selected; review whether the pocket is over-polarized or the candidate parser missed Hyd/Aro features.");
  }
  if (!selected.some((r) => ["charged_anchor", "polar_gate", "direction_gate"].includes(r.final_role))) {
    warnings.push("No directional polar/charged gate was selected; review orientation constraints before screening.");
  }

  const lines = [
    "# Final Core Pharmacophore Compression Summary",
    "",
    `Input: ${args.input}`,
    `Selected final core features: ${selected.length}`,
    `Mandatory features: ${mandatory.length}`,
    `Optional features: ${optional.length}`,
    `Rejected candidate features: ${rejected.length}`,
    `Target range: ${args.min}-${args.max}`,
    `Soft maximum without extended-site evidence: ${args.softMax}`,
    "",
    "## Role Counts",
    "",
    ...Object.entries(roleCounts).map(([role, count]) => `- ${role}: ${count}`),
    "",
    "## Selected Features",
    "",
    ...selected.map(
      (row) =>
        `${row.final_rank}. ${first(row, ["feature_id", "id"]) || `row_${row.__source_index}`} | ${row.mandatory_or_optional} | ${row.final_role} | ${row.final_selection_tier} | ${row.final_rationale}`,
    ),
  ];
  if (warnings.length) {
    lines.push("", "## Warnings", "", ...warnings.map((w) => `- ${w}`));
  }
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

function main() {
  const args = parseArgs(process.argv);
  const input = path.resolve(args.input);
  const outDir = path.resolve(args.outDir);
  const { headers, rows } = readCsv(input);
  if (!rows.length) throw new Error(`No candidate rows found in ${input}`);
  fs.mkdirSync(outDir, { recursive: true });
  const { selected, rejected } = chooseFinal(rows, args.min, args.softMax, args.max, args.clusterRadius);
  const extra = [
    "final_rank",
    "final_role",
    "final_selection_tier",
    "mandatory_or_optional",
    "final_quality",
    "final_segment",
    "final_rationale",
    "rejection_reason",
  ];
  writeCsv(path.join(outDir, "final_core_features.csv"), selected, headers, extra);
  writeCsv(path.join(outDir, "final_mandatory_features.csv"), selected.filter((row) => row.mandatory_or_optional === "mandatory"), headers, extra);
  writeCsv(path.join(outDir, "final_optional_features.csv"), selected.filter((row) => row.mandatory_or_optional === "optional"), headers, extra);
  writeCsv(path.join(outDir, "final_core_rejected.csv"), rejected, headers, extra);
  writeSummary(path.join(outDir, "final_core_summary.md"), args, selected, rejected);
  console.log(`Selected ${selected.length} final core features -> ${path.join(outDir, "final_core_features.csv")}`);
}

main();
