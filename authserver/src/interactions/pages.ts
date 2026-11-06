import { identityBrand } from './identity-brand.js';
export const escape = (v: unknown) =>
  (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
    ? String(v)
    : ''
  ).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export const input = (
  name: string,
  label: string,
  type = 'text',
  required = true,
) =>
  `<label>${escape(label)}<input name="${escape(name)}" type="${type}" ${required ? 'required' : ''} autocomplete="${type === 'password' ? 'current-password' : 'off'}"></label>`;
export function page(title: string, content: string) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} — TALA</title><link rel="stylesheet" href="/identity.css"></head><body><aside class="identity-scene" aria-label="Bienvenue sur TALA"><div><span class="scene-label">TALA · CHAQUE REGARD COMPTE</span><h2>Des regards.<br>Des liens.<br><span>Des histoires.</span></h2><p>Un espace pour vos voix,<br>vos idées et ce qui vous anime.</p></div><span class="scene-signature">Le prochain regard pourrait être le vôtre.</span></aside><main><a class="brand" href="/" aria-label="TALA, accueil">${identityBrand}<span>TALA</span></a><h1>${escape(title)}</h1>${content}<footer>Chaque regard compte.</footer></main></body></html>`;
}
export const form = (
  action: string,
  csrf: string,
  content: string,
  submit: string,
) =>
  `<form method="post" action="${escape(action)}"><input type="hidden" name="csrf" value="${escape(csrf)}">${content}<button>${escape(submit)}</button></form>`;
export const css = `
:root{color-scheme:dark;--background:#0e1012;--surface:#191b1e;--raised:#242629;--text:#fff;--secondary:#a4a4a8;--accent:#ffc64b;--on-accent:#0e1012;--border:#303236;--control-border:#657080;--danger:#ff9db2;--radius:10px}
*{box-sizing:border-box}
body{display:grid;grid-template-columns:1fr 1fr;min-height:100dvh;font:16px/1.6 Inter,"Segoe UI",sans-serif;background:var(--background);color:var(--text);margin:0;padding:24px}
main{width:100%;max-width:500px;margin:auto;align-self:center;padding:40px;background:var(--surface);border:1px solid var(--border);border-radius:20px}
.brand{display:inline-flex;gap:8px;align-items:center;color:var(--text);text-decoration:none;font-family:"Plus Jakarta Sans",Inter,"Segoe UI",sans-serif;font-size:28px;font-weight:800;letter-spacing:-1px}
.brand svg{width:44px;height:44px;flex-shrink:0}
h1{font-family:"Plus Jakarta Sans",Inter,"Segoe UI",sans-serif;font-size:30px;line-height:1.2;margin:32px 0 24px;letter-spacing:-.7px;overflow-wrap:anywhere}
label{display:block;font-size:14px;font-weight:600;margin:20px 0}
input{display:block;font:inherit;color:var(--text);margin-top:8px;padding:12px;width:100%;min-height:48px;border:1px solid var(--control-border);border-radius:var(--radius);background:var(--background);accent-color:var(--accent)}
input::placeholder{color:var(--secondary);opacity:1}
button,.button{display:inline-flex;align-items:center;justify-content:center;font:inherit;font-weight:650;min-height:48px;padding:12px 20px;background:var(--accent);color:var(--on-accent);border:1px solid transparent;border-radius:var(--radius);cursor:pointer;text-align:center;text-decoration:none}
button:hover,.button:hover{background:#ffda85}
button:disabled{opacity:.65;cursor:not-allowed}
form button{width:100%;margin-top:12px}
a{color:var(--accent);text-underline-offset:4px}
pre{white-space:pre-wrap;overflow-wrap:anywhere}
nav{display:flex;flex-wrap:wrap;gap:12px 16px;margin:24px 0}
nav a{font-size:14px;min-height:44px;display:inline-flex;align-items:center}
form{margin:24px 0}
small,footer{color:var(--secondary);font-size:13px}
footer{margin-top:32px;padding-top:20px;border-top:1px solid var(--border)}
:focus-visible{outline:3px solid var(--accent);outline-offset:4px}
[role=alert]{color:var(--danger)}
::selection{background:var(--accent);color:var(--on-accent)}
.identity-scene{position:relative;display:flex;flex-direction:column;justify-content:center;min-height:calc(100dvh - 48px);padding:8vw;border-right:1px solid var(--border)}
.scene-label{font-size:10px;font-weight:700;letter-spacing:2px;color:#b7a58c}
.identity-scene h2{font-size:clamp(42px,5vw,76px);line-height:1.08;letter-spacing:-3px;margin:40px 0 28px;font-weight:750}
.identity-scene h2 span{color:#f5913c}
.identity-scene p{font-size:16px;line-height:1.8;color:var(--secondary)}
.scene-signature{position:absolute;bottom:28px;font-size:11px;color:var(--secondary)}
main{border-top:2px solid #f5913c;box-shadow:0 24px 80px #0003}
@media(max-width:1000px){.identity-scene{padding:4vw}main{padding:28px;max-width:440px}.identity-scene h2{letter-spacing:-2px}}
@media(max-width:760px){body{display:block;padding:24px}.identity-scene{display:none}main{margin:5vh auto;max-width:500px}}
@media(max-width:600px){body{padding:12px}main{padding:24px;margin:12px auto}h1{font-size:28px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
`;
