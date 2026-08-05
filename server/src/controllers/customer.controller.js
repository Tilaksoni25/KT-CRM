const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const ChartOfAccount = require('../models/ChartOfAccount');
const customerService = require('../services/customer.service');
const coaService = require('../services/coa.service');
const bankAccountService = require('../services/bankAccount.service');

/**
 * POST /api/customer
 * Create a new customer
 */
const createCustomer = async (req, res, next) => {
  try {
    const {
      companyId,
      name,
      gstin,
      email,
      phone,
      billingAddress,
      shippingAddress,
      creditLimit,
      creditPeriodDays,
      openingBalance,
      openingBalanceType
    } = req.body;

    // Validate GSTIN format if provided
    if (gstin) {
      customerService.validateGstin(gstin);

      // Check for duplicate GSTIN within the same company for active customers
      const duplicate = await Customer.findOne({
        companyId,
        gstin: gstin.toUpperCase(),
        isActive: true
      });
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: 'Another active customer with the same GSTIN already exists'
        });
      }
    }

    // Auto-create/link corresponding COA ledger account under Sundry Debtors
    const coaAccountId = await customerService.createLinkedCoaAccount(companyId, name);

    const customer = await Customer.create({
      companyId,
      name,
      gstin: gstin ? gstin.toUpperCase() : null,
      email,
      phone,
      billingAddress,
      shippingAddress: shippingAddress || billingAddress,
      creditLimit,
      creditPeriodDays,
      coaAccountId,
      openingBalance,
      openingBalanceType,
      isActive: true
    });

    return res.status(201).json({
      success: true,
      data: customer
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/customer
 * List/search customers (paginated)
 */
const listCustomers = async (req, res, next) => {
  try {
    const { companyId, search, page, limit, includeInactive } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID query parameter is required'
      });
    }

    const filter = { companyId };
    
    if (includeInactive !== 'true') {
      filter.isActive = true;
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [
        { name: searchRegex },
        { gstin: searchRegex },
        { phone: searchRegex }
      ];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skipNum = (pageNum - 1) * limitNum;

    const total = await Customer.countDocuments(filter);
    const customers = await Customer.find(filter)
      .sort({ name: 1 })
      .skip(skipNum)
      .limit(limitNum)
      .lean();

    const totalPages = Math.ceil(total / limitNum);

    return res.status(200).json({
      success: true,
      data: customers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/customer/:id
 * Retrieve single customer details
 */
const getCustomerDetails = async (req, res, next) => {
  try {
    const customer = req.customer.toObject();

    const currentBalance = await coaService.getAccountBalance(customer.coaAccountId);

    return res.status(200).json({
      success: true,
      data: {
        ...customer,
        currentBalance
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/customer/:id
 * Update customer details
 */
const updateCustomer = async (req, res, next) => {
  try {
    const customer = req.customer; // loaded and cached by middleware
    const updates = req.body;

    // Reject changes to coaAccountId
    if ('coaAccountId' in updates) {
      return res.status(400).json({
        success: false,
        message: 'coaAccountId cannot be changed after creation'
      });
    }

    // Validate GSTIN if it is being changed
    if (updates.gstin !== undefined && updates.gstin !== customer.gstin) {
      if (updates.gstin) {
        customerService.validateGstin(updates.gstin);

        // Check for duplicate GSTIN within the same company for active customers
        const duplicate = await Customer.findOne({
          companyId: customer.companyId,
          gstin: updates.gstin.toUpperCase(),
          isActive: true,
          _id: { $ne: customer._id }
        });
        if (duplicate) {
          return res.status(409).json({
            success: false,
            message: 'Another active customer with the same GSTIN already exists'
          });
        }
        customer.gstin = updates.gstin.toUpperCase();
      } else {
        customer.gstin = null;
      }
    }

    // Update fields and sync to COA ledger
    if (updates.name !== undefined) {
      customer.name = updates.name;
      await ChartOfAccount.findByIdAndUpdate(customer.coaAccountId, { name: updates.name });
    }

    if (updates.email !== undefined) customer.email = updates.email;
    if (updates.phone !== undefined) customer.phone = updates.phone;
    if (updates.billingAddress !== undefined) customer.billingAddress = updates.billingAddress;
    if (updates.shippingAddress !== undefined) customer.shippingAddress = updates.shippingAddress;
    if (updates.creditLimit !== undefined) customer.creditLimit = updates.creditLimit;
    if (updates.creditPeriodDays !== undefined) customer.creditPeriodDays = updates.creditPeriodDays;

    if (updates.isActive !== undefined) {
      customer.isActive = updates.isActive;
      await ChartOfAccount.findByIdAndUpdate(customer.coaAccountId, { isActive: updates.isActive });
    }

    const saved = await customer.save();

    return res.status(200).json({
      success: true,
      data: saved
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/customer/:id
 * Deactivate/delete customer (always soft delete)
 */
const deactivateCustomer = async (req, res, next) => {
  try {
    const customer = req.customer; // loaded and cached by middleware

    // Soft delete to maintain historical integrity
    customer.isActive = false;
    await customer.save();

    // Sync active state to the linked COA account
    await ChartOfAccount.findByIdAndUpdate(customer.coaAccountId, { isActive: false });

    return res.status(200).json({
      success: true,
      message: 'Customer deactivated'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/customer/:id/ledger
 * Return ledger transaction history
 */
const getCustomerLedger = async (req, res, next) => {
  try {
    const customer = req.customer;
    const { from, to } = req.query;

    // Reuse getAccountLedger from bankAccount.service.js — it is generic to any coaAccountId
    const ledger = await bankAccountService.getAccountLedger(customer.coaAccountId, { from, to });

    return res.status(200).json({
      success: true,
      data: {
        customerId: customer._id,
        outstandingBalance: ledger.currentBalance,
        transactions: ledger.transactions
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/customer/:id/invoices
 * Return customer invoices list (placeholder)
 */
const getCustomerInvoices = async (req, res, next) => {
  try {
    const customer = req.customer;
    let invoices = [];

    // Fallback block to check if Invoice model exists, keeping it crash-proof before Module 8 is implemented
    try {
      if (mongoose.models.Invoice) {
        const Invoice = mongoose.model('Invoice');
        invoices = await Invoice.find({ customerId: customer._id }).lean();
      }
    } catch (err) {
      // noop
    }

    return res.status(200).json({
      success: true,
      data: invoices
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCustomer,
  listCustomers,
  getCustomerDetails,
  updateCustomer,
  deactivateCustomer,
  getCustomerLedger,
  getCustomerInvoices
};
