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
      console.log('🔍 Full URL:', req.originalUrl);
      console.log('🔍 Query params:', req.query);
      
      const companyName = req.query.name;

      console.log('🔍 Searching for company:', companyName);

      if (!companyName) {
        return res.status(400).json({
          success: false,
          error: 'Company name is required. Please provide "name" as a query parameter.',
          example: 'GET /v1/company/resolve?name=google',
          received: req.query
        });
      }

      // Clean the company name
      const cleanName = companyName.trim();

      // 1. Check if company exists in database
      const dbResults = await CompanyModel.findByNameOrDomain(cleanName);

      if (dbResults && dbResults.length > 0) {
        const existingCompany = dbResults[0];
        console.log('📦 Company found in database:', existingCompany);

        return res.json({
          success: true,
          fromDatabase: true,
          data: {
            id: existingCompany.id,
            company_name: existingCompany.company_name,
            domain: existingCompany.domain,
            created_at: existingCompany.created_at,
            reference: existingCompany.reference // Shows where it came from
          }
        });
      }

      console.log('🔄 Company not found in database. Searching APIs sequentially...');

      // 2. Try Clearout first
      console.log('📍 Step 1: Trying Clearout...');
      const clearoutResult = await fetchFromClearout(cleanName);
      
      let bestResult = null;
      let source = null;

      if (clearoutResult && clearoutResult.domain && !clearoutResult.error) {
        // Check if confidence score is high enough (>= 70)
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

      // Prepare response data
      const responseData = {
        success: true,
        fromDatabase: false,
        company_name: cleanName,
        sources_checked: {
          clearout: {
            found: !!(clearoutResult && clearoutResult.domain && !clearoutResult.error),
            domain: clearoutResult?.domain || null,
            confidence: clearoutResult?.confidenceScore || null
          },
          brandfetch: {
            found: !!(await fetchFromBrandfetch(cleanName)?.domain)
          },
          tavily: {
            found: !!(await fetchFromTavily(cleanName, process.env.TAVILY_API_KEY)?.domain)
          }
        }
      };

      // Note: The above sources_checked makes additional API calls. 
      // For production, you might want to store the results differently.

      if (bestResult && bestResult.domain) {
        // Save to database with reference = source
        try {
          const companyId = await CompanyModel.create({
            company_name: cleanName,
            domain: bestResult.domain,
            reference: source // Store where the data came from
          });

          console.log('💾 Company saved to database:', {
            id: companyId,
            company_name: cleanName,
            domain: bestResult.domain,
            reference: source
          });

          responseData.data = {
            id: companyId,
            company_name: cleanName,
            domain: bestResult.domain,
            reference: source, // Shows where it came from
            saved_to_database: true
          };

          responseData.best = {
            website: bestResult.website,
            domain: bestResult.domain,
            source: source,
            confidence: bestResult.confidence
          };

          return res.json(responseData);
        } catch (saveError) {
          console.error('❌ Error saving company to database:', saveError);
          responseData.data = {
            company_name: cleanName,
            domain: bestResult.domain,
            reference: source,
            saved_to_database: false,
            save_error: saveError.message
          };
          responseData.best = {
            website: bestResult.website,
            domain: bestResult.domain,
            source: source,
            confidence: bestResult.confidence
          };

          return res.json(responseData);
        }
      }

      // No domain found from any source
      responseData.message = 'No domain found for this company from any source';
      responseData.best = {
        website: null,
        domain: null,
        source: 'none',
        confidence: null
      };

      return res.json(responseData);

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