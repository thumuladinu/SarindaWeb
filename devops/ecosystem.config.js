module.exports = {
    apps: [{
        name: "sarinda-backend",
        script: "./index.js",
        cwd: "/var/www/sarinda-pos/backend",
        env: {
            NODE_ENV: "production",
            PORT: 3001,
            // DB Credentials will be loaded from .env file or system env
        }
    }]
};
