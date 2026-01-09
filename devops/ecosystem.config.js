module.exports = {
    apps: [{
        name: "sarinda-backend",
        script: "./index.js",
        cwd: "/var/www/sarinda-pos/backend",
        env: {
            NODE_ENV: "production",
            PORT: 3001,
            DB_HOST: "localhost",
            DB_USER: "sarinda_user",
            DB_PASSWORD: "Sarinda@2024",
            DB_NAME: "chamika_rice_mill",
            FRONTEND_URL: "*"
        }
    }]
};
