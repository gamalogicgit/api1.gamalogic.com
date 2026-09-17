// src/models/companyModel.js
import mySqlPool from '../config/database.js';

class CompanyModel {
  /**
   * Find a company by name or domain
   */
  static async findByNameOrDomain(searchTerm) {
    const [rows] = await mySqlPool.query(
      `SELECT id, company_name, domain, created_at, reference, url 
       FROM company_master 
       WHERE company_name = ? OR domain = ?`,
      [searchTerm, searchTerm]
    );
    return rows;
  }

  /**
   * Save a new company
   */
  static async create(companyData) {
    const { company_name, domain, reference, url } = companyData;
    const [result] = await mySqlPool.query(
      `INSERT INTO company_master (company_name, domain, reference, url, created_at) 
       VALUES (?, ?, ?, ?, NOW())`,
      [company_name, domain, reference, url || null]
    );
    return result.insertId;
  }

  /**
   * Update an existing company
   */
  static async update(id, companyData) {
    const { domain, reference, url } = companyData;
    const [result] = await mySqlPool.query(
      `UPDATE company_master 
       SET domain = ?, reference = ?, url = ?
       WHERE id = ?`,
      [domain, reference, url || null, id]
    );
    return result.affectedRows;
  }

  /**
   * ✅ Update the url column (used for both logo and favicon paths)
   */
  static async updateUrl(companyName, urlValue) {
    const [result] = await mySqlPool.query(
      `UPDATE company_master 
       SET url = ?
       WHERE company_name = ?`,
      [urlValue, companyName]
    );
    return result.affectedRows;
  }

  /**
   * Get all companies (with pagination)
   */
  static async getAll(limit = 100, offset = 0) {
    const [rows] = await mySqlPool.query(
      `SELECT id, company_name, domain, created_at, reference, url 
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