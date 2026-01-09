const mysql = require('mysql');
const bcrypt = require('bcryptjs');

// Create a MySQL connection pool
const pool = require('./index');


// Function to initialize the database and create a user
async function initialize() {
    try {
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
        // Hash the password before saving it to the database
        const hashedPassword = await bcrypt.hash('nihalgemsAdmin123', 10);

        // Create an object with hashed password and other user details
        const userObject = {
            NAME: 'Admin',
            USERNAME: 'admin',
            EMAIL: 'admin@gmail.com',
            ROLE: 'ADMIN',
            CREATED_BY: 0,
            PASSWORD: hashedPassword,
            IS_ACTIVE: 1,
        };


        // Insert the new user data into the database
        const insertResult = await pool.query('INSERT INTO user_details SET ?', userObject);

        if (insertResult.affectedRows > 0) {
            console.log('User added successfully');
        }
    } catch (error) {
        console.error('Error creating user:', error);
    } finally {
        // Close the database connection pool
        pool.end();
    }
}

// Initialize the database and create a user
initialize();
