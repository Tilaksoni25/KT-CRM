const Company = require('../models/Company');
const User = require('../models/User');

/**
 * POST /api/company 
 * Create a new company profile and link to creator
 */
const createCompany = async (req, res, next) => {
  try {
    const { name, gstin, pan, address, city, state, pincode, email, phone, logoUrl } = req.body;

    // Check for existing GSTIN or PAN conflicts
    const existingGstin = await Company.findOne({ gstin: gstin.toUpperCase() });
    if (existingGstin) {
      return res.status(409).json({
        success: false,
        message: 'A company with this GSTIN is already registered',
        errorCode: 'GSTIN_ALREADY_EXISTS'
      });
    }

    const existingPan = await Company.findOne({ pan: pan.toUpperCase() });
    if (existingPan) {
      return res.status(409).json({
        success: false,
        message: 'A company with this PAN is already registered',
        errorCode: 'PAN_ALREADY_EXISTS'
      });
    }

    // Create the company record
    const company = await Company.create({
      name,
      gstin: gstin.toUpperCase(),
      pan: pan.toUpperCase(),
      address,
      city,
      state,
      pincode,
      email,
      phone,
      logoUrl,
      createdBy: req.user._id
    });

    // Update creator's active company association
  req.user.companyId = company._id;
req.user.companyCreated = true;
req.user.branchCreated = false;
req.user.financialYearCreated = false;

await req.user.save();

const updatedUser = await User.findById(req.user._id);

console.log({
  companyId: updatedUser.companyId,
  companyCreated: updatedUser.companyCreated
});
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/company/:id
 * Retrieve details for a specific company
 */
const getCompanyDetails = async (req, res, next) => {
  try {
    // req.company is loaded and validated by checkCompanyAccess middleware
    return res.status(200).json({
      success: true,
      data: req.company
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/company/:id
 * Update company profile fields
 */
const updateCompany = async (req, res, next) => {
  try {
    const updates = req.body;
    const company = req.company; // loaded by middleware

    // Validate GSTIN/PAN uniqueness if they are being updated
    if (updates.gstin && updates.gstin.toUpperCase() !== company.gstin) {
      const gstinConflict = await Company.findOne({ gstin: updates.gstin.toUpperCase() });
      if (gstinConflict) {
        return res.status(409).json({
          success: false,
          message: 'A company with this GSTIN is already registered',
          errorCode: 'GSTIN_ALREADY_EXISTS'
        });
      }
      company.gstin = updates.gstin.toUpperCase();
    }

    if (updates.pan && updates.pan.toUpperCase() !== company.pan) {
      const panConflict = await Company.findOne({ pan: updates.pan.toUpperCase() });
      if (panConflict) {
        return res.status(409).json({
          success: false,
          message: 'A company with this PAN is already registered',
          errorCode: 'PAN_ALREADY_EXISTS'
        });
      }
      company.pan = updates.pan.toUpperCase();
    }

    // Update other allowed fields
    const allowedFields = ['name', 'address', 'city', 'state', 'pincode', 'email', 'phone', 'logoUrl'];
    allowedFields.forEach((field) => {
      if (updates[field] !== undefined) {
        company[field] = updates[field];
      }
    });

    await company.save();

    return res.status(200).json({
      success: true,
      data: company
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCompany,
  getCompanyDetails,
  updateCompany
};
