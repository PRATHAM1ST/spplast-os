import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
export default defineConfig([...nextVitals, ...nextTs, {
  rules: { 'react-hooks/set-state-in-effect': 'off', '@next/next/no-img-element': 'off' }
}, globalIgnores(['.next/**', 'public/sw*', 'public/swe-worker*', 'next-env.d.ts', 'playwright-report/**', 'test-results/**'])]);
