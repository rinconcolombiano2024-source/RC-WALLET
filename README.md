# RC Wallet Recovery

Mini App y aplicación web para detectar balances asociados a una dirección de
World App y moverlos únicamente cuando existe un firmante válido en la red.

## Lo que sí hace

- Autentica World App mediante SIWE y verifica la firma en una función backend.
- Escanea World Chain, Ethereum, Optimism, Base, BNB Chain y World Chain
  Sepolia.
- Detecta monedas nativas y una lista controlada de contratos ERC-20.
- Permite añadir contratos ERC-20 personalizados.
- Envía activos de World Chain mediante MiniKit.
- Permite retiros externos si una wallet inyectada expone exactamente la misma
  dirección que contiene los fondos.
- Admite WalletConnect para MetaMask, Trust Wallet, Binance Wallet y otras
  wallets compatibles mediante QR o enlace móvil.
- Confirma operaciones de MiniKit consultando el `userOpHash`.
- Genera un informe técnico de recuperación.
- Incluye RC Link, una prueba EIP-712 que diagnostica si la firma de World App
  es portable a una red externa como EOA, EIP-1271 o cuenta contrafactual.
- Muestra precio, volumen, liquidez, market cap y velas en tiempo real con
  DexScreener para el par verificable con mayor liquidez.
- Incluye botones Comprar, Vender y Cambiar que abren el DEX correspondiente
  con los activos preseleccionados.

## Límite técnico

MiniKit solo envía transacciones en World Chain, `chainId 480`. Detectar fondos
en Ethereum, Optimism, Base o BNB Chain no significa que World App pueda
firmarlos.

Para una red externa, la aplicación exige que el proveedor conectado exponga
exactamente la dirección analizada. Si no coincide, el botón de recuperación
permanece bloqueado.

No se debe “clonar” un Safe ni desplegar una cuenta con parámetros adivinados:
eso puede crear otra dirección o una cuenta que no controla los fondos.

## RC Link

La sección RC Link permite:

1. Seleccionar la red externa.
2. Firmar dentro de World App una autorización EIP-712 que no mueve fondos.
3. Copiar el paquete a la versión web.
4. Comprobar bytecode, recuperación ECDSA y validación EIP-1271.

El resultado define la siguiente fase:

- `portable-eoa-signature`: estudiar métodos por firma del token.
- `deployed-smart-account-signature`: construir una ejecución con relayer.
- `counterfactual-smart-account`: recuperar primero los parámetros exactos de
  despliegue.
- `signature-not-portable`: la conexión World App → web no entrega autoridad
  suficiente y no debe intentarse el retiro.

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
VITE_REOWN_PROJECT_ID=tu_project_id
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
- No cobra comisión de aplicación.
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
