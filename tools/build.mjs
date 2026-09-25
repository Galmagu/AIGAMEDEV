// src/의 ES 모듈을 스크립트 하나로 묶어서 dist/gang-survivor.html 단일 파일을 만든다.
// 결과 파일은 서버 없이 더블클릭(file://)으로 열린다. 외부 의존성 없음.
//
//   node tools/build.mjs
//
// 우리 코드 스타일(한 줄 import, export const/function/class)만 처리하는 최소 번들러다.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'src/main.js');

const IMPORT_RE = /^import\s+(.+?)\s+from\s+['"](.+?)['"];?\s*$/gm;
const EXPORT_RE = /^export\s+(const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm;

const modules = new Map(); // 절대경로 → 변환된 코드
const order = [];

function load(file) {
  if (modules.has(file)) return;
  modules.set(file, null); // 순환 참조 방지 표시
  let src = readFileSync(file, 'utf8');

  const deps = [];
  src = src.replace(IMPORT_RE, (_, spec, from) => {
    const dep = resolve(dirname(file), from);
    deps.push(dep);
    const ref = `__mod[${JSON.stringify(key(dep))}]`;
    const ns = /^\*\s+as\s+(\w+)$/.exec(spec.trim());
    if (ns) return `const ${ns[1]} = ${ref};`;
    const names = spec.replace(/[{}]/g, '').split(',').map((s) => s.trim()).filter(Boolean)
      .map((s) => s.replace(/\s+as\s+/, ': '));
    return `const { ${names.join(', ')} } = ${ref};`;
  });
  for (const d of deps) load(d);

  const exported = [];
  src = src.replace(EXPORT_RE, (_, kind, name) => {
    exported.push(name);
    return `${kind} ${name}`;
  });

  modules.set(file, `// ── ${key(file)} ──\n__mod[${JSON.stringify(key(file))}] = (() => {\n${src}\nreturn { ${exported.join(', ')} };\n})();\n`);
  order.push(file);
}

function key(file) {
  return relative(root, file).split('\\').join('/');
}

load(entry);
const bundle = `(() => {\n'use strict';\nconst __mod = {};\n${order.map((f) => modules.get(f)).join('\n')}})();`;

const html = readFileSync(join(root, 'index.html'), 'utf8');
const tag = '<script type="module" src="src/main.js"></script>';
if (!html.includes(tag)) throw new Error('index.html에서 main.js script 태그를 못 찾음');
// replace에 함수를 넘겨야 번들 안의 $& 같은 패턴이 치환 문자로 해석되지 않는다
const out = html.replace(tag, () => `<script>\n${bundle.replace(/<\/script/g, '<\\/script')}\n</script>`);

mkdirSync(join(root, 'dist'), { recursive: true });
const outFile = join(root, 'dist/gang-survivor.html');
writeFileSync(outFile, out);
console.log(`built ${key(outFile)} (${order.length} modules, ${(out.length / 1024).toFixed(1)} KB)`);
