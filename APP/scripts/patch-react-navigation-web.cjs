/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
/*
 * React Navigation still passes pointerEvents as a View prop in the tab
 * scene. react-native-web 0.21 warns about that API and will eventually drop
 * it. Keep the behavior in style.pointerEvents, which works on Web and native.
 *
 * This is intentionally a small, version-guarded compatibility patch. If the
 * upstream implementation changes, fail loudly instead of silently shipping
 * the warning again.
 */
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-navigation',
  'bottom-tabs',
  'lib',
  'module',
  'views',
  'BottomTabView.js',
);

if (!fs.existsSync(file)) {
  console.log('[planet] React Navigation Web patch skipped: package not installed');
  process.exit(0);
}

const source = fs.readFileSync(file, 'utf8');
const prop = "          pointerEvents: isFocused ? 'box-none' : 'none',\n";
const style = `          style: [StyleSheet.absoluteFill, {
            zIndex: isFocused ? 0 : -1,
            pointerEvents: isFocused ? 'box-none' : 'none'
          }],`;
const oldStyle = `          style: [StyleSheet.absoluteFill, {
            zIndex: isFocused ? 0 : -1
          }],`;

if (!source.includes(prop)) {
  if (source.includes(style)) {
    console.log('[planet] React Navigation Web patch already applied');
    process.exit(0);
  }
  if (source.includes("pointerEvents: isFocused ? 'box-none' : 'none'")) {
    throw new Error('[planet] React Navigation Web patch shape changed; inspect BottomTabView.js');
  }
  console.log('[planet] React Navigation Web patch already applied or no longer needed');
  process.exit(0);
}

if (!source.includes(oldStyle)) {
  throw new Error('[planet] React Navigation Web patch could not find the expected scene style');
}

const patched = source.replace(oldStyle, style).replace(prop, '');
fs.writeFileSync(file, patched);
console.log('[planet] React Navigation Web pointerEvents compatibility patch applied');
