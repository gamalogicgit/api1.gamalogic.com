// src/routes/companyRoutes.js
import express from 'express';
import companyController from '../controllers/companyController.js';

const router = express.Router();

router.get('/resolve', companyController.resolve);
// router.get('/all', companyController.getAll);
// router.get('/:id', companyController.getById);

export default router;