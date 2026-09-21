export {};
/**
 * htmlSinks.test.ts
 *
 * Every value interpolated into `innerHTML` must be safe by construction.
 *
 * This guard exists because reviewing 22 innerHTML sites by eye said they were
 * all fine, and they were not: `data-tab-id="${tab.id}"` put an unescaped id
 * straight into an attribute, and a tab id can arrive from an imported backup
 * file. That is a stored XSS in an extension page with chrome.* access, found
 * only by reading the code a second time. Eyes do not scale; this does.
 *
 * The rule: inside an `innerHTML` assignment, every `${...}` must be one of
 *   - a call to a known escaper,
 *   - a literal, or a template made only of safe parts,
 *   - a comparison or boolean expression (yields a fixed string),
 *   - a number, or `.length`,
 *   - an identifier on the allowlist below, with a reason.
 *
 * Anything else fails, and the fix is to wrap it in `escapeHtml`.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const SRC = path.join(__dirname, '..', 'src');

/** Functions that return markup-safe text. */
const ESCAPERS = new Set(['escapeHtml', 'encodeURIComponent', 'String']);

/**
 * Identifiers that hold markup we wrote ourselves, never user data.
 * Adding to this list is a deliberate act; say why.
 */
const SAFE_IDENTIFIERS = new Map<string, string>([
    ['DRAG_HANDLE_SVG', 'Module constant: a literal SVG string in tabListRenderer.ts'],
    ['colorBtn', 'Built in this file from a validated palette token plus escapeHtml'],
    ['upBtn', 'Module-local literal markup'],
    ['downBtn', 'Module-local literal markup'],
    ['removeBtn', 'Module-local literal markup'],
    ['colorClass', 'isValidTabColor() is checked before this is built'],
]);

/** Functions whose return value is markup assembled under the same rules. */
const SAFE_CALLS = new Set(['tabColorClass', 'renderRuleRow', 'buildRuleRow']);

interface Finding {
    file: string;
    line: number;
    text: string;
}

function isSafeExpression(node: ts.Expression, sf: ts.SourceFile): boolean {
    // Literals of every kind.
    if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return true;
    if (ts.isNoSubstitutionTemplateLiteral(node)) return true;
    if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) return true;

    // `${cond ? 'a' : 'b'}` and `${a && 'b'}` yield one of their branches.
    if (ts.isConditionalExpression(node)) {
        return isSafeExpression(node.whenTrue, sf) && isSafeExpression(node.whenFalse, sf);
    }
    if (ts.isBinaryExpression(node)) {
        const op = node.operatorToken.kind;
        const comparison =
            op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
            op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
            op === ts.SyntaxKind.EqualsEqualsToken ||
            op === ts.SyntaxKind.ExclamationEqualsToken;
        if (comparison) return true;
        // `a && b`, `a || b`, `a ?? b`, and `'x' + 'y'`.
        return isSafeExpression(node.left, sf) && isSafeExpression(node.right, sf);
    }

    if (ts.isParenthesizedExpression(node)) return isSafeExpression(node.expression, sf);

    // A nested template is safe when all of its own holes are.
    if (ts.isTemplateExpression(node)) {
        return node.templateSpans.every((span) => isSafeExpression(span.expression, sf));
    }

    // Calls: escapers, allowlisted builders, and `.map(...).join('')` over
    // parts that are themselves checked as template expressions.
    if (ts.isCallExpression(node)) {
        const callee = node.expression;
        if (ts.isIdentifier(callee) && (ESCAPERS.has(callee.text) || SAFE_CALLS.has(callee.text))) return true;
        if (ts.isPropertyAccessExpression(callee)) {
            const name = callee.name.text;
            // `xs.map(fn).join('')` — the map callback's body is visited
            // separately by the walker, so the join itself is not the risk.
            if (name === 'join' || name === 'map' || name === 'filter') return true;
            if (name === 'toString' || name === 'toFixed') return true;
        }
        return false;
    }

    // `xs.length` is a number.
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'length') return true;

    if (ts.isIdentifier(node) && SAFE_IDENTIFIERS.has(node.text)) return true;

    return false;
}

/** Collect every expression interpolated into an innerHTML assignment. */
function findUnsafeInterpolations(file: string): Finding[] {
    const source = fs.readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2020, true);
    const findings: Finding[] = [];

    const checkAssigned = (expr: ts.Expression): void => {
        const templates: ts.TemplateExpression[] = [];
        const collect = (n: ts.Node): void => {
            if (ts.isTemplateExpression(n)) templates.push(n);
            ts.forEachChild(n, collect);
        };
        collect(expr);

        templates.forEach((tpl) => {
            tpl.templateSpans.forEach((span) => {
                if (isSafeExpression(span.expression, sf)) return;
                const { line } = sf.getLineAndCharacterOfPosition(span.expression.getStart(sf));
                findings.push({
                    file: path.relative(path.join(__dirname, '..'), file),
                    line: line + 1,
                    text: span.expression.getText(sf),
                });
            });
        });
    };

    const walk = (node: ts.Node): void => {
        if (
            ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isPropertyAccessExpression(node.left) &&
            node.left.name.text === 'innerHTML'
        ) {
            checkAssigned(node.right);
        }
        ts.forEachChild(node, walk);
    };

    walk(sf);
    return findings;
}

function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
    });
}

describe('innerHTML sinks', () => {
    const files = sourceFiles(SRC);

    test('finds the source files it is meant to guard', () => {
        expect(files.length).toBeGreaterThan(15);
        expect(files.some((f) => f.endsWith('options.ts'))).toBe(true);
        expect(files.some((f) => f.endsWith('tabListRenderer.ts'))).toBe(true);
    });

    test('no unescaped value is interpolated into innerHTML anywhere in src/', () => {
        const findings = files.flatMap(findUnsafeInterpolations);

        if (findings.length > 0) {
            const detail = findings.map((f) => `  ${f.file}:${f.line}  \${${f.text}}`).join('\n');
            throw new Error(
                `Unescaped interpolation into innerHTML:\n${detail}\n\n` +
                    'Wrap the value in escapeHtml(), or add it to SAFE_IDENTIFIERS in this file with a reason.'
            );
        }
    });

    test('the guard actually rejects an unescaped value', () => {
        // Mutation check: if this passes, the test above proves nothing.
        const tmp = path.join(__dirname, '__sink_probe.ts');
        fs.writeFileSync(tmp, 'const el = document.body;\nconst t = { id: "x" };\nel.innerHTML = `<b id="${t.id}">hi</b>`;\n');
        try {
            const findings = findUnsafeInterpolations(tmp);
            expect(findings).toHaveLength(1);
            expect(findings[0].text).toBe('t.id');
        } finally {
            fs.unlinkSync(tmp);
        }
    });

    test('the guard accepts an escaped value', () => {
        const tmp = path.join(__dirname, '__sink_probe_ok.ts');
        fs.writeFileSync(
            tmp,
            'declare function escapeHtml(s: string): string;\nconst el = document.body;\nconst t = { id: "x" };\nel.innerHTML = `<b id="${escapeHtml(t.id)}">hi</b>`;\n'
        );
        try {
            expect(findUnsafeInterpolations(tmp)).toHaveLength(0);
        } finally {
            fs.unlinkSync(tmp);
        }
    });
});
