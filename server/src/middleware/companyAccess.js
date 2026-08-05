const Company = require('../models/Company');
const Branch = require('../models/Branch');
const FinancialYear = require('../models/FinancialYear');

/**
 * Middleware to enforce company-level data isolation.
 * Checks if the authenticated user has access to the target company's data.
 */
const checkCompanyAccess = async (req, res, next) => {
  try {
    let companyId = null;

    // Determine target companyId based on the route and request parameters
    if (req.params.id) {
      const baseUrl = req.baseUrl || '';
      
      if (baseUrl.includes('company')) {
        companyId = req.params.id;
      } else if (baseUrl.includes('branch')) {
        const branch = await Branch.findById(req.params.id);
        if (!branch) {
          return res.status(404).json({
            success: false,
            message: 'Branch not found',
            errorCode: 'BRANCH_NOT_FOUND'
          });
        }
        companyId = branch.companyId;
        req.branch = branch; // cache branch document
      } else if (baseUrl.includes('financial-year')) {
        const fy = await FinancialYear.findById(req.params.id);
        if (!fy) {
          return res.status(404).json({
            success: false,
            message: 'Financial year not found',
            errorCode: 'FINANCIAL_YEAR_NOT_FOUND'
          });
        }
        companyId = fy.companyId;
        req.financialYear = fy; // cache financialYear document
      } else if (baseUrl.includes('coa')) {
        const ChartOfAccount = require('../models/ChartOfAccount');
        const coa = await ChartOfAccount.findById(req.params.id);
        if (!coa) {
          return res.status(404).json({
            success: false,
            message: 'Account not found',
            errorCode: 'ACCOUNT_NOT_FOUND'
          });
        }
        companyId = coa.companyId;
        req.coa = coa; // cache coa document
      } else if (baseUrl.includes('bank-account')) {
        const BankAccount = require('../models/BankAccount');
        const bankAccount = await BankAccount.findById(req.params.id);
        if (!bankAccount) {
          return res.status(404).json({
            success: false,
            message: 'Bank account not found',
            errorCode: 'BANK_ACCOUNT_NOT_FOUND'
          });
        }
        companyId = bankAccount.companyId;
        req.bankAccount = bankAccount; // cache bankAccount document
      }
    } else {
      companyId = req.body.companyId || req.query.companyId;
    }

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID is required for access validation',
        errorCode: 'COMPANY_ID_REQUIRED'
      });
    }

    // Fetch the company to check the creator
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found',
        errorCode: 'COMPANY_NOT_FOUND'
      });
    }

    const isOwner = company.createdBy.toString() === req.user._id.toString();
    const isMember = req.user.companyId && req.user.companyId.toString() === company.id;

    if (!isOwner && !isMember) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have access to this company\'s data',
        errorCode: 'FORBIDDEN'
      });
    }

    // Attach company to the request object for downstream controllers
    req.company = company;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = checkCompanyAccess;
