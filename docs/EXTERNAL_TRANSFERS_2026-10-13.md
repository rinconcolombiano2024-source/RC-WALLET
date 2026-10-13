# RC Wallet — Transferencias externas EVM: manual de operación segura

**13-10-2026 — Estado: pruebas automatizadas aprobadas, dispositivo real y
Vercel pendientes.** Este documento describe las funciones implementadas, no
certifica soporte en todas las wallets ni recuperaciones garantizadas.

## 1. Distinguir tres titulares de fondos

**A. EOA controlada en la cadena origen.** Una wallet externa (por ejemplo,
MetaMask, Trust Wallet o Coinbase Wallet) expone la MISMA dirección EOA que
contiene el activo y soporta `eth_sendTransaction` en esa cadena. Este es el
caso compatible con transferencia directa. La app NO necesita ni solicita
frase semilla o clave privada.

**B. Smart Account desplegada (Safe).** Tener la dirección pública, incluso
con fondos, no significa tener autorización. Se necesitan los owners, el
threshold, la firma soportada y una ejecución on-chain admitida por el
contrato en la cadena de los fondos. Una wallet que solo paga gas no es owner.

**C. Dirección World App cuyo contrato NO está desplegado en la cadena de
los fondos.** La función es lectura/diagnóstico hasta demostrar
reconstrucción CREATE2 exacta, compatibilidad de firma, autorización EIP-1271
de la Safe de World Chain, autoridad aceptada por la Safe destino, y gas.
Si cualquier condición falla, RC Wallet DEBE impedir el movimiento. No hay
un botón universal ni una firma de World Chain que automáticamente mueva
fondos en Ethereum, Optimism, Base o BNB.

## 2. Flujo autorizado para una EOA externa

1. Abrir RC Wallet y conectar una wallet externa por WalletConnect o por
   proveedor EIP-1193 inyectado. La wallet presenta su propia autorización.
2. Si su dirección NO coincide con la cuenta analizada, pulsar
   **«Usar mi wallet externa para escanear y enviar»**, revisar la dirección
   visible y confirmar el cambio explícitamente. Esto NO recupera fondos de
   una dirección World App diferente: escanea los fondos de la wallet externa.
3. Ejecutar escaneo y distinguir `online`, `partial` y `offline`.
   En caso de fallo RPC no interpretar activos ausentes como saldo cero.
4. Seleccionar la red de origen, el activo, la dirección receptora y el importe.
   El token siempre se identifica por chainId y dirección del contrato.
5. Revisar la confirmación antes de firmar. La aplicación solicita el cambio
   de red a la wallet cuando es necesario, y valida `eth_chainId` DESPUÉS
   del cambio. Añadir una cadena no basta.
6. RC Wallet vuelve a consultar el saldo real de la cuenta y estima gas.
   Para tokens ERC-20 se necesita moneda nativa para gas en la cadena origen.
7. La wallet solicita la aprobación explícita de la operación: nunca hay
   transferencia automática. Se comprueba la red una última vez antes del
   envío y después se requiere recibo on-chain con `status=1`.
8. Verificar el hash y el contrato del token en el explorador de esa red,
   además del balance final; una firma realizada no prueba recepción final.

## 3. World App y Smart Accounts

- `MiniKit.walletAuth()` acredita una sesión SIWE cuando el servidor la
  valida, NO prueba identidad World ID ni control sobre otras cadenas.
- `MiniKit.sendTransaction({ chainId: 480 })` está documentado para
  World Chain. No está documentado como firmante universal para Ethereum,
  Optimism, Base o BNB Smart Chain.
- `MiniKit.signTypedData()` solicita una firma EIP-712; no se presume que
  la firma sea ejecutable en otra blockchain. La comprobación de autoridad
  debe realizarse en los contratos origen y destino.
- El motor Safe existente prepara intención específica de chainId,
  destinatario, valor, nonce, owners y threshold, y exige pruebas EIP-1271
  antes de ejecutar. La ruta NO está auditada ni comprobada con una World
  Safe real en otras cadenas. No desplegar `RCRescueVault.sol` con fondos.
- WalletConnect ofrece firmas solo cuando la wallet conectada admite
  realmente la red y la cuenta respectiva; si es watch-only no puede firmar.

## 4. Cobertura de cadenas en esta versión

| Red | Chain ID | Lectura | Movimientos |
| --- | ---: | --- | --- |
| World Chain | 480 | Implementada | MiniKit, pendiente prueba real |
| Ethereum | 1 | Implementada | Wallet externa EOA compatible o Safe verificada |
| Optimism | 10 | Implementada | Wallet externa EOA compatible o Safe verificada |
| Base | 8453 | Implementada | Wallet externa EOA compatible o Safe verificada |
| BNB Smart Chain | 56 | Implementada | Wallet externa EOA compatible o Safe verificada |
| World Chain Sepolia | 4801 | Implementada | Sin certificación de transferencias |

Para las cinco redes principales, el flujo de lectura y el envío EIP-1193
están implementados pero NO probados contra carteras reales en todas las
redes; por eso NO se afirma disponibilidad garantizada de firma.

## 5. Evidencia y límites

El commit `073de93e2d7872075dddc85d4625998d45472c39`
superó **24 pruebas automatizadas** (sin enviar fondos), instalación limpia,
sintaxis, Vite build y `npm audit --audit-level=high`.
Evidencia: https://github.com/rinconcolombiano2024-source/RC-WALLET/actions/runs/38462486744

Quedan **13 avisos moderados** de dependencias. Vercel informa
`build-rate-limit` en las dos integraciones del repositorio: no hay
despliegue nuevo verificable. Falta QA real en World App Android, pruebas
por cadena en testnet, E2E, compatibilidad de distintas wallets y auditoría
de Safe/contratos. La rama se mantiene sin fusionar.

**Principio operativo:** una dirección pública es información, no una
autorización. RC Wallet jamás debe pedir secretos ni sugerir que una cuenta
sin firmante puede transferir fondos.
