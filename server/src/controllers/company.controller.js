const Company = require('../models/Company');
const User = require('../models/User');
const { shapeOnboardingUser, determineNextStep } = require('../utils/onboarding');

/**
 * POST /api/company 
 * Create a new company profile and link to creator
 */
const createCompany = async (req, res, next) => {
  const session = await Company.startSession();
  let transactionStarted = false;

  try {
    try {
      await session.startTransaction();
      // Probe a simple query using the started transaction. Some MongoDB
      // setups (like standalone servers or mongodb-memory-server default)
      // report support only when a command is first issued in the transaction.
      await Company.findOne().session(session);
      transactionStarted = true;
    } catch (startErr) {
      if (!startErr.message.includes('Transaction numbers are only allowed on a replica set member or mongos')) {
        throw startErr;
      }
      transactionStarted = false;
      try {
        await session.abortTransaction();
      } catch (ignore) {
        // Best-effort cleanup when transaction support is unavailable.
      }
    }

    const sessionOpts = transactionStarted ? { session } : {};

    // Use authoritative DB check instead of relying on potentially stale
    // `req.user.companyCreated` flag. This avoids false positives when the
    // company document was removed directly from the DB or flags are out-of-sync.
    const existingCompany = transactionStarted
      ? await Company.findOne({ createdBy: req.user._id }).session(session)
      : await Company.findOne({ createdBy: req.user._id });
    if (existingCompany) {
      if (transactionStarted) await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Company has already been created for this user',
        errorCode: 'COMPANY_ALREADY_CREATED'
      });
    }

    const { name, gstin, pan, address, city, state, pincode, email, phone, logoUrl } = req.body;

    // Check for existing GSTIN or PAN conflicts
    const existingGstin = transactionStarted
      ? await Company.findOne({ gstin: gstin.toUpperCase() }).session(session)
      : await Company.findOne({ gstin: gstin.toUpperCase() });
    if (existingGstin) {
      if (transactionStarted) await session.abortTransaction();
      return res.status(409).json({
        success: false,
        message: 'A company with this GSTIN is already registered',
        errorCode: 'GSTIN_ALREADY_EXISTS'
      });
    }

    const existingPan = transactionStarted
      ? await Company.findOne({ pan: pan.toUpperCase() }).session(session)
      : await Company.findOne({ pan: pan.toUpperCase() });
    if (existingPan) {
      if (transactionStarted) await session.abortTransaction();
      return res.status(409).json({
        success: false,
        message: 'A company with this PAN is already registered',
        errorCode: 'PAN_ALREADY_EXISTS'
      });
    }

    const [company] = await Company.create([
      {
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
      }
    ], sessionOpts);

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        companyId: company._id,
        companyCreated: true,
        branchCreated: false,
        financialYearCreated: false,
        branchId: null,
        financialYearId: null
      },
      { new: true, ...sessionOpts }
    );

    if (transactionStarted) {
      await session.commitTransaction();
    }

    return res.status(201).json({
      success: true,
      data: {
        ...company.toObject(),
        user: shapeOnboardingUser(updatedUser),
        nextStep: determineNextStep(updatedUser)
      }
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await session.abortTransaction();
      } catch (ignore) {
        // Ignore abort errors when transaction support is unavailable.
      }
    }
    next(error);
  } finally {
    await session.endSession();
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
