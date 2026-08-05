const Tax = require('../models/Tax');

const DEFAULT_TAX_TEMPLATES = [
  { name: 'GST 0%', ratePercent: 0, taxCategory: 'Taxable' },
  { name: 'GST 0.25%', ratePercent: 0.25, taxCategory: 'Taxable' },
  { name: 'GST 3%', ratePercent: 3, taxCategory: 'Taxable' },
  { name: 'GST 5%', ratePercent: 5, taxCategory: 'Taxable' },
  { name: 'GST 12%', ratePercent: 12, taxCategory: 'Taxable' },
  { name: 'GST 18%', ratePercent: 18, taxCategory: 'Taxable' },
  { name: 'GST 28%', ratePercent: 28, taxCategory: 'Taxable' },
  { name: 'Exempt', ratePercent: 0, taxCategory: 'Exempt' },
  { name: 'Nil Rated', ratePercent: 0, taxCategory: 'NilRated' }
];

const GST_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Validates a GSTIN's format and checksum using the official Indian GSTIN check-digit algorithm.
 * @param {string} gstin 
 * @returns {Object} { isValidFormat, isChecksumValid, isValid, stateCode, panEmbedded }
 */
const validateGstin = (gstin) => {
  if (!gstin || typeof gstin !== 'string') {
    return {
      isValidFormat: false,
      isChecksumValid: false,
      isValid: false,
      stateCode: null,
      panEmbedded: null
    };
  }

  const cleanGstin = gstin.trim().toUpperCase();
  const formatRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  const isValidFormat = formatRegex.test(cleanGstin);

  if (!isValidFormat) {
    return {
      gstin: cleanGstin,
      isValidFormat: false,
      isChecksumValid: false,
      isValid: false,
      stateCode: null,
      panEmbedded: null
    };
  }

  // Extract parts
  const stateCode = cleanGstin.substring(0, 2);
  const panEmbedded = cleanGstin.substring(2, 12);

  // Compute checksum
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const char = cleanGstin[i];
    const val = GST_CHARS.indexOf(char);
    if (val === -1) {
      // Should not happen since regex passed, but safety check
      return {
        gstin: cleanGstin,
        isValidFormat: true,
        isChecksumValid: false,
        isValid: false,
        stateCode,
        panEmbedded
      };
    }

    const factor = (i % 2 === 0) ? 1 : 2;
    let product = val * factor;
    if (product >= 36) {
      product = Math.floor(product / 36) + (product % 36);
    }
    sum += product;
  }

  const checksumValue = (36 - (sum % 36)) % 36;
  const expectedCheckChar = GST_CHARS[checksumValue];
  const actualCheckChar = cleanGstin[14];
  const isChecksumValid = expectedCheckChar === actualCheckChar;

  return {
    gstin: cleanGstin,
    isValidFormat: true,
    isChecksumValid,
    isValid: isChecksumValid,
    stateCode,
    panEmbedded
  };
};

/**
 * Seed the standard Indian GST slabs for a company.
 * @param {string} companyId 
 * @returns {Promise<number>} Number of seeded tax rates
 */
const seedDefaultTaxRates = async (companyId) => {
  // Idempotency check: Reject if default tax rates are already seeded
  const existingSystemTax = await Tax.findOne({ companyId, isSystemTax: true });
  if (existingSystemTax) {
    const err = new Error('Default tax rates already seeded for this company');
    err.statusCode = 409;
    throw err;
  }

  let seededCount = 0;
  for (const t of DEFAULT_TAX_TEMPLATES) {
    await Tax.create({
      companyId,
      name: t.name,
      ratePercent: t.ratePercent,
      taxCategory: t.taxCategory,
      hsnSacApplicable: true,
      isSystemTax: true,
      isActive: true
    });
    seededCount++;
  }

  return seededCount;
};

/**
 * Returns summary of GST inputs and outputs for returns filing.
 * Currently returns a zeroed-out shape as a placeholder until Module 8 & Module 10 exist.
 * @param {string} companyId 
 * @param {Object} range - { period, from, to }
 */
const getGstReturnsSummary = async (companyId, { period, from, to }) => {
  // TODO: aggregate output tax from Module 8 invoices and input tax from Module 10 purchases once they exist
  
  // Resolve period string
  let resolvedPeriod = period || 'custom';
  if (!period && from && to) {
    resolvedPeriod = `${from}_to_${to}`;
  } else if (!period) {
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    resolvedPeriod = `${yyyy}-${mm}`;
  }

  return {
    period: resolvedPeriod,
    outputTax: { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
    inputTax: { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
    netPayable: 0,
    breakdownByRate: []
  };
};

module.exports = {
  validateGstin,
  seedDefaultTaxRates,
  getGstReturnsSummary,
  DEFAULT_TAX_TEMPLATES
};
