// src/controllers/companyController.js
import {
  fetchFromTavily,
  fetchFromBrandfetch,
  fetchFromClearout
} from '../helpers/searchHelpers.js';
import CompanyModel from '../models/companyModel.js';

class CompanyController {
  /**
   * Resolve company name to domain
   * GET /v1/company/resolve?name={company_name}
   * Order: Clearout → Brandfetch → Tavily (stop when found)
   */
  async resolve(req, res, next) {
    try {
      const companyName = req.query.name;

      console.log('🔍 Searching for company:', companyName);

      if (!companyName) {
        return res.status(400).json({
          success: false,
          error: 'Company name is required. Please provide "name" as a query parameter.',
          example: 'GET /v1/company/resolve?name=google'
        });
      }

      // Clean the company name
      const cleanName = companyName.trim();

      // 1. Check if company exists in database
      const dbResults = await CompanyModel.findByNameOrDomain(cleanName);

      if (dbResults && dbResults.length > 0) {
        const existingCompany = dbResults[0];
        console.log('📦 Company found in database:', existingCompany.company_name);

        return res.json({
          success: true,
          data: {
            company_name: existingCompany.company_name,
            domain: existingCompany.domain
          }
        });
      }

      console.log('🔄 Company not found in database. Searching APIs sequentially...');

      let bestResult = null;
      let source = null;

      // 2. Try Clearout first
      console.log('📍 Step 1: Trying Clearout...');
      const clearoutResult = await fetchFromClearout(cleanName);

      if (clearoutResult && clearoutResult.domain && !clearoutResult.error) {
        if (clearoutResult.confidenceScore && clearoutResult.confidenceScore >= 70) {
          console.log('✅ Clearout found:', clearoutResult.domain, '(confidence:', clearoutResult.confidenceScore + ')');
          bestResult = {
            website: clearoutResult.website,
            domain: clearoutResult.domain,
            confidence: clearoutResult.confidenceScore
          };
          source = 'clearout';
        } else {
          console.log('⚠️ Clearout confidence too low:', clearoutResult.confidenceScore);
        }
      } else {
        console.log('❌ Clearout: No result found');
      }

      // 3. If Clearout didn't work, try Brandfetch
      if (!bestResult) {
        console.log('📍 Step 2: Trying Brandfetch...');
        const brandfetchResult = await fetchFromBrandfetch(cleanName);

        if (brandfetchResult && brandfetchResult.domain && !brandfetchResult.error) {
          console.log('✅ Brandfetch found:', brandfetchResult.domain);
          bestResult = {
            website: brandfetchResult.website,
            domain: brandfetchResult.domain,
            confidence: null
          };
          source = 'brandfetch';
        } else {
          console.log('❌ Brandfetch: No result found');
        }
      }

      // 4. If neither Clearout nor Brandfetch worked, try Tavily
      if (!bestResult) {
        console.log('📍 Step 3: Trying Tavily...');
        const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
        const tavilyResult = await fetchFromTavily(cleanName, TAVILY_API_KEY);

        if (tavilyResult && tavilyResult.domain && !tavilyResult.error) {
          console.log('✅ Tavily found:', tavilyResult.domain);
          bestResult = {
            website: tavilyResult.website,
            domain: tavilyResult.domain,
            confidence: null
          };
          source = 'tavily';
        } else {
          console.log('❌ Tavily: No result found');
        }
      }

      // If we found a domain, save to database and return
      if (bestResult && bestResult.domain) {
        try {
          await CompanyModel.create({
            company_name: cleanName,
            domain: bestResult.domain,
            reference: source
          });

          console.log('💾 Company saved to database:', {
            company_name: cleanName,
            domain: bestResult.domain,
            reference: source
          });
        } catch (saveError) {
          console.error('❌ Error saving company to database:', saveError);
          // Continue anyway - we still found the domain
        }

        return res.json({
          success: true,
          data: {
            company_name: cleanName,
            domain: bestResult.domain
          }
        });
      }

      // No domain found from any source
      return res.status(404).json({
        success: false,
        error: 'No domain found for this company',
        data: {
          company_name: cleanName,
          domain: null
        }
      });

    } catch (error) {
      console.error('❌ Error in resolve controller:', error);
      next(error);
    }
  }

  /**
   * Get all companies (with pagination)
   * GET /v1/company/all?limit=100&offset=0
   */
  async getAll(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;

      const companies = await CompanyModel.getAll(limit, offset);

      res.json({
        success: true,
        count: companies.length,
        data: companies
      });
    } catch (error) {
      console.error('❌ Error in getAll:', error);
      next(error);
    }
  }

  /**
   * Get company by ID
   * GET /v1/company/:id
   */
  async getById(req, res, next) {
    try {
      const id = parseInt(req.params.id);

      if (!id || isNaN(id)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid company ID'
        });
      }

      const companies = await CompanyModel.findByNameOrDomain(id.toString());

      if (!companies || companies.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Company not found'
        });
      }

      res.json({
        success: true,
        data: companies[0]
      });
    } catch (error) {
      console.error('❌ Error in getById:', error);
      next(error);
    }
  }
}

export default new CompanyController();