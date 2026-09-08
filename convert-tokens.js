/**
 * Provly Design Tokens to CSS Variables Converter
 * ==============================================================================
 * 
 * Description:
 *   A Node.js script that parses the Provly Figma Design System tokens JSON file
 *   (`provly-design-tokens.tokens.json`) and converts all tokens into clean,
 *   modular CSS Custom Properties (CSS Variables).
 * 
 * Color System Architecture:
 *   - Primitive Colors: The underlying foundational color palette (e.g., primary 50,
 *     secondary 90, key colors). These represent base brand values and MUST NOT be
 *     applied directly to UI components.
 *   - Color Roles: The semantic color abstraction layer (e.g., primary, on-primary,
 *     surface, container). UI components consume Color Roles, which reference
 *     Primitive Colors via `var(--primitive-...)`.
 * 
 * Usage:
 *   node convert-tokens.js [options]
 * 
 * Options:
 *   --input, -i <path>       Path to design tokens JSON (default: ./provly-design-tokens.tokens.json)
 *   --output, -o <path>      Path to output CSS file (default: ./provly-tokens.css)
 *   --use-rem                Convert pixel values to rem units (default: false)
 *   --rem-base <number>      Base px for rem calculation (default: 16)
 *   --resolve-raw            Output raw color values for roles instead of var() aliases (default: false)
 *   --help, -h               Display help instructions
 */

const fs = require('fs');
const path = require('path');

// Parse CLI Arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    input: './provly-design-tokens.tokens.json',
    output: './provly-tokens.css',
    useRem: false,
    remBase: 16,
    resolveRaw: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--input' || arg === '-i') {
      options.input = args[++i];
    } else if (arg === '--output' || arg === '-o') {
      options.output = args[++i];
    } else if (arg === '--use-rem') {
      options.useRem = true;
    } else if (arg === '--rem-base') {
      options.remBase = parseFloat(args[++i]) || 16;
    } else if (arg === '--resolve-raw') {
      options.resolveRaw = true;
    }
  }

  return options;
}

// Display CLI Help
function showHelp() {
  console.log(`
Provly Design Tokens to CSS Variables Converter
------------------------------------------------
Usage:
  node convert-tokens.js [options]

Options:
  -i, --input <path>      Path to design tokens JSON (default: ./provly-design-tokens.tokens.json)
  -o, --output <path>     Path to output CSS file (default: ./provly-tokens.css)
  --use-rem               Convert dimensions to rem units
  --rem-base <number>     Base px for rem calculation (default: 16)
  --resolve-raw           Output resolved raw hex/rgba values for color roles instead of CSS var() aliases
  -h, --help              Show this help menu
`);
}

// Utility: Convert string to clean kebab-case slug
function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Utility: Convert 8-digit hex (#RRGGBBAA) or 6-digit hex (#RRGGBB) to hex or rgba()
function formatColor(hex) {
  if (typeof hex !== 'string' || !hex.startsWith('#')) return hex;
  const clean = hex.replace('#', '');
  if (clean.length === 8) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    const aVal = parseInt(clean.substring(6, 8), 16);
    if (aVal === 255) {
      return '#' + clean.substring(0, 6);
    }
    const a = Math.round((aVal / 255) * 100) / 100;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return hex;
}

// Utility: Format dimension values (px or rem)
function formatDimension(value, useRem, remBase) {
  if (typeof value !== 'number') return value;
  if (value === 0) return '0';
  if (useRem) {
    const remVal = Math.round((value / remBase) * 1000) / 1000;
    return `${remVal}rem`;
  }
  return `${value}px`;
}

// Utility: Parse a drop shadow object into CSS box-shadow format
function formatShadow(shadowObj, useRem, remBase) {
  if (!shadowObj) return '';
  const offsetX = formatDimension(shadowObj.offsetX || 0, useRem, remBase);
  const offsetY = formatDimension(shadowObj.offsetY || 0, useRem, remBase);
  const radius = formatDimension(shadowObj.radius || 0, useRem, remBase);
  const spread = formatDimension(shadowObj.spread || 0, useRem, remBase);
  const color = formatColor(shadowObj.color || '#000000');
  return `${offsetX} ${offsetY} ${radius} ${spread} ${color}`;
}

// Main Conversion Function
function convertTokens(options) {
  const inputPath = path.resolve(options.input);
  const outputPath = path.resolve(options.output);

  if (!fs.existsSync(inputPath)) {
    console.error(`[Error] Input file not found at: ${inputPath}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(inputPath, 'utf8');
  let tokensData;
  try {
    tokensData = JSON.parse(rawData);
  } catch (err) {
    console.error(`[Error] Failed to parse JSON in ${inputPath}:`, err.message);
    process.exit(1);
  }

  // Registry maps for reference resolution
  const pathMap = new Map(); // jsonPath -> { varName, rawValue, node, category }
  const categoryBlocks = {
    primitives: [],
    provlyPrimitives: [],
    colorRoles: [],
    provlyColorRoles: [],
    spacing: [],
    provlySpacing: [],
    borderRadius: [],
    effects: [],
    typography: []
  };

  // Helper: Determine category block key
  function getCategoryKey(pathArr) {
    const top = pathArr[0].toLowerCase();
    if (top.includes('primitives') && top.includes('colors')) return 'primitives';
    if (top.includes('provly - primitives')) return 'provlyPrimitives';
    if (top === 'color roles') return 'colorRoles';
    if (top === 'provly color roles') return 'provlyColorRoles';
    if (top === 'spacing collection') return 'spacing';
    if (top === 'provly spacing collection') return 'provlySpacing';
    if (top === 'provly border radius') return 'borderRadius';
    if (top === 'effect') return 'effects';
    if (top === 'typography') return 'typography';
    return 'other';
  }

  // Helper: Build CSS variable name from path array
  function createVarName(pathArr) {
    const top = pathArr[0].toLowerCase();
    let prefix = 'token';
    let remaining = pathArr.slice(1);

    if (top === 'primitives  colors collection') {
      prefix = 'primitive-color';
    } else if (top === 'provly - primitives') {
      prefix = 'provly-primitive';
    } else if (top === 'color roles') {
      prefix = 'color-role';
    } else if (top === 'provly color roles') {
      prefix = 'provly-role';
    } else if (top === 'spacing collection') {
      prefix = 'spacing';
    } else if (top === 'provly spacing collection') {
      prefix = 'provly-spacing';
    } else if (top === 'provly border radius') {
      prefix = 'provly-radius';
    } else if (top === 'effect') {
      prefix = 'effect';
    } else if (top === 'typography') {
      prefix = 'typography';
    }

    const restSlug = remaining.map(slugify).filter(Boolean).join('-');
    return `--${prefix}${restSlug ? '-' + restSlug : ''}`;
  }

  // First Pass: Catalog all tokens and map JSON path to CSS variable names
  function catalogTokens(obj, pathArr = []) {
    for (const [key, val] of Object.entries(obj)) {
      if (!val || typeof val !== 'object') continue;

      const currentPath = [...pathArr, key];
      const jsonPathStr = currentPath.join('.');

      // Check if multi-layer shadow object (keys '0', '1', ...)
      if (val['0'] && val['0'].type === 'custom-shadow') {
        const varName = createVarName(currentPath);
        pathMap.set(jsonPathStr, { varName, rawValue: val, type: 'multi-shadow', pathArr: currentPath });
        continue;
      }

      // Check if single token object with a value property
      if (val.value !== undefined || val.type !== undefined) {
        const varName = createVarName(currentPath);
        pathMap.set(jsonPathStr, { varName, rawValue: val.value, type: val.type, pathArr: currentPath, node: val });
        continue;
      }

      // Check if Typography composite token (contains fontSize, fontFamily, etc.)
      if (val.fontSize && val.fontFamily) {
        const varName = createVarName(currentPath);
        pathMap.set(jsonPathStr, { varName, rawValue: val, type: 'typography-composite', pathArr: currentPath });
        continue;
      }

      // Recurse into nested structures
      catalogTokens(val, currentPath);
    }
  }

  catalogTokens(tokensData);

  // Helper: Resolve reference alias like "{primitives  colors collection.key colors group.primary key color}"
  function resolveRef(refStr) {
    if (typeof refStr !== 'string' || !refStr.startsWith('{') || !refStr.endsWith('}')) {
      return null;
    }
    const targetPath = refStr.slice(1, -1);
    return pathMap.get(targetPath) || null;
  }

  // Second Pass: Process each token entry and output CSS variable declarations
  for (const [jsonPathStr, item] of pathMap.entries()) {
    const category = getCategoryKey(item.pathArr);
    const varName = item.varName;
    let cssLines = [];

    // Case 1: Typography Composite Token
    if (item.type === 'typography-composite') {
      const topo = item.rawValue;
      const fontSize = formatDimension(topo.fontSize?.value || 16, options.useRem, options.remBase);
      const lineHeight = formatDimension(topo.lineHeight?.value || 24, options.useRem, options.remBase);
      const letterSpacing = formatDimension(topo.letterSpacing?.value || 0, options.useRem, options.remBase);
      const fontFamily = topo.fontFamily?.value ? `'${topo.fontFamily.value}', sans-serif` : 'sans-serif';
      const fontWeight = topo.fontWeight?.value || 400;
      const fontStyle = topo.fontStyle?.value || 'normal';

      cssLines.push(`  ${varName}-font-size: ${fontSize};`);
      cssLines.push(`  ${varName}-line-height: ${lineHeight};`);
      cssLines.push(`  ${varName}-font-family: ${fontFamily};`);
      cssLines.push(`  ${varName}-font-weight: ${fontWeight};`);
      cssLines.push(`  ${varName}-font-style: ${fontStyle};`);
      cssLines.push(`  ${varName}-letter-spacing: ${letterSpacing};`);
      // Shorthand composite variable
      cssLines.push(`  ${varName}: ${fontStyle} ${fontWeight} ${fontSize}/${lineHeight} ${fontFamily};`);
    }

    // Case 2: Multi-Layer Shadow Object
    else if (item.type === 'multi-shadow') {
      const layers = [];
      for (const k of Object.keys(item.rawValue)) {
        if (!isNaN(parseInt(k)) && item.rawValue[k].value) {
          layers.push(formatShadow(item.rawValue[k].value, options.useRem, options.remBase));
        }
      }
      const shadowCss = layers.join(', ');
      cssLines.push(`  ${varName}: ${shadowCss};`);
    }

    // Case 3: Single Shadow Token
    else if (item.type === 'custom-shadow') {
      const shadowCss = formatShadow(item.rawValue, options.useRem, options.remBase);
      cssLines.push(`  ${varName}: ${shadowCss};`);
    }

    // Case 4: Color Token or Alias Reference
    else if (item.type === 'color' || typeof item.rawValue === 'string') {
      const rawVal = item.rawValue;
      const resolvedTarget = resolveRef(rawVal);

      if (resolvedTarget) {
        if (options.resolveRaw) {
          // Resolve to final raw color value
          let curr = resolvedTarget;
          while (curr && typeof curr.rawValue === 'string' && curr.rawValue.startsWith('{')) {
            curr = resolveRef(curr.rawValue);
          }
          const finalVal = curr ? formatColor(curr.rawValue) : rawVal;
          cssLines.push(`  ${varName}: ${finalVal}; /* Alias to ${resolvedTarget.varName} */`);
        } else {
          // Output semantic var() reference
          cssLines.push(`  ${varName}: var(${resolvedTarget.varName});`);
        }
      } else {
        const parsedColor = formatColor(rawVal);
        cssLines.push(`  ${varName}: ${parsedColor};`);
      }
    }

    // Case 5: Dimension Token (Spacing, Radius)
    else if (item.type === 'dimension' || typeof item.rawValue === 'number') {
      const dimVal = formatDimension(item.rawValue, options.useRem, options.remBase);
      cssLines.push(`  ${varName}: ${dimVal};`);
    }

    // Case 6: Fallback for generic tokens
    else {
      cssLines.push(`  ${varName}: ${item.rawValue};`);
    }

    if (categoryBlocks[category]) {
      categoryBlocks[category].push(...cssLines);
    } else {
      categoryBlocks.primitives.push(...cssLines);
    }
  }

  // Construct Final CSS File Content with Clear Architectural Documentation
  const cssContent = `/**
 * Provly Design System - Generated CSS Variables
 * ==============================================================================
 * Source File: ${path.basename(options.input)}
 * Generated At: ${new Date().toISOString()}
 * 
 * ARCHITECTURAL GUIDELINES & USAGE INSTRUCTIONS:
 * ------------------------------------------------------------------------------
 * 1. PRIMITIVE COLORS (Foundation Layer):
 *    - Prefixed with \`--primitive-color-\` and \`--provly-primitive-\`.
 *    - These are the foundational palette values (e.g. key colors, shade scales).
 *    - DO NOT apply primitive color variables directly to UI components.
 * 
 * 2. COLOR ROLES (Semantic Layer):
 *    - Prefixed with \`--color-role-\` and \`--provly-role-\`.
 *    - These are functional semantic tokens (e.g. primary, on-primary, surface, container).
 *    - ALWAYS use Color Roles in UI component styling (e.g., \`color: var(--provly-role-on-primary);\`).
 *    - Color Roles automatically map to Primitive Colors via CSS \`var(...)\` references.
 * 
 * 3. SPACING & RADIUS:
 *    - Prefixed with \`--spacing-\`, \`--provly-spacing-\`, and \`--provly-radius-\`.
 *    - Use for margins, paddings, gap, and border-radius properties.
 * 
 * 4. TYPOGRAPHY & SHADOWS:
 *    - Typography tokens provide both individual properties (-font-size, -line-height)
 *      and composite font shorthands (\`font: var(--typography-provly-body-medium);\`).
 *    - Shadow tokens provide drop-shadow values for \`box-shadow\`.
 * ==============================================================================
 */

:root {
  /* ==========================================================================
     1. BASE PRIMITIVE COLORS (Foundation - Do NOT apply directly to UI)
     ========================================================================== */
${categoryBlocks.primitives.join('\n')}

  /* ==========================================================================
     2. PROVLY BRAND PRIMITIVE COLORS (Foundation - Do NOT apply directly to UI)
     ========================================================================== */
${categoryBlocks.provlyPrimitives.join('\n')}

  /* ==========================================================================
     3. BASE SEMANTIC COLOR ROLES (UI Implementation Layer)
     ========================================================================== */
${categoryBlocks.colorRoles.join('\n')}

  /* ==========================================================================
     4. PROVLY SEMANTIC COLOR ROLES (UI Implementation Layer)
     ========================================================================== */
${categoryBlocks.provlyColorRoles.join('\n')}

  /* ==========================================================================
     5. SPACING COLLECTIONS
     ========================================================================== */
${categoryBlocks.spacing.join('\n')}

${categoryBlocks.provlySpacing.join('\n')}

  /* ==========================================================================
     6. BORDER RADIUS
     ========================================================================== */
${categoryBlocks.borderRadius.join('\n')}

  /* ==========================================================================
     7. EFFECTS & DROP SHADOWS
     ========================================================================== */
${categoryBlocks.effects.join('\n')}

  /* ==========================================================================
     8. TYPOGRAPHY STYLES
     ========================================================================== */
${categoryBlocks.typography.join('\n')}
}
`;

  // Write CSS File
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, cssContent, 'utf8');
  console.log(`\n[Success] Converted ${pathMap.size} design tokens to CSS variables.`);
  console.log(`[Output] Generated CSS file: ${outputPath}\n`);
}

// CLI Execution Entrypoint
if (require.main === module) {
  const options = parseArgs();
  if (options.help) {
    showHelp();
  } else {
    convertTokens(options);
  }
}

module.exports = {
  convertTokens,
  parseArgs,
  slugify,
  formatColor,
  formatDimension,
  formatShadow
};
