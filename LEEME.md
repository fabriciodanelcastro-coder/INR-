# Registro de anticoagulación — cómo instalarlo

App web instalable en el iPhone. Funciona sin internet y guarda los datos en el teléfono.

## Archivos

| Archivo | Para qué |
|---|---|
| `index.html` | La pantalla |
| `app.js` | La lógica |
| `manifest.webmanifest` | Nombre e ícono de la app |
| `sw.js` | Hace que funcione sin señal |
| `apple-touch-icon.png` | Ícono en la pantalla de inicio de iOS |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Íconos |

Los ocho van juntos en la misma carpeta. No cambies los nombres.

## Publicarlo (una sola vez, ~10 minutos)

Hace falta una dirección web con HTTPS: iOS no instala apps desde un archivo suelto.

1. Creá una cuenta en github.com si no tenés.
2. Botón **New repository**. Nombre: `inr`. Marcá **Public**. Create.
3. En el repo vacío: **uploading an existing file**.
4. Arrastrá los ocho archivos. Abajo, **Commit changes**.
5. Pestaña **Settings** → menú izquierdo **Pages**.
6. En *Source* elegí **Deploy from a branch**, rama `main`, carpeta `/ (root)`. **Save**.
7. Esperá 1-2 minutos y recargá. Va a aparecer la dirección:
   `https://TUUSUARIO.github.io/inr/`

El repo es público, así que **no pongas datos personales en los archivos**. Los datos que cargues después en la app quedan en tu teléfono, no en GitHub.

Si preferís que no sea público: Netlify Drop (app.netlify.com/drop) hace lo mismo arrastrando la carpeta, sin cuenta y con URL privada.

## Instalarlo en el iPhone

1. Abrí esa dirección **en Safari** (no en Chrome — iOS solo instala desde Safari).
2. Botón Compartir (el cuadrado con la flecha).
3. **Agregar a inicio**.
4. Ponele nombre y **Agregar**.

Queda el ícono en la pantalla de inicio. Abrilo desde ahí siempre, no desde Safari: la versión instalada tiene su propio almacenamiento y es la que conserva los datos.

## Respaldo y cambio de teléfono

Los datos viven en el teléfono. El traspaso automático entre iPhones suele conservarlos, pero Apple no lo garantiza. **No dependas de eso.**

**Cada tanto:** botón *Guardar copia* → **Guardar en Archivos** → iCloud Drive. Es un JSON chico.

La app te avisa sola si pasaron 14 días sin copia o si hay 15 eventos nuevos.

**Teléfono nuevo:** abrí la misma dirección en Safari, agregá a inicio, y *Restaurar copia* con el archivo de iCloud Drive. Si algún evento ya existía, no se duplica.

**Respaldo extra sin pensar:** botón *Copiar como texto* y pegalo en una nota de la app Notas. Se sincroniza solo por iCloud y se lee desde cualquier dispositivo.

## Actualizarlo

Si más adelante cambian los archivos: subí los nuevos a GitHub y en `sw.js` cambiá `anticoag-v1` por `anticoag-v2`. Sin ese cambio de número el iPhone sigue mostrando la versión vieja. **Los datos no se tocan al actualizar.**

## Nota

Es un registro personal. No reemplaza el control médico ni habilita a cambiar dosis por cuenta propia. El aviso de fármacos que pueden alterar el INR es orientativo: la lista no es exhaustiva y cada caso lo evalúa tu médico.
