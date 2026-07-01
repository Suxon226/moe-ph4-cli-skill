# MOE SVL Error Reference

Detailed troubleshooting for SVL scripting and moebatch errors.

## 1. 'functionname' is undefined

```
Error: 'ph4_QueryOpen' is undefined
```

**Cause:** Missing forward declaration at top of .svl file.
**Fix:** Add `function ph4_QueryOpen;` before `function main []`.

```svl
// Wrong (no declarations)
function main []
    local q = ph4_QueryOpen [];
...

// Correct
function ph4_QueryOpen;
function main []
    local q = ph4_QueryOpen [];
...
```

## 2. Vector of wrong type

```
Error: Vector of wrong type
Function: moe_fwrite_ParaTable
File: io_moe.svl Line: 574
```

**Causes (multiple):**
- **aPos in loop (one-step):** `aPos atoms(idx)` fails in RPN. Use two-step.
- **Missing bitshl:** bitmask value not properly normalized.
- **ph4_SchemeBitsExpr returns empty:** missing guard `if not ex then continue;`.
- **String + number concat:** `'Count: ' + n` not supported. Use `print 'Count: '; print n;`.

```svl
// Fix aPos:
local ak = atoms(idx);    // step 1
local pos = aPos ak;      // step 2

// Fix expr guard:
local ex = ph4_SchemeBitsExpr [scheme, nb];
if not ex then continue; endif  // skip empty expressions
```

## 3. Expression is not a finite scalar number

**Cause:** Operation on NaN or wrong type value.
**Common triggers:** `max []` on empty vector, division by zero, passing atom keys where numbers expected.

## 4. Not a tagged vector (append_z)

**Cause:** Feature data not wrapped in `[[...]]`.
```svl
// Wrong
ph4_QueryCreateF [q, [pos:pos, rad:rad, expr:ex], []];

// Correct
ph4_QueryCreateF [q, [[pos:pos, rad:rad, expr:ex]], []];
```

## 5. Not a query (ph4_QueryOpen)

**Cause:** Wrong argument type passed to ph4_QueryOpen.
```svl
// Wrong
local qdata = ph4_QdataInit scheme;
local q = ph4_QueryOpen qdata;

// Correct
local q = ph4_QueryOpen [];
```

## 6. exit NYET (ph4_AnnotationPairs)

```
Error: exit NYET
Function: ph4_AnnotationPairs
```

**Cause:** Missing `rec:1` in `ph4_AnnotationRec` options.
```svl
// Wrong
local optR = [eatoms:atoms, excluded:[]];

// Correct
local optR = [rec:1, _sol:0, eatoms:atoms, excluded:[]];
```

## 7. 'xxx' previously defined

**Cause:** Duplicate `local` variable name in the same function.
SVL `local` is function-scoped. Cannot re-declare:

```svl
// Wrong
for i = 1, 10 loop ... endloop
for i = 1, 20 loop ... endloop  // 'i' previously defined

// Correct
for a = 1, 10 loop ... endloop
for b = 1, 20 loop ... endloop
```

## 8. Unterminated string

**Cause:** Multi-line string literal.
**Fix:** Keep all strings on one line; use `\n` for newlines:
```svl
print 'Line1\nLine2\n';
```

## 9. 'hex' is undefined / 'uniques' is undefined / 'rNumAtoms' is undefined

**Cause:** Trying to use functions that don't exist in MOE SVL.
SVL has a limited set of built-in functions. Check references/api_reference.md.

## 10. Expression has no effect

**Cause:** Chained indexing `vec(a)(b)`.
**Fix:** Use intermediate variable:
```svl
local inner = vec(a);
local val = inner(b);
// or: local val = vec(a); val = val(b);
```

## 11. Expected 'then' / syntax errors on operators

**Causes:**
- `!=` instead of `<>`
- `mod` not a built-in: use integer division `(a/b)*b == a` or remainder calc
- `&&` / `||` instead of `and` / `or`
- Missing `then` after `if`: must be `if cond then ... endif`

## 12. Expected ']' in vector literal

**Cause:** Space-separated elements in `[...]`.
**Fix:** Use commas:
```svl
// Wrong
[a b c]

// Correct
[a, b, c]
```

## 13. moebatch hangs or shows no output

**Causes:**
- Using `bin\moe.exe` (GUI stub) instead of `bin-win64\moebatch.exe`
- Missing `-run` flag
- License file absent or invalid
- Script has infinite loop (e.g., while without increment)

## 14. Error running file (no detail)

**Causes:**
- File path not found (check forward slashes)
- File not ASCII-encoded (use `Out-File -Encoding ASCII` from PowerShell)
- Wrong path separators (MOE SVL uses `/`, not `\`)

```powershell
# Correct encoding for .svl files
$content | Out-File "C:\path\script.svl" -Encoding ASCII
```
