// src/app.js
import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import path from "path";                          
import { fileURLToPath } from "url";

import companyRoutes from "./routes/companyRoutes.js";
import errorHandler from "./middleware/errorHandler.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Morgan logging
morgan.token('ip', req => {
  return req.headers['cf-connecting-ip'] || 
         req.headers['x-real-ip'] || 
         req.headers['x-forwarded-for'] || 
         req.socket.remoteAddress || '';
});
morgan.token('date', () => new Date().toISOString());

// Middleware
app.use(helmet());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(":date[iso] :method :url :status :res[content-length] - :response-time ms :ip"));
app.use(cookieParser());

// CORS - Allow all origins for API
app.use(cors());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'domain-finder-api',
    version: '1.0.0'
  });
});

// API Routes
app.use('/images', express.static(path.join(__dirname, '..', 'images')));

app.use('/v1/company', companyRoutes);


// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use(errorHandler);

export default app;