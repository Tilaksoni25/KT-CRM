const Tax = require('../models/Tax');
const gstService = require('../services/gst.service');
const { createTaxSchema, seedDefaultTaxSchema } = require('../validators/tax.validators');

/**
 * POST /api/tax
 * Create a new custom tax rate
 */
const createTax = async (req, res, next) => {
  try {
    const parsed = createTaxSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        details: parsed.error.errors
      });
    }

    const { companyId, name, ratePercent, taxCategory, hsnSacApplicable } = parsed.data;

    // Check duplicate name case-insensitive
    const duplicate = await Tax.findOne({
      companyId,
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: `Tax rate with name "${name}" already exists for this company.`,
        errorCode: 'DUPLICATE_TAX_NAME'
      });
    }

    const newTax = await Tax.create({
      companyId,
      name,
      ratePercent,
      taxCategory,
      hsnSacApplicable,
      isSystemTax: false,
      isActive: true
    });

    return res.status(201).json({
      success: true,
      data: newTax
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/tax?companyId=
 * List all active/inactive tax rates for a company, sorted by ratePercent ascending.
 */
const listTaxRates = async (req, res, next) => {
  try {
    const { companyId, includeInactive } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId query parameter is required',
        errorCode: 'COMPANY_ID_REQUIRED'
      });
    }

    const filter = { companyId };
    if (includeInactive !== 'true') {
      filter.isActive = true;
    }

    const taxRates = await Tax.find(filter).sort({ ratePercent: 1 });

    return res.status(200).json({
      success: true,
      data: taxRates
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/tax/seed-default
 * Seed the standard Indian GST rates for a new company
 */
const seedDefaultTax = async (req, res, next) => {
  try {
    const parsed = seedDefaultTaxSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        details: parsed.error.errors
      });
    }

    const { companyId } = parsed.data;

    try {
      const seededCount = await gstService.seedDefaultTaxRates(companyId);
      return res.status(201).json({
        success: true,
        message: `${seededCount} default tax rates seeded successfully`,
        data: { count: seededCount }
      });
    } catch (err) {
      if (err.statusCode === 409) {
        return res.status(409).json({
          success: false,
          message: err.message,
          errorCode: 'TAX_RATES_ALREADY_SEEDED'
        });
      }
      throw err;
    }
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createTax,
  listTaxRates,
  seedDefaultTax
};
