// src/helpers/logoFetchHelper.js
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { URL } from 'url';

/**
 * Downloads an image from a URL and saves it to a file path.
 * Handles redirects properly.
 */
function downloadImage(url, filepath, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects === 0) {
      reject(new Error('Too many redirects'));
      return;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (err) {
      reject(new Error(`Invalid URL: ${url}`));
      return;
    }

    const client = parsedUrl.protocol === 'https:' ? https : http;

    const request = client.get(parsedUrl, (response) => {
      // Handle redirects (301, 302, 307, 308)
      if ([301, 302, 307, 308].includes(response.statusCode)) {
        const redirectLocation = response.headers.location;
        if (!redirectLocation) {
          reject(new Error(`Redirect without location header from ${url}`));
          return;
        }

        const redirectUrl = new URL(redirectLocation, url).toString();
        console.log(`↪️  Following redirect to: ${redirectUrl}`);

        if (redirectUrl.includes('/overview') || redirectUrl.includes('docs')) {
          reject(new Error(`Redirected to a non-image page: ${redirectUrl}`));
          return;
        }

        response.destroy();
        downloadImage(redirectUrl, filepath, maxRedirects - 1).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
        return;
      }

      const contentType = response.headers['content-type'] || '';
      if (!contentType.startsWith('image/')) {
        reject(new Error(`URL did not return an image. Content-Type: ${contentType}`));
        return;
      }

      const file = fs.createWriteStream(filepath);
      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        fs.unlink(filepath, () => {});
        reject(err);
      });
    });

    request.on('error', (err) => {
      fs.unlink(filepath, () => {});
      reject(err);
    });

    request.setTimeout(15000, () => {
      request.destroy();
      fs.unlink(filepath, () => {});
      reject(new Error(`Request timed out for ${url}`));
    });
  });
}

/**
 * Checks if a URL is a valid, accessible image before returning it.
 */
function validateImageUrl(url, maxRedirects = 5) {
  return new Promise((resolve) => {
    if (maxRedirects === 0) {
      resolve(false);
      return;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (err) {
      resolve(false);
      return;
    }

    const client = parsedUrl.protocol === 'https:' ? https : http;

    const request = client.get(parsedUrl, (response) => {
      if ([301, 302, 307, 308].includes(response.statusCode)) {
        const redirectLocation = response.headers.location;
        if (!redirectLocation) {
          response.destroy();
          resolve(false);
          return;
        }

        const redirectUrl = new URL(redirectLocation, url).toString();

        if (redirectUrl.includes('/overview') || redirectUrl.includes('docs') || redirectUrl.includes('brandfetch.com/')) {
          response.destroy();
          resolve(false);
          return;
        }

        response.destroy();
        validateImageUrl(redirectUrl, maxRedirects - 1).then(resolve);
        return;
      }

      const contentType = response.headers['content-type'] || '';
      const isValid = response.statusCode === 200 && contentType.startsWith('image/');
      response.destroy();
      resolve(isValid);
    });

    request.on('error', () => resolve(false));
    request.setTimeout(8000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

/**
 * Fetches a company logo using a fallback chain:
 * Brandfetch → BrandIcons → Hunter → Logo.dev
 */
async function fetchLogo(domain, type = 'logo') {
  if (!domain) {
    return { error: 'Domain is required to fetch a logo' };
  }

  const cleanDomain = domain
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .trim();

  console.log(`🎨 Fetching ${type} for domain: ${cleanDomain}`);

  // --- 1. Try Brandfetch ---
  try {
    const clientId = process.env.BRANDFETCH_CLIENT_ID;
    if (clientId) {
      const brandfetchUrl = `https://cdn.brandfetch.io/domain/${cleanDomain}/w/400/h/400/type/${type}?c=${clientId}`;
      console.log('📍 Trying Brandfetch:', brandfetchUrl);
      const isValid = await validateImageUrl(brandfetchUrl);
      if (isValid) {
        return { logoUrl: brandfetchUrl, source: 'brandfetch' };
      }
      console.log('❌ Brandfetch returned no valid image');
    } else {
      console.log('⚠️ BRANDFETCH_CLIENT_ID not set, skipping Brandfetch');
    }
  } catch (error) {
    console.error('Brandfetch error:', error.message);
  }

  // --- 2. Try BrandIcons ---
  try {
    const brandIconsKey = process.env.BRANDICONS_API_KEY;
    if (brandIconsKey) {
      const brandIconsUrl = `https://api.brandicons.dev/v1/icon?domain=${cleanDomain}&size=medium&key=${brandIconsKey}`;
      console.log('📍 Trying BrandIcons:', brandIconsUrl);
      const isValid = await validateImageUrl(brandIconsUrl);
      if (isValid) {
        return { logoUrl: brandIconsUrl, source: 'brandicons' };
      }
      console.log('❌ BrandIcons returned no valid image');
    } else {
      console.log('⚠️ BRANDICONS_API_KEY not set, skipping BrandIcons');
    }
  } catch (error) {
    console.error('BrandIcons error:', error.message);
  }

  // --- 3. Try Hunter ---
  try {
    const hunterUrl = `https://logos.hunter.io/${cleanDomain}`;
    console.log('📍 Trying Hunter:', hunterUrl);
    const isValid = await validateImageUrl(hunterUrl);
    if (isValid) {
      return { logoUrl: hunterUrl, source: 'hunter' };
    }
    console.log('❌ Hunter returned no valid image');
  } catch (error) {
    console.error('Hunter error:', error.message);
  }

  // --- 4. Try Logo.dev ---
  try {
    const logoDevSecretKey = process.env.LOGO_DEV_SECRET_KEY;
    if (logoDevSecretKey) {
      const logoDevUrl = `https://img.logo.dev/${cleanDomain}?token=${logoDevSecretKey}&format=png&size=400&fallback=monogram`;
      console.log('📍 Trying Logo.dev:', logoDevUrl);
      const isValid = await validateImageUrl(logoDevUrl);
      if (isValid) {
        return { logoUrl: logoDevUrl, source: 'logo.dev' };
      }
      console.log('❌ Logo.dev returned no valid image');
    } else {
      console.log('⚠️ LOGO_DEV_SECRET_KEY not set, skipping Logo.dev');
    }
  } catch (error) {
    console.error('Logo.dev error:', error.message);
  }

  return { error: 'No logo found from any source' };
}

/**
 * Saves a logo image to a local folder.
 */
async function saveLogoLocally(companyName, logoUrl, type = 'logo') {
  try {
    const folder = type === 'favicon' ? 'favicon' : 'logo';
    const safeName = companyName.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    let extension = 'png';
    try {
      const urlPath = new URL(logoUrl).pathname;
      const extMatch = urlPath.match(/\.(png|jpg|jpeg|svg|webp|gif|ico)$/i);
      if (extMatch) {
        extension = extMatch[1].toLowerCase();
      }
    } catch (e) {
      // Keep default
    }

    const filename = `${safeName}.${extension}`;
    const uploadDir = path.join(process.cwd(), 'images', folder);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filepath = path.join(uploadDir, filename);

    await downloadImage(logoUrl, filepath);
    console.log(`💾 ${type} saved: ${filepath}`);

    return {
      saved: true,
      path: `images/${folder}/${filename}`,
      filename,
      fullPath: filepath
    };
  } catch (error) {
    console.error(`❌ Error saving ${type} locally:`, error.message);
    return {
      saved: false,
      error: error.message
    };
  }
}

export {
  fetchLogo,
  downloadImage,
  validateImageUrl,
  saveLogoLocally
};