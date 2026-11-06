# Penales

Juego de tandas para dos personas en la misma compu. Cada persona elige su jugada por separado y las dos ven la resolución juntas.

## Jugar localmente

Abrí `index.html` en el navegador con doble clic. No hace falta instalar nada. La partida se mantiene en la pestaña hasta que la recargás o cerrás.

## Desplegar en Vercel

Subí los archivos a un repositorio e importalo en Vercel. El archivo `vercel.json` configura el proyecto como sitio estático y sirve la carpeta raíz, sin compilación. También podés ejecutar `vercel` desde la carpeta del proyecto si ya usás la CLI de Vercel.

## Habilitar salas online

1. Creá una base de datos Upstash Redis y conectala al proyecto de Vercel.
2. Configurá `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` en el entorno de Vercel y volvé a desplegar. Usá el token con permiso de escritura. Las credenciales solo se leen en la función del servidor.
3. Abrí el sitio desplegado, elegí **Crear sala privada** y compartí el enlace. Cada jugador confirma desde su navegador. Los dos pulsan **Siguiente penal** o **Revancha** para seguir.

Para probar el modo online en tu compu, configurá esas dos variables para desarrollo y ejecutá `vercel dev` desde el proyecto. Abrí el enlace de invitación en un perfil distinto o una ventana privada para simular la segunda compu. La sesión se guarda en el navegador para que puedas recargar y volver a la sala. Las salas vencen tras 24 horas sin cambios. El modo local sigue funcionando al abrir `index.html` con doble clic.
