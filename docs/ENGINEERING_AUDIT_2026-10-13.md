# RC Wallet — auditoría de ingeniería (13-10-2026)

## Alcance y estado
Repositorio **RC-WALLET**, rama base `main` en commit `1c063edb15246c6fd228686fb5a7783c0b3e5636`. Esta auditoría corresponde al código existente; **no** sustituye la validación de World App en un dispositivo ni una auditoría externa de contratos inteligentes.

| Sistema | Estado a fecha de la revisión | Evidencia / límite |
| --- | --- | --- |
| Compilador | Vite 7 + React 19, Node 24 | `package.json`, `vite.config.js`, `vercel.json` |
| Problemas AJV/CRACO/CRA | No presentes en el árbol actual | No existen `react-scripts`, `craco.config.js` ni `ajv` directos |
| Instalación reproducible | Implementada en esta rama, pendiente de resultado CI | `package-lock.json` generado con npm (no creado manualmente), `npm ci` |
| Detección de direcciones | Corregida, pruebas automatizadas | Preservar checksum EIP-55 en `src/blockchain.js` |
| Validación RPC | Corregida, pruebas automatizadas | `eth_chainId` real antes de cachear `JsonRpcProvider` |
| Escaneo parcialmente fallido | Corregida, pruebas funcionales pendientes | Fallos ERC-20 ya no se etiquetan como resultado completo `online` |
| World Chain RPC secundario | Configurado, comprobación remota pendiente | Endpoint alternativo documentado públicamente, se verifica chain ID al usarlo |
| Autenticación MiniKit/World App | Implementada sin prueba en dispositivo | `MiniKit.walletAuth()` + validación SIWE en API |
| Transacciones World Chain | Implementadas sin prueba real | MiniKit `sendTransaction` + `userOpHash` y consulta de estado; sin envío de prueba real |
| Lectura de redes externas | Implementada sin validación RPC en producción | Ethereum, Optimism, Base, BNB Chain; también World Chain Sepolia |
| Firma de redes externas | Condicionada por firmante real | EIP-1193 / WalletConnect; NO equivale a control de la World App |
| Safe / recuperación contrafactual | No certificada | No desplegar ni firmar sin una auditoría de seguridad específica |
| Idiomas ES, PL, EN completos | Pendiente | UI principal contiene textos en español sin sistema i18n universal |
| PWA / historial completo | Pendiente | La rama oficial no incluye todas las funciones de RC-WALLET-EXTERNAL |
| Despliegue Vercel real | Pendiente de confirmación del proyecto vinculado | Un build de CI NO demuestra funcionamiento de producción |

## Hallazgos, causa raíz y cambios mínimos

1. **Validación de red falsa (riesgo alto):** antes, `getProvider()` creaba `ethers.JsonRpcProvider(url, chainId, { staticNetwork: true })` y usaba `getNetwork()` para comprobar el ID. Con una red estática esta llamada puede devolver el ID configurado sin consultar al servidor. **Solución:** consultar `eth_chainId` mediante JSON-RPC y comparar con el ID configurado, destruir proveedor fallido y probar otro endpoint.
2. **Escaneo incompleto informado como completado (riesgo medio):** `Promise.allSettled()` descartaba errores de balance/metadata de tokens, pero la red quedaba en estado `online`; un usuario podía interpretar ausencia de activos como saldo cero. **Solución:** guardar `tokenErrors`, informar estado `partial` y mostrar aviso visible de resultados incompletos.
3. **Checksum EIP-55 ignorado (riesgo medio):** el normalizador convertía a minúsculas antes de validar una dirección mixta, eliminando la señal de un posible error de escritura. **Solución:** usar `ethers.getAddress(candidate)` conservando la validación; las direcciones completamente minúsculas siguen aceptándose.
4. **Un único RPC de World Chain y Sepolia (resiliencia):** añadir endpoints alternativos de lectura, seleccionados solo cuando validan su chain ID real. **No** garantiza uptime.
5. **Sin lockfile ni CI en `main` (riesgo de build):** se añadió `package-lock.json` generado con npm, pruebas Node y un workflow de integración continua. No se cambian las versiones directas ni se migra Vite/React porque el repo actual ya utiliza Vite y no CRA.

## Referencias oficiales consultadas
- World App Wallet Authentication: https://docs.world.org/mini-apps/commands/wallet-auth
- World App Send Transaction (World Chain, userOpHash): https://docs.world.org/mini-apps/commands/send-transaction
- EIP-1193: https://eips.ethereum.org/EIPS/eip-1193
- EIP-1271: https://eips.ethereum.org/EIPS/eip-1271
- EIP-4337: https://eips.ethereum.org/EIPS/eip-4337
- ethers v6: https://docs.ethers.org/v6/
- Vercel Vite: https://vercel.com/docs/frameworks/frontend/vite
- npm clean install: https://docs.npmjs.com/cli/v11/commands/npm-ci
- GitHub Actions Node.js: https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs
- World Chain RPC secundarios (fuente de catálogo público, no garantía de uptime): https://chainlist.wtf/chain/480/ y https://chainlist.wtf/chain/4801/

## Pruebas y ejecución

El pipeline `.github/workflows/ci.yml` ejecuta en Node 24:
1. `npm ci` (instalación determinista desde lockfile).
2. `npm ls --depth=0`.
3. `npm test` (pruebas reales con servidor JSON-RPC local simulado, sin transferir fondos).
4. `npm run build`.
5. `npm audit --audit-level=high`.

Los resultados concretos y enlaces a los logs de GitHub Actions deben revisarse antes del merge. **Ninguna transacción real ni prueba World App móvil se ejecuta desde este pipeline.**

## Riesgos conocidos para una versión de producción financiera

- La lectura RPC `staticNetwork` ya confirma identidad al crear un proveedor, pero un proveedor **cacheado** puede quedar fuera de servicio posteriormente; mejorar reintentos/evicción con pruebas.
- Escaneos obsoletos dejan de modificar la UI mediante `scanIdRef`, pero las solicitudes RPC subyacentes aún podrían seguir en ejecución; considerar concurrencia limitada, `AbortController` compatible y cancelación real sin romper ethers.
- No se ha verificado on-chain cada dirección de token configurada ni todas las variantes de Safe/fábricas; los símbolos no prueban legitimidad.
- `src/wallet-core.js` conserva utilidades de llave privada cifrada heredadas, aunque el flujo principal evita solicitarlas. Auditar/eliminar solo cuando se confirme que no hay consumidores.
- `src/App.jsx` y `src/blockchain.js` son módulos grandes: requieren pruebas de regresión de reconexión, listeners, Android, World App y rutas EIP-1271/4337.
- Los contratos `contracts/RCRescueVault.sol` requieren compilación, revisión de amenazas y auditoría separada antes de uso con fondos reales.
- Las recuperaciones no son posibles sin una firma autorizada válida en la red donde están los activos. SIWE, una dirección pública o World ID no proporcionan control multichain.

## Criterio de merge

Solo fusionar tras revisión del PR, CI verde, auditoría de dependencias sin vulnerabilidades altas sin tratar y validación manual independiente de World App / Vercel Preview. La aplicación no se declara **lista para producción** mientras falten estas evidencias.
