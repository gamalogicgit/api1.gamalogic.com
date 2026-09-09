import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const password=process.env.SQLPASSWORD

const mySqlPool=mysql.createPool({
    host:process.env.SSH_HOST,
    user:process.env.DB_USER,
    password:process.env.DB_PASSWORD,
    database:process.env.DB_DATABASE,
    waitForConnections: true,
    connectTimeout: 20000, 
})

export default mySqlPool