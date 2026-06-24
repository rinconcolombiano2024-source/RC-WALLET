# Arquitectura de recuperación entre World App y RC Wallet Web

## Principio fundamental

La aplicación externa puede transportar, verificar y ejecutar una autorización,
pero no puede inventar autoridad sobre una dirección.

La dirección que contiene los fondos debe aceptar criptográficamente alguna de
estas rutas:

1. Firma ECDSA de la misma EOA.
2. Firma EIP-1271 de una smart account ya desplegada.
3. Despliegue contrafactual exacto de la smart account y una firma aceptada por
   esa cuenta.
4. Método nativo del token basado en firma, como `permit` o
   `transferWithAuthorization`.

## Componentes

### RC Wallet dentro de World App

- Autentica la cuenta mediante SIWE.
- Obtiene la dirección pública.
- Escanea balances.
- Firma una prueba EIP-712 limitada, con red, nonce y vencimiento.
- En una fase posterior, firmaría una operación exacta previamente simulada.

### RC Wallet Web

- Recibe el paquete firmado.
- Conecta extensiones o wallets móviles mediante WalletConnect.
- Comprueba dirección, red, nonce y vencimiento.
- Recupera la EOA cuando la firma es ECDSA.
- Consulta bytecode en World Chain y en la red objetivo.
- Comprueba EIP-1271 cuando la cuenta ya está desplegada.
- Solo después de una simulación válida envía la operación mediante un relayer.

### Diagnóstico on-chain v6

El scanner no debe limitarse a leer balances. Para cada red debe leer también:

- bytecode de la dirección objetivo;
- saldo nativo para gas;
- métodos Safe estándar: `VERSION`, `getOwners`, `getThreshold` y
  `getModulesPaginated`;
- respuesta EIP-1271 mediante `isValidSignature`;
- disponibilidad de EntryPoint ERC-4337 conocido.

Estos datos permiten clasificar cada ruta como movible, parcialmente movible,
solo lectura o pendiente de soporte. La app no debe convertir una cuenta
watch-only en firmante; solo puede ejecutar si existe una firma válida,
owners Safe, módulo autorizado o proveedor externo que controle exactamente la
misma dirección.

### Relayer

El relayer no debe custodiar fondos ni claves. Su función sería:

- pagar gas en la red externa;
- publicar una operación ya firmada;
- verificar vencimiento y nonce;
- simular antes de transmitir;
- impedir cambios de destino, token o cantidad.

## Casos posibles

### EOA portable

Una firma de mensaje recupera exactamente la dirección objetivo. Esto no firma
por sí solo una transacción EVM. Puede habilitar métodos específicos por firma
si el token los soporta.

### Smart account desplegada

La cuenta existe en la red objetivo y `isValidSignature` devuelve
`0x1626ba7e`. Puede estudiarse la función de ejecución de esa cuenta y construir
un relayer.

### Smart account contrafactual

La cuenta existe en World Chain pero no en la red objetivo. Antes de desplegar
hay que recuperar y verificar:

- versión del Safe o implementación;
- proxy factory;
- singleton;
- owners;
- threshold;
- módulos y fallback handler;
- initializer;
- salt nonce;
- dirección CREATE2 calculada.

La dirección calculada debe coincidir exactamente con la dirección que ya
contiene los fondos.

## Wallets externas compatibles

La versión web utiliza:

- proveedor inyectado para extensiones;
- WalletConnect para QR y enlaces móviles;
- cambio de red EIP-3326/EIP-3085 cuando la wallet lo permite.

Esto permite abrir MetaMask, Trust Wallet, Binance Wallet y otros proveedores
EVM compatibles. La conexión solo habilita una transferencia cuando la cuenta
seleccionada por esa wallet coincide exactamente con la dirección que contiene
los fondos.

Una wallet con otra dirección puede recibir los fondos, pero no puede firmar
como si fuera la dirección de World App.

### Firma no portable

Si no existe firma EOA ni validación EIP-1271 y tampoco se conoce el despliegue
exacto, no hay una ruta segura desde una aplicación independiente.

## Lo que nunca debe hacerse

- Pedir frase semilla o clave privada.
- Desplegar un Safe con parámetros adivinados.
- Cobrar una comisión antes de confirmar que la recuperación es posible.
- Firmar un mensaje genérico reutilizable sin nonce ni vencimiento.
- Presentar detección de balance como prueba de recuperabilidad.
- Enviar una transacción sin simulación y confirmación explícita del usuario.
