import assert from 'node:assert/strict';
import { navigationTarget } from '../src/navigation.ts';

assert.equal(navigationTarget('https://webscraping-psi.vercel.app/api/me'), 'internal');
assert.equal(navigationTarget('about:srcdoc'), 'internal');
assert.equal(navigationTarget('https://www.impuls.com.mx/producto'), 'external');
assert.equal(navigationTarget('https://webscraping-psi.vercel.app.evil.test'), 'external');
assert.equal(navigationTarget('javascript:alert(1)'), 'blocked');
assert.equal(navigationTarget('file:///etc/passwd'), 'blocked');
assert.equal(navigationTarget('intent://untrusted'), 'blocked');
console.log('Navegación: origen de la app, vista previa y enlaces externos verificados.');
