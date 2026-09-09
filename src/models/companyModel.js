// src/models/companyModel.js
import mySqlPool from '../config/database.js';

class CompanyModel {
  /**
   * Find a company by name or domain
   */
  static async findByNameOrDomain(searchTerm) {
    const [rows] = await mySqlPool.query(
      `SELECT id, company_name, domain, created_at, reference 
       FROM company_master 
       WHERE company_name = ? OR domain = ?`,
      [searchTerm, searchTerm]
    );
    return rows;
  }

  /**
   * Save a new company
   * reference stores where the data came from (clearout, brandfetch, tavily)
   */
  static async create(companyData) {
    const { company_name, domain, reference } = companyData;
    const [result] = await mySqlPool.query(
      `INSERT INTO company_master (company_name, domain, reference, created_at) 
       VALUES (?, ?, ?, NOW())`,
      [company_name, domain, reference]
    );
    return result.insertId;
  }

  /**
   * Update an existing company
   */
  static async update(id, companyData) {
    const { domain, reference } = companyData;
    const [result] = await mySqlPool.query(
      `UPDATE company_master 
       SET domain = ?, reference = ?
       WHERE id = ?`,
      [domain, reference, id]
    );
    return result.affectedRows;
  }

  /**
   * Get all companies (with pagination)
   */
  static async getAll(limit = 100, offset = 0) {
    const [rows] = await mySqlPool.query(
      `SELECT id, company_name, domain, created_at, reference 
       FROM company_master 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    return rows;
  }

  /**
   * Check if company exists by name
   */
  static async exists(companyName) {
    const [rows] = await mySqlPool.query(
      `SELECT id FROM company_master WHERE company_name = ?`,
      [companyName]
    );
    return rows.length > 0;
  }
}

export default CompanyModel;