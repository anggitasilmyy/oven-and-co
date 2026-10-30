// tests/unit/register.mjs — dipakai lewat `node --import ./tests/unit/register.mjs --test ...`
import { register } from 'node:module';

register('./resolve-extensionless.mjs', import.meta.url);
