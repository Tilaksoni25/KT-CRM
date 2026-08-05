const gstService = require('../services/gst.service');
const { validateGstinSchema } = require('../validators/gst.validators');

/**
 * POST /api/gst/validate-gstin
 * Stateless utility to validate format and checksum of an Indian GSTIN
 */
const validateGstin = async (req, res, next) => {
  try {
    const parsed = validateGstinSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        details: parsed.error.errors
      });
    }

    const { gstin } = parsed.data;
    const result = gstService.validateGstin(gstin);

    // Return 200 with result details (never 500 for validation errors)
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/gst/returns-summary?companyId=
 * GST returns summary (GSTR-1/3B ready) placeholder
 */
const getGstReturnsSummary = async (req, res, next) => {
  try {
    const { companyId, period, from, to } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId query parameter is required',
        errorCode: 'COMPANY_ID_REQUIRED'
      });
    }

    const summary = await gstService.getGstReturnsSummary(companyId, { period, from, to });

    return res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  validateGstin,
  getGstReturnsSummary
};
