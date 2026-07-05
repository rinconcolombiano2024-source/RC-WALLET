# RC Wallet

Mini App y aplicación web para detectar balances asociados a una dirección de
World App y moverlos únicamente cuando existe un firmante válido en la red.

## Lo que sí hace

- Autentica World App mediante SIWE y verifica la firma en una función backend.
- Escanea World Chain, Ethereum, Optimism, Base, BNB Chain y World Chain
  Sepolia.
- Detecta monedas nativas y una lista controlada de contratos ERC-20.
- Permite añadir contratos ERC-20 personalizados.
- Envía activos de World Chain mediante MiniKit.
- Permite movimientos externos si una wallet inyectada expone exactamente la misma
  dirección que contiene los fondos.
- Admite WalletConnect para MetaMask, Trust Wallet, Rabby, Coinbase Wallet,
  Binance Wallet y otras wallets compatibles mediante QR o enlace móvil.
- Confirma operaciones de MiniKit consultando el `userOpHash`.
- Genera un informe técnico de fondos disponibles.
- Muestra un diagnóstico de firma por activo: movible, parcialmente movible o
  bloqueado, indicando si falta World App, firma externa, gas o
  soporte de smart account.
- Escanea cada red para clasificar la cuenta como sin contrato, contrato o
  Safe/smart account cuando los métodos on-chain lo permiten.
- Lee datos Safe verificables: versión, owners, threshold y módulos visibles.
- Prueba EIP-1271 de forma honesta: distingue entre método presente,
  firma de prueba rechazada o contrato sin soporte confirmado.
- Detecta EntryPoint ERC-4337 v0.6 disponible en la red para saber si una ruta
  UserOperation podría construirse con bundler, paymaster y firma válida.
- Permite copiar una ruta de movimiento del activo seleccionado para soporte,
  auditoría o revisión manual.
- En esta versión la comisión de movimiento está desactivada: el envío se
  prepara como transferencia simple al destino indicado por el usuario.
- Solicita verificación World ID/MiniKit antes de acciones sensibles: enviar,
  comprar, vender, cambiar y conectar wallet externa.
- Incluye RC Link, una prueba EIP-712 que diagnostica si la firma de World App
  es portable a una red externa como EOA, EIP-1271 o cuenta contrafactual.
- Muestra precio, volumen, liquidez, market cap y velas en tiempo real con
  DexScreener para el par verificable con mayor liquidez.
- Incluye botones Comprar, Vender y Cambiar que abren el DEX correspondiente
  con los activos preseleccionados.
- Incluye un botón Enviar siempre visible que abre el formulario de
  transferencia del activo seleccionado.
- Muestra QR para recibir fondos en la dirección activa.
- Permite escanear QR de destino en el formulario de envío cuando el navegador
  soporta lectura QR con cámara.
- Diagnostica cuentas de Trust Wallet / MetaMask / Binance Wallet en modo solo
  lectura o watch-only: pueden mostrar balances, pero no pueden firmar movimientos.
- Incluye Centro de rutas: evalúa MiniKit, wallet externa, RC Link,
  smart account contrafactual, relayer, expediente para soporte y Rescue Vault
  futuro.
- Genera un expediente técnico de movimiento para soporte, emisor, auditoría o
  diseño de relayer.
- Presenta la app como wallet móvil con navegación inferior fija: Inicio,
  Tokens, Mover, Markets y Herramientas.
- Abre una pantalla interna por token al hacer clic sobre un activo: gráfica en
  tiempo real, información de red/contrato, enlaces oficiales, explorador,
  botones Comprar/Vender/Cambiar y Enviar/mover.
- Incluye enlaces oficiales por activo, incluyendo Bitcoin/WBTC, Ethereum,
  World, USDC, USDT, BNB Chain y RC.PL/Rincón Colombiano.
- Incluye modal de confirmación antes de enviar fondos con token, red, destino,
  monto, fee de red y tipo de firma requerida.
- Incluye RC.PL Market Lab para definir precio objetivo, calcular liquidez
  inicial aproximada, abrir el DEX para crear pool y preparar staking.
- Usa como fuente de sesión la dirección SIWE verificada por el backend; el
  valor cacheado de `MiniKit.user.walletAddress` no bloquea envíos válidos.

## Navegación móvil v5

RC Wallet ya no se organiza como una página larga. La interfaz principal queda
dividida en cinco pantallas:

- `Inicio`: balance/resumen, wallet activa, acciones rápidas, tokens
  principales y publicidad local compacta existente.
- `Tokens`: scanner, filtros por red, búsqueda por token/red/contrato y lista
  completa de activos detectados, incluyendo balances pequeños.
- `Mover`: diagnóstico de firma, envío, WalletConnect, RC Link,
  EIP-1271/Safe/ERC-4337 y expediente técnico.
- `Markets`: gráficas, comprar, vender, cambiar y RC.PL Market Lab.
- `Herramientas`: login World App, análisis manual de dirección, QR de
  recepción y advertencias de seguridad.

## Límite técnico

MiniKit solo envía transacciones en World Chain, `chainId 480`. Detectar fondos
en Ethereum, Optimism, Base o BNB Chain no significa que World App pueda
firmarlos.

Para una red externa, la aplicación exige que el proveedor conectado exponga
exactamente la dirección analizada. Si no coincide, el botón de movimiento
permanece bloqueado.

No se debe “clonar” un Safe ni desplegar una cuenta con parámetros adivinados:
eso puede crear otra dirección o una cuenta que no controla los fondos.

RC Wallet no puede crear ni exportar una frase semilla para una dirección de
World App existente. Si se genera una semilla nueva, se crea otra dirección y
esa dirección nueva no controla los fondos antiguos.

Si Trust Wallet muestra la dirección como “solo lectura” o “watch-only”, la app
solo tiene lectura del balance. Para mover fondos debe existir una firma real de
esa misma dirección: MiniKit en World Chain, una wallet externa que tenga la
llave privada real, o una smart account compatible con sus propietarios/módulos.

## Centro de rutas

La sección Centro de rutas marca cada ruta como:

- `Listo`: existe una ruta de firma o ejecución.
- `Falta acción`: hay que autenticar, conectar signer, firmar RC Link o aportar
  datos verificables.
- `Bloqueado`: no existe firma ejecutable con la información actual.
- `Futuro`: se puede construir infraestructura para nuevos casos, pero no mueve
  fondos antiguos sin autoridad.

Infraestructura que se puede construir:

- RC Movement Relayer para smart accounts con firma EIP-1271 válida.
- RC Counterfactual Deployer con parámetros exactos de despliegue.
- RC Rescue Vault para depósitos futuros con control social.
- Expediente técnico para soporte, exchange, emisor o auditoría.

El repositorio incluye `contracts/RCRescueVault.sol` como plantilla preventiva.
No debe desplegarse con fondos reales sin auditoría independiente.

## Comisión de movimiento

La comisión de movimiento está desactivada en esta versión para priorizar un
flujo de envío simple y compatible con World App. El 100% del monto ingresado
se prepara para la wallet receptora indicada por el usuario.

La app no solicita frases semilla ni claves privadas.

## RC.PL, precio, pool y staking

RC.PL puede mostrarse, comprarse o venderse cuando exista un pool real con
liquidez. El “precio objetivo” configurado en la app es una guía comercial: el
precio real se forma en el DEX según liquidez y operaciones.

Para staking se necesita desplegar un contrato auditado y financiar recompensas.
La interfaz queda preparada, pero no promete APY hasta que exista el contrato.

## RC Link

La sección RC Link permite:

1. Seleccionar la red externa.
2. Firmar dentro de World App una autorización EIP-712 que no mueve fondos.
3. Copiar el paquete a la versión web.
4. Comprobar bytecode, firma ECDSA y validación EIP-1271.

El resultado define la siguiente fase:

- `portable-eoa-signature`: estudiar métodos por firma del token.
- `deployed-smart-account-signature`: construir una ejecución con relayer.
- `counterfactual-smart-account`: localizar primero los parámetros exactos de
  despliegue.
- `signature-not-portable`: la conexión World App → web no entrega autoridad
  suficiente y no debe intentarse el movimiento.

## Desarrollo

```bash
npm install
npm run dev
```

Crea un proyecto gratuito en https://dashboard.reown.com y copia el archivo de
ejemplo:

```bash
cp .env.example .env.local
```

Completa:

```text
VITE_REOWN_PROJECT_ID=aa5427a18f0efc9d533439359b0031b3
```

Las rutas `/api/nonce` y `/api/complete-siwe` son funciones de Vercel. Para
probar la autenticación completa localmente, utiliza:

```bash
npx vercel dev
```

## Despliegue

1. Crea la Mini App en el World Developer Portal.
2. Autoriza en el portal cada contrato y token que MiniKit vaya a tocar.
3. Sube la carpeta a GitHub.
4. Importa el repositorio en Vercel.
5. Configura la URL desplegada en el Developer Portal.
6. Prueba dentro de World App con cantidades pequeñas.

## Seguridad

- No pide frases semilla ni claves privadas.
- No cobra comisiones ocultas: la comisión de movimiento está desactivada en esta versión.
- No mezcla transacciones de cadenas diferentes.
- No trata un `userOpHash` como hash final.
- Las direcciones de tokens no verificadas no están habilitadas por defecto.
- Se recomienda una auditoría independiente antes de operar fondos reales.

## Publicidad incluida

La interfaz conserva el anuncio de Rincón Colombiano, el cupón de empanada con
compra mínima de 50 zł y el enlace a Google Maps de ul. Czapelska 33, Varsovia.

## Fuentes técnicas

- MiniKit Send Transaction:
  https://docs.world.org/mini-apps/commands/send-transaction
- MiniKit Wallet Authentication:
  https://docs.world.org/mini-apps/commands/wallet-auth
- MiniKit standalone app:
  https://docs.world.org/mini-apps/migration/standalone-dapp
- User operation status:
  https://docs.world.org/api-reference/developer-portal/get-user-operation
- WalletConnect Ethereum Provider:
  https://docs.walletconnect.network/wallet-sdk/web/usage
