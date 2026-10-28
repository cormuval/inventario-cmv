// Configuracion pm2 para produccion (servidor server-das / informesdiarios).
// La app se sirve con `next start` en el puerto 3030 detras de nginx (vhost inventario.cmvalparaiso.cl).
// El deploy la publica con: pm2 startOrReload ecosystem.config.js --update-env
module.exports = {
    apps: [
        {
            name: "inventario-cmv",
            cwd: __dirname,
            script: "node_modules/next/dist/bin/next",
            args: "start -p 3030",
            instances: 1,
            exec_mode: "fork",
            autorestart: true,
            max_memory_restart: "500M",
            env: {
                NODE_ENV: "production",
                PORT: "3030"
            }
        }
    ]
};
