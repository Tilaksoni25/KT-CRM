const ledgerService = require('../services/ledger.service');

const getLedgerHistory = async (req, res, next) => {
  try {
    const data = await ledgerService.getLedgerHistory(req.params.accountId, req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const getLedgerBalance = async (req, res, next) => {
  try {
    const data = await ledgerService.getLedgerBalance(req.params.accountId, req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = { getLedgerHistory, getLedgerBalance };
