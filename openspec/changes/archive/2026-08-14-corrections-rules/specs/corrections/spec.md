# Corrections Specification

## Purpose

Always-on report rules from `corrections.md` and AGENTS.md: mechanical subset enforced by `scripts/validate-report.sh`; semantics manual/golden.

## Requirements

### Requirement: Bold format

List-section entries MUST bold only `**Producto (código, empaque)**`. (corrections.md: "el nombre del producto + códigos y empaques va en NEGRITA... el resto de la entrada queda sin negrita")

#### Scenario: Fixture passes

- GIVEN fixture, bold product names only (lines 10/12/16)
- WHEN checker runs
- THEN no bold violations

#### Scenario: Unbolded flagged

- GIVEN an entry with unbolded product name
- WHEN checker runs
- THEN prints bold rule id + line

### Requirement: Blank-line separation

List entries MUST be separated by at least one blank line. (corrections.md: "Entre cada entrada de las listas se deja una línea en blanco")

#### Scenario: Fixture passes

- GIVEN fixture, blank line between entries
- WHEN checker runs
- THEN no spacing violations

#### Scenario: Adjacent flagged

- GIVEN two adjacent entries, no blank line
- WHEN checker runs
- THEN prints spacing rule id + entry lines

### Requirement: Pitch limit

`## Pitch sugerido` MUST hold at most 5 non-empty lines, header to EOF. (corrections.md: "El pitch sugerido nunca debe superar las 5 líneas")

#### Scenario: Fixture passes

- GIVEN fixture pitch, 3 non-empty lines (24-26)
- WHEN checker runs
- THEN no pitch violation

#### Scenario: Oversized pitch

- GIVEN a pitch with 6 non-empty lines
- WHEN checker runs
- THEN prints pitch rule id + first line

### Requirement: Price/cost ban

Reports MUST NOT contain `precio` `mayoreo` `descuento` `costo` `$` `pesos` `barato` `ahorro`; sole exception: work-saving sense (`ahorro de trabajo en cocina`). Justification MUST rest only on need + convenience. (corrections.md: "NUNCA deben mencionar 'precio de mayoreo', descuentos, ahorro, ni ningún término de costo")

#### Scenario: Work-saving allowed

- GIVEN fixture line 12 "ahorran trabajo en cocina"
- WHEN checker runs
- THEN exception accepted

#### Scenario: Price claim

- GIVEN a line containing "precio de mayoreo"
- WHEN checker runs
- THEN prints word-ban rule id + line

### Requirement: Explicitness marks

Each `Productos a ofrecer` entry MUST show exactly one mark, `(explícito)`/`(inferido)`. (AGENTS.md: "Esta marca debe aparecer en el texto visible del reporte final")

#### Scenario: Fixture passes

- GIVEN fixture, `(explícito)` line 10, `(inferido)` line 12
- WHEN checker runs
- THEN no mark violation

#### Scenario: Missing mark

- GIVEN an entry with neither mark
- WHEN checker runs
- THEN prints marks rule id + line

### Requirement: Salsa de tomate no-match

Menu "salsa de tomate" MUST NOT match catalog "puré de tomate concentrado". Semantic; manual/golden. (corrections.md: ""salsa de tomate" en un menú NUNCA matchea con "puré de tomate concentrado"")

#### Scenario: Golden manual verification

- GIVEN a golden report of a salsa de tomate menu
- WHEN a human verifies matching
- THEN no product matches "salsa de tomate"

### Requirement: Marking judgment

`(explícito)`/`(inferido)` is a semantic judgment; inferred MUST NOT be presented as confirmed. Manual/golden. (AGENTS.md: "marca como 'inferido' (no confirmado) cualquier ingrediente que no esté explícito")

#### Scenario: Golden marks reviewed

- GIVEN a golden report with dish-level marks
- WHEN a human checks each mark vs menu text
- THEN every `(inferido)` is absent from its dish name/description
- AND every `(explícito)` is present

### Requirement: Rule drift guard

Every `corrections.md` rule MUST map to ≥1 requirement with scenario, and vice-versa (source: corrections.md or AGENTS.md). (corrections.md: "Estas reglas se aplican SIEMPRE... son obligatorias")

#### Scenario: Bidirectional coverage

- GIVEN current corrections.md (5 rules)
- WHEN a reviewer maps each rule
- THEN each rule has ≥1 requirement + scenario
- AND each requirement maps back to its source

### Requirement: Checker privacy

`scripts/validate-report.sh` MUST print only rule ids + line numbers; MUST NOT print report content, names, or excerpts.

#### Scenario: Ids only

- GIVEN a report with violations
- WHEN checker runs
- THEN output holds only ids + line numbers
