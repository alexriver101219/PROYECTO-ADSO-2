# PROYECTO ADSO 2

API y portal web para consultas, solicitudes y descargas, construido con `Node.js`, `TypeScript`, `Fastify`, `Prisma` y `SQLite`.

## Caracteristicas

- Registro e inicio de sesion con JWT
- Roles `USER` y `ADMIN`
- Creacion y consulta de solicitudes
- Historial de cambios de estado
- Carga y descarga de adjuntos
- Portal web integrado
- Documentacion Swagger
- Coleccion Postman lista para importar
- Pruebas automatizadas con Vitest

## Stack

- Backend: `Fastify` + `TypeScript`
- Base de datos: `SQLite`
- ORM: `Prisma`
- Auth: `@fastify/jwt`
- Uploads: `@fastify/multipart`
- Testing: `Vitest` + `Supertest`

## Estructura

```text
src/
  config/
  lib/
  main/
  modules/
public/
postman/
prisma/
tests/
```

## Requisitos

- Node.js 20+
- npm

## Configuracion

1. Instala dependencias:

```bash
npm install
```

2. Crea tu archivo de entorno:

```bash
copy .env.example .env
```

3. Prepara el admin inicial:

```bash
npm run db:seed
```

## Ejecucion

Modo desarrollo:

```bash
npm run dev
```

Modo compilado:

```bash
npm run build
npm start
```

## URLs

- Portal: `http://127.0.0.1:3000/`
- Swagger: `http://127.0.0.1:3000/docs`
- Health: `http://127.0.0.1:3000/health`

## Credenciales demo

- Email: `admin@example.com`
- Password: `Admin123!`

## Scripts

```bash
npm run build
npm run dev
npm run start
npm run test
npm run db:seed
npm run prisma:generate
```

## Postman

Importa estos archivos:

- `postman/consultas-api.postman_collection.json`
- `postman/consultas-api.local.postman_environment.json`

## Flujo principal

1. Registrar o iniciar sesion
2. Crear una solicitud
3. Consultar el listado y el detalle
4. Cambiar estado segun el rol
5. Subir adjuntos como admin
6. Descargar adjuntos como usuario autorizado o admin

## Testing

```bash
npm test
```

## Estado

Proyecto funcional con backend, frontend basico, coleccion Postman y pruebas pasando.
