❗ Problema: El ejecutable instalado no aparece firmado (Tauri + OV eSigner de SSL.com)
📝 Descripción del problema

Estoy usando Tauri para generar la aplicación de Windows y un workflow de GitHub Actions para:

Compilar la app (tauri build)

Firmar los binarios utilizando SSL.com eSigner (certificado OV)

Generar la release con los archivos para auto-update (Tauri updater)

El flujo genera correctamente el instalador (.exe o .msi) y este sí aparece firmado cuando el usuario final lo descarga.
Sin embargo, después de instalar la aplicación, el usuario encuentra que el ejecutable interno:

AppName.exe


NO está firmado en Propiedades → Digital Signatures.
Solo el instalador tiene firma.

Esto provoca:

El ejecutable instalado se muestra como “Publisher Unknown”

SmartScreen puede mostrar advertencias

La experiencia del usuario no es la esperada

La verificación de firma no coincide con la del instalador

🔍 Causa principal

En Windows, la firma digital NO se transfiere del instalador al ejecutable interno.

Esto significa:

Firmar solo el instalador (setup.exe / msi) ✔️

No firmar el ejecutable final dentro del instalador ❌

Windows no copia firmas entre binarios.
Cada .exe / .dll debe estar firmado de manera independiente.
Por eso, aunque el instalador tenga firma válida, los archivos instalados no quedan firmados automáticamente.

En Tauri, si no se configura correctamente la sección:

[tauri.bundle.windows.signing]


o no se firma manualmente antes del empaquetado, el binario final termina sin firma, aunque el instalador sí la tenga.

👇 Ejemplos de dónde puede romperse

El workflow solo firma el .exe instalador, pero no firma AppName.exe.

El comando de eSigner se ejecuta después de que Tauri empaquetó todo (demasiado tarde).

El workflow usa el flag de firma para el instalador, pero no para el binario de la app.

El archivo firmado no es el que realmente termina incluido en el instalador.

✅ Solución recomendada
✔️ Firmar el ejecutable de la app ANTES de que Tauri lo empaquete

Esto significa:

Compilar la app:
cargo build --release

Firmar AppName.exe usando eSigner:

esigner sign \
  --credential-id $SSL_CREDENTIAL_ID \
  --totp $SSL_TOTP \
  --input "src-tauri/target/release/AppName.exe" \
  --output "src-tauri/target/release/AppName-signed.exe"


Reemplazar el binario original por el firmado.

Ejecutar:
tauri build
para que el instalador incluya el ejecutable ya firmado.