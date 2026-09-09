// src/helpers/searchHelpers.js
import { tavily } from '@tavily/core';

function findMainCompanyUrl(results, companyName) {
    if (!results || results.length === 0) return null;

    // 1. Prefer a result that looks like a root/homepage URL
    const rootSite = results.find(r => {
        try {
            const path = new URL(r.url).pathname;
            return path === '/' || path === '' || path === '/index.html';
        } catch { return false; }
    });
    if (rootSite) return rootSite.url;

    // 2. Find a URL containing the company name, but exclude common third-party sites
    const companyMatch = results.find(r => {
        try {
            const urlLower = r.url.toLowerCase();
            const companyLower = companyName.toLowerCase();
            const excludeTerms = ['wikipedia', 'wikimedia', 'help', 'support', 'blog', 'news', 'forum', 'community'];

            const hasCompanyName = urlLower.includes(companyLower);
            const hasExcludeTerm = excludeTerms.some(term => urlLower.includes(term));
            const isThirdParty = !urlLower.includes(companyLower + '.com') &&
                !urlLower.includes(companyLower + '.org') &&
                !urlLower.includes(companyLower + '.co') &&
                !urlLower.includes(companyLower + '.io');

            return hasCompanyName && !hasExcludeTerm && !isThirdParty;
        } catch { return false; }
    });
    if (companyMatch) return companyMatch.url;

    // 3. Fallback: Return the first result that isn't Wikipedia or a blog
    const fallback = results.find(r => {
        try {
            const urlLower = r.url.toLowerCase();
            return !urlLower.includes('wikipedia') &&
                !urlLower.includes('wikimedia') &&
                !urlLower.includes('blog') &&
                !urlLower.includes('help') &&
                !urlLower.includes('support');
        } catch { return false; }
    });

    return fallback ? fallback.url : results[0]?.url || null;
}

/**
 * Fetches and extracts the main website from Tavily.
 */
async function fetchFromTavily(companyName, apiKey) {
    try {
        const client = tavily({ apiKey });
        const response = await client.search(`"${companyName}" official website`, {
            includeAnswer: 'basic',
            searchDepth: 'basic'
        });

        let website = null;
        let domain = null;

        if (response.results && response.results.length > 0) {
            website = findMainCompanyUrl(response.results, companyName);
            if (website) {
                try {
                    const url = new URL(website);
                    domain = url.hostname.replace('www.', '');
                } catch (e) {
                    domain = website;
                }
            }
        }

        return {
            website,
            domain,
            answer: response.answer || null,
            rawResults: response.results || []
        };
    } catch (error) {
        console.error('Tavily API Error:', error);
        return { error: error.message };
    }
}

/**
 * Fetches and extracts brand information from Brandfetch.
 */
async function fetchFromBrandfetch(companyName) {
    try {
        const response = await fetch(`https://api.brandfetch.io/v2/search/${encodeURIComponent(companyName)}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            if (response.status === 404) {
                return { error: 'Brand not found' };
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        let website = null;
        let domain = null;
        let brandName = null;
        let icon = null;
        let logo = null;

        if (data && data.length > 0) {
            const firstResult = data[0];
            if (firstResult && firstResult.domain) {
                domain = firstResult.domain;
                website = `https://${domain}`;
                brandName = firstResult.name || null;
                icon = firstResult.icon || null;
                logo = firstResult.logo || null;
            }
        }

        return {
            website,
            domain,
            brandName,
            icon,
            logo,
            rawResponse: data
        };
    } catch (error) {
        console.error('Brandfetch API Error:', error);
        return { error: error.message };
    }
}

/**
 * Fetches and extracts domain information from Clearout Autocomplete API.
 */
async function fetchFromClearout(companyName) {
    try {
        const response = await fetch(
            `https://api.clearout.io/public/companies/autocomplete?query=${encodeURIComponent(companyName)}`,
            {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            }
        );

        if (!response.ok) {
            if (response.status === 429) {
                return { error: 'Rate limit exceeded. Please try again later.' };
            }
            if (response.status === 400) {
                return { error: 'Invalid request. Please check the company name.' };
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        let website = null;
        let domain = null;
        let confidenceScore = null;
        let logoUrl = null;
        let companyNameMatched = null;

        if (data.status === 'success' && data.data && data.data.length > 0) {
            const firstResult = data.data[0];
            if (firstResult && firstResult.domain) {
                domain = firstResult.domain;
                website = `https://${domain}`;
                confidenceScore = firstResult.confidence_score || null;
                logoUrl = firstResult.logo_url || null;
                companyNameMatched = firstResult.name || null;
            }
        }

        return {
            website,
            domain,
            confidenceScore,
            logoUrl,
            companyNameMatched,
            allResults: data.data || []
        };
    } catch (error) {
        console.error('Clearout API Error:', error);
        return { error: error.message };
    }
}

// --- Utility Functions for Domain Analysis ---

function isDealerOrPartner(domain, companyName) {
    if (!domain) return false;
    const domainLower = domain.toLowerCase();
    const companyLower = companyName.toLowerCase();

    const dealerKeywords = ['dealer', 'partner', 'reseller', 'distributor', 'franchise', 'peake', 'group', 'holdings', 'inc', 'corp', 'llc'];
    const hasDealerKeyword = dealerKeywords.some(keyword => domainLower.includes(keyword));

    const hasCompanyName = domainLower.includes(companyLower);

    if (hasDealerKeyword && !hasCompanyName) return true;

    const domainParts = domainLower.replace('www.', '').split('.')[0];
    const companyClean = companyLower.replace(/[^a-z0-9]/g, '');

    if (!domainParts.includes(companyClean) && !companyClean.includes(domainParts)) {
        const knownBrands = ['exa', 'notion', 'vercel', 'figma', 'linear', 'supabase', 'railway', 'fly', 'render'];
        if (knownBrands.some(brand => domainParts.includes(brand) || brand.includes(domainParts))) {
            return false;
        }
        return true;
    }

    return false;
}

function isThirdPartyDomain(domain) {
    if (!domain) return false;
    const domainLower = domain.toLowerCase();
    const thirdPartyKeywords = ['wikipedia', 'wikimedia', 'blog', 'news', 'forum', 'community', 'help', 'support', 'zapier', 'medium'];
    return thirdPartyKeywords.some(keyword => domainLower.includes(keyword));
}

function domainMatchesCompany(domain, companyName) {
    if (!domain || !companyName) return false;
    const domainLower = domain.toLowerCase();
    const companyClean = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const domainParts = domainLower.replace('www.', '').split('.')[0];
    return domainParts.includes(companyClean) || companyClean.includes(domainParts);
}

function scoreResult(result, companyName, source) {
    if (!result || !result.domain) return -1;

    let score = 0;
    const domain = result.domain;
    const confidence = result.confidenceScore || 0;

    switch (source) {
        case 'tavily':
            score = 70;
            break;
        case 'brandfetch':
            score = 60;
            break;
        case 'clearout':
            if (confidence >= 90) score = 90;
            else if (confidence >= 80) score = 70;
            else if (confidence >= 70) score = 50;
            else score = 30;
            break;
        default:
            score = 0;
    }

    if (domainMatchesCompany(domain, companyName)) {
        score += 30;
    }

    if (isDealerOrPartner(domain, companyName)) {
        score -= 40;
    }

    if (isThirdPartyDomain(domain)) {
        score -= 50;
    }

    const commonTLDs = ['.com', '.org', '.net', '.io', '.ai', '.app'];
    if (commonTLDs.some(tld => domain.includes(tld))) {
        score += 5;
    }

    return score;
}

function selectBestResult(tavilyResult, brandfetchResult, clearoutResult, companyName) {
    const results = [];

    if (tavilyResult && tavilyResult.domain && !tavilyResult.error) {
        results.push({
            source: 'tavily',
            website: tavilyResult.website,
            domain: tavilyResult.domain,
            confidence: null,
            score: scoreResult(tavilyResult, companyName, 'tavily')
        });
    }

    if (brandfetchResult && brandfetchResult.domain && !brandfetchResult.error) {
        results.push({
            source: 'brandfetch',
            website: brandfetchResult.website,
            domain: brandfetchResult.domain,
            confidence: null,
            score: scoreResult(brandfetchResult, companyName, 'brandfetch')
        });
    }

    if (clearoutResult && clearoutResult.domain && !clearoutResult.error) {
        results.push({
            source: 'clearout',
            website: clearoutResult.website,
            domain: clearoutResult.domain,
            confidence: clearoutResult.confidenceScore,
            score: scoreResult(clearoutResult, companyName, 'clearout')
        });
    }

    results.sort((a, b) => b.score - a.score);

    if (results.length > 0 && results[0].score > 0) {
        return results[0];
    }

    return null;
}

export {
    fetchFromTavily,
    fetchFromBrandfetch,
    fetchFromClearout,
    findMainCompanyUrl,
    isDealerOrPartner,
    isThirdPartyDomain,
    domainMatchesCompany,
    scoreResult,
    selectBestResult
};