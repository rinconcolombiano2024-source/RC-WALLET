# RC Wallet — auditoría de ingeniería (13-10-2026)

## Alcance y estado
Repositorio **RC-WALLET**, rama base `main` en commit `1c063edb15246c6fd228686fb5a7783c0b3e5636`. Esta auditoría corresponde al código existente; **no** sustituye la validación de World App en un dispositivo ni una auditoría externa de contratos inteligentes.

| Sistema | Estado a fecha de la revisión | Evidencia / límite |
| --- | --- | --- |
| Compilador | Vite 7.3.7 (parche de seguridad) + React 19, Node 24 | `package.json`, `vite.config.js`, `vercel.json` |
| Problemas AJV/CRACO/CRA | No presentes en el árbol actual | No existen `react-scripts`, `craco.config.js` ni `ajv` directos |
| Instalación reproducible | VERIFICADA en GitHub Actions | `package-lock.json` generado con npm (no creado manualmente), `npm ci` |
| Detección de direcciones | VERIFICADA en pruebas unitarias | Preservar checksum EIP-55 en `src/blockchain.js` |
| Validación RPC | VERIFICADA con servidores JSON-RPC simulados | `eth_chainId` real antes de cachear `JsonRpcProvider` |
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
5. **Sin lockfile ni CI en `main` (riesgo de build):** se añadió `package-lock.json` generado con npm, pruebas Node y un workflow de integración continua. No se migra Vite/React porque el repo actual ya utiliza Vite y no CRA.
6. **Dependencias con avisos de alta severidad (confirmado por GitHub Actions):** `npm audit` informó fallos en Vite 7.0.0 y en `ws` transitivo. Se actualizó Vite a 7.3.7 y se impuso `ws` 8.22.0 mediante `overrides` de npm, conservando los demás paquetes directos. La eliminación real de alertas debe comprobarse con el audit del nuevo lockfile; **no** se han ocultado vulnerabilidades ni deshabilitado controles.

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

**Evidencia ejecutada:** workflow [RC Wallet CI #38328158331](https://github.com/rinconcolombiano2024-source/RC-WALLET/actions/runs/38328158331), rama `engineering/rc-wallet-hardening-20261013`, resultado **success** el 13-10-2026: `npm ci` OK, `npm ls` OK, **4/4 pruebas**, `vite build` OK (**5,15 segundos**, con advertencias Rollup y tamaño del bundle), `npm audit --audit-level=high` OK (**0 alertas altas en ese informe**). **Persisten 13 vulnerabilidades moderadas de dependencias:** requieren triage y corrección, no ignorarlas. Esta evidencia es CI de una versión de la rama previa al último cambio documental; debe pasar nuevamente sobre el SHA definitivo antes del merge. **No se ejecutaron transferencias reales ni pruebas World App móvil.**

## Riesgos conocidos para una versión de producción financiera

- La lectura RPC `staticNetwork` ya confirma identidad al crear un proveedor, pero un proveedor **cacheado** puede quedar fuera de servicio posteriormente; mejorar reintentos/evicción con pruebas.
- Escaneos obsoletos dejan de modificar la UI mediante `scanIdRef`, pero las solicitudes RPC subyacentes aún podrían seguir en ejecución; considerar concurrencia limitada, `AbortController` compatible y cancelación real sin romper ethers.
- No se ha verificado on-chain cada dirección de token configurada ni todas las variantes de Safe/fábricas; los símbolos no prueban legitimidad.
- `src/wallet-core.js` conserva utilidades de llave privada cifrada heredadas, aunque el flujo principal evita solicitarlas. Auditar/eliminar solo cuando se confirme que no hay consumidores.
- `src/App.jsx` y `src/blockchain.js` son módulos grandes: requieren pruebas de regresión de reconexión, listeners, Android, World App y rutas EIP-1271/4337.
- Los contratos `contracts/RCRescueVault.sol` requieren compilación, revisión de amenazas y auditoría separada antes de uso con fondos reales.
- Auditar también vulnerabilidades de severidad moderada restantes; un `npm audit --audit-level=high` verde **no** significa ausencia de riesgos moderados.
- Las recuperaciones no son posibles sin una firma autorizada válida en la red donde están los activos. SIWE, una dirección pública o World ID no proporcionan control multichain.

## Criterio de merge

Solo fusionar tras revisión del PR, CI verde, auditoría de dependencias sin vulnerabilidades altas sin tratar y validación manual independiente de World App / Vercel Preview. La aplicación no se declara **lista para producción** mientras falten estas evidencias.

## Consolidación técnica — 13-10-2026 (PR #3)

PR #3 consolida las correcciones de ambas ramas de ingeniería abiertas sin
sobrescribir el trabajo original de RPC/chainId validado. En particular:

- Escaneo ahora integra de verdad `createLatestScanRunner` en React; la versión
  anterior tenía el coordinador en el repositorio pero no estaba conectado a la UI.
  Un nuevo escaneo reemplaza al anterior incluso si está en curso.
- Escaneo ERC-20 con concurrencia máxima 4 por red, hasta 3 redes simultáneas;
  abortos best effort (ethers RPC en tránsito puede seguir hasta timeout).
  No se promueve un RPC fallido a saldo cero.
- Envíos y QR de destino deben validar checksum EIP-55 y la red indicada
  por un URI `ethereum:address@chainId`.
- Evitado crash de `market.dexId` cuando DexScreener no ofrece mercado y
  par de intercambio token->sí mismo.
- Backend SIWE verifica exactamente el statement enviado por walletAuth,
  y la UI deja de presentar Wallet Auth como si fuera prueba World ID.
- Prevalidación Safe explícitamente provisional hasta demostrar autorización
  real EIP-1271 en red origen/destino.
- Añadidas pruebas de cancelación, concurrencia, nonce, destinatarios y DEX.
- GitHub Actions pasa a checkout v6 / setup-node v7, comprueba sintaxis;
  **no se alteró** `vercel.json` ni se retiraron componentes.

Un `npm run build` exitoso NO valida funcionamiento del producto o de firmas.
No se ejecutaron transacciones financieras. Se requiere revisar pruebas en el
último SHA antes del merge y Vercel sigue necesitando verificación.

### Protección de cambio de sesión durante reautenticación

El frontend mutaba `targetAddress` **antes** de comparar la dirección
autenticada durante una acción sensible. Una sesión distinta podía cambiar el
contexto de fondos en pantalla incluso cuando la confirmación fallaba. Ahora
`performWorldLogin` valida `expectedAddress` antes de cambiar la cuenta,
y `confirmWorldAction` pasa la dirección activa. Sigue pendiente E2E real
en World App; la corrección es por revisión de flujo y compilación, no una
simulación de firma de producción.

Se corrigieron instrucciones de ejemplo: el repositorio incluye
`env.example`, no `.env.example`.

### Rendimiento de mercados y ciclo de vida React

Se impide el solapamiento de peticiones DexScreener en redes móviles lentas;
los refrescos se suspenden si el documento está oculto y se reanudan al
volver a primer plano. Se cancelan solicitudes en desmontaje/cambio de token,
se libera el temporizador y el listener `visibilitychange`. La optimización
requiere medir CPU y consumo de red en un Android real, que no ha sido
simulado ni medido en CI.
